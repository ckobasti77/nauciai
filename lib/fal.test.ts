import { afterEach, describe, expect, it, vi } from "vitest";

import { buildQueueUrl, submitToFal } from "./fal";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildQueueUrl", () => {
  it("encodes the webhook URL and does not create a double question mark", () => {
    const url = buildQueueUrl(
      "fal-ai/veo3.1/lite",
      "https://quick-yak-270.convex.site/fal/webhook?foo=bar",
    );

    expect(url).toBe(
      `https://queue.fal.run/fal-ai/veo3.1/lite?fal_webhook=${encodeURIComponent(
        "https://quick-yak-270.convex.site/fal/webhook?foo=bar",
      )}`,
    );
    expect(url.match(/\?/g)).toHaveLength(1);
  });

  it("keeps the endpoint unencoded but escapes the webhook URL's own slashes", () => {
    const url = buildQueueUrl("fal-ai/flux-2/flash", "https://example.convex.site/fal/webhook");

    expect(url.startsWith("https://queue.fal.run/fal-ai/flux-2/flash?fal_webhook=")).toBe(true);
    expect(url).not.toContain("fal_webhook=https://example.convex.site/fal/webhook");
  });
});

describe("submitToFal", () => {
  it("returns the requestId on success", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(
        `https://queue.fal.run/fal-ai/veo3.1/lite?fal_webhook=${encodeURIComponent(
          "https://example.convex.site/fal/webhook",
        )}`,
      );
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Key test-key");
      expect(JSON.parse(init.body as string)).toEqual({ prompt: "a fox" });

      return {
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ request_id: "req_123", gateway_request_id: "gw_456" }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitToFal({
      endpoint: "fal-ai/veo3.1/lite",
      input: { prompt: "a fox" },
      webhookUrl: "https://example.convex.site/fal/webhook",
      apiKey: "test-key",
    });

    expect(result).toEqual({ requestId: "req_123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws with the response body when fal returns a non-2xx status", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "invalid input" }),
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitToFal({
        endpoint: "fal-ai/veo3.1/lite",
        input: {},
        webhookUrl: "https://example.convex.site/fal/webhook",
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/422/);

    await expect(
      submitToFal({
        endpoint: "fal-ai/veo3.1/lite",
        input: {},
        webhookUrl: "https://example.convex.site/fal/webhook",
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/invalid input/);
  });
});
