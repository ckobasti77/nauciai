"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

const MAX_URL_LENGTH = 2_048;
const MAX_HTML_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

type AuthorizedPreview = {
  conversationId: Id<"chatConversations">;
  existing: null | {
    status: "pending" | "ready" | "failed";
    normalizedUrl: string;
    title?: string;
    description?: string;
    imageUrl?: string;
  };
};

const authorizePreviewRef = makeFunctionReference<
  "query",
  { userId: Id<"users">; messageId: Id<"chatMessages">; url: string },
  AuthorizedPreview
>("chatLinkPreviewData:authorizePreview");

const savePreviewResultRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    messageId: Id<"chatMessages">;
    url: string;
    normalizedUrl: string;
    status: "ready" | "failed";
    title?: string;
    description?: string;
    imageUrl?: string;
    failureReason?: string;
  },
  Id<"chatLinkPreviews">
>("chatLinkPreviewData:savePreviewResult");

function normalizeUrl(value: string) {
  if (value.length > MAX_URL_LENGTH) throw new Error("INVALID_URL");
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("INVALID_URL");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("UNSAFE_URL");
  }
  url.hash = "";
  return url;
}

function isPrivateIpv4(address: string) {
  const bytes = address.split(".").map(Number);
  if (bytes.length !== 4 || bytes.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = bytes;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateIp(address: string) {
  const lower = address.toLowerCase().split("%")[0];
  if (isIP(lower) === 4) return isPrivateIpv4(lower);
  if (isIP(lower) !== 6) return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPrivateIpv4(mapped);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff") ||
    lower.startsWith("2001:db8:")
  );
}

async function resolvePublicAddress(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home")
  ) {
    throw new Error("UNSAFE_URL");
  }
  const directFamily = isIP(hostname);
  const addresses = directFamily
    ? [{ address: hostname, family: directFamily }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("UNSAFE_URL");
  }
  return addresses[0];
}

type PageResponse = { status: number; location?: string; html?: string };

async function requestHtml(url: URL): Promise<PageResponse> {
  const resolved = await resolvePublicAddress(url);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: resolved.address,
        family: resolved.family,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isIP(url.hostname) ? undefined : url.hostname,
        headers: {
          Host: url.host,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
          "User-Agent": "NauciAI-LinkPreview/1.0",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ status, location: response.headers.location });
          return;
        }
        const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
        const contentLength = Number(response.headers["content-length"] ?? 0);
        if (status < 200 || status >= 300 || !contentType.includes("text/html") || contentLength > MAX_HTML_BYTES) {
          response.resume();
          reject(new Error("UNSUPPORTED_PREVIEW"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_HTML_BYTES) {
            request.destroy(new Error("PREVIEW_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, html: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error("PREVIEW_TIMEOUT")));
    request.on("error", reject);
    request.end();
  });
}

async function loadHtml(initialUrl: URL) {
  let current = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestHtml(current);
    if (response.html !== undefined) return { html: response.html, finalUrl: current };
    if (!response.location || redirect === MAX_REDIRECTS) throw new Error("INVALID_REDIRECT");
    current = normalizeUrl(new URL(response.location, current).toString());
  }
  throw new Error("INVALID_REDIRECT");
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanText(value: string | undefined, limit: number) {
  if (!value) return undefined;
  const cleaned = decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function metaContent(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
    }
    if ((attrs.get("property") ?? attrs.get("name"))?.toLowerCase() === key.toLowerCase()) {
      return attrs.get("content");
    }
  }
  return undefined;
}

function previewMetadata(html: string, fallbackUrl: URL) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: cleanText(metaContent(html, "og:title") ?? titleMatch ?? fallbackUrl.hostname, 200),
    description: cleanText(
      metaContent(html, "og:description") ?? metaContent(html, "description"),
      500,
    ),
  };
}

export const requestLinkPreview = action({
  args: { messageId: v.id("chatMessages"), url: v.string() },
  handler: async (ctx, args) => {
    const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
    if (!userId) throw new Error("Unauthorized");
    const normalized = normalizeUrl(args.url);
    const authorized = await ctx.runQuery(authorizePreviewRef, { userId, ...args });
    if (
      authorized.existing?.status === "ready" &&
      authorized.existing.normalizedUrl === normalized.toString()
    ) {
      return authorized.existing;
    }
    try {
      const { html, finalUrl } = await loadHtml(normalized);
      const metadata = previewMetadata(html, finalUrl);
      await ctx.runMutation(savePreviewResultRef, {
        userId,
        ...args,
        normalizedUrl: normalized.toString(),
        status: "ready",
        ...metadata,
      });
      return { status: "ready" as const, normalizedUrl: normalized.toString(), ...metadata };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message.slice(0, 80) : "PREVIEW_FAILED";
      await ctx.runMutation(savePreviewResultRef, {
        userId,
        ...args,
        normalizedUrl: normalized.toString(),
        status: "failed",
        failureReason,
      });
      return { status: "failed" as const, normalizedUrl: normalized.toString() };
    }
  },
});
