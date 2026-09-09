import { expect, test } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { PROMPT_NAMES, promptProvider } from "./prompts";
import { handleMcpRequest, JSON_RPC_ERROR, type JsonRpcResponse, type McpServerOptions } from "./protocol";
import { bindTools, type McpPrincipal } from "./tools";

/**
 * Promptovi su statičan tekst bez Convex zavisnosti - testiraju se na
 * protokolskom sloju, kao `protocol.test.ts`; put kroz `/mcp` pokriva
 * `initialize` test u `resources.test.ts`.
 */

const principal: McpPrincipal = {
  keyId: "key_1" as Id<"mcpApiKeys">,
  userId: "user_1" as Id<"users">,
  email: "jovan@example.com",
  keyName: "Claude Desktop",
  scopes: ["mcp:read"],
};

const options: McpServerOptions = {
  serverInfo: { name: "nauciai", version: "0.1.0" },
  tools: bindTools({ principal, convex: {} as ActionCtx }),
  prompts: promptProvider,
};

function request(method: string, params?: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params === undefined ? {} : { params }) });
}

async function single(method: string, params?: unknown): Promise<JsonRpcResponse> {
  const result = await handleMcpRequest(request(method, params), options);
  if (result === null || Array.isArray(result)) throw new Error("očekivan jedan odgovor");

  return result;
}

function resultOf(response: JsonRpcResponse) {
  if (!("result" in response)) throw new Error(`očekivan rezultat, dobijeno ${JSON.stringify(response)}`);

  return response.result as Record<string, unknown>;
}

function errorOf(response: JsonRpcResponse) {
  if (!("error" in response)) throw new Error("očekivana greška");

  return response.error;
}

type PromptEntry = { name: string; title?: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> };

function messageText(result: Record<string, unknown>): string {
  const messages = result.messages as Array<{ role: string; content: { type: string; text: string } }>;
  expect(messages).toHaveLength(1);
  expect(messages[0].role).toBe("user");
  expect(messages[0].content.type).toBe("text");

  return messages[0].content.text;
}

test("initialize sa prompts provajderom prijavljuje prompts, bez resources kad ih nema", async () => {
  const { capabilities } = resultOf(await single("initialize", { protocolVersion: "2025-06-18" }));
  expect(capabilities).toEqual({ tools: {}, prompts: {} });
  expect(errorOf(await single("resources/list")).code).toBe(JSON_RPC_ERROR.METHOD_NOT_FOUND);
});

test("prompts/list vraća tačno tri prompta, svaki sa opisom i opisanim argumentima", async () => {
  const { prompts } = resultOf(await single("prompts/list")) as { prompts: PromptEntry[] };

  expect(prompts.map((prompt) => prompt.name)).toEqual(["napravi-sliku", "slika-u-video", "pregled-poslova"]);
  expect(PROMPT_NAMES).toHaveLength(3);
  for (const prompt of prompts) {
    expect(prompt.description?.length ?? 0, prompt.name).toBeGreaterThan(0);
    expect(prompt.arguments?.length ?? 0, prompt.name).toBeGreaterThan(0);
    for (const argument of prompt.arguments ?? []) {
      expect(argument.description?.length ?? 0, `${prompt.name}.${argument.name}`).toBeGreaterThan(0);
      expect(typeof argument.required).toBe("boolean");
    }
    expect(prompt).not.toHaveProperty("build");
  }

  const byName = Object.fromEntries(prompts.map((prompt) => [prompt.name, prompt]));
  expect(byName["napravi-sliku"].arguments?.map((argument) => [argument.name, argument.required])).toEqual([
    ["opis", true],
    ["stil", false],
  ]);
  expect(byName["slika-u-video"].arguments?.map((argument) => [argument.name, argument.required])).toEqual([["opis pokreta", true]]);
  expect(byName["pregled-poslova"].arguments?.map((argument) => [argument.name, argument.required])).toEqual([["koliko", false]]);
});

test("prompts/get sa nepoznatim imenom ili bez imena -> -32602", async () => {
  expect(errorOf(await single("prompts/get", { name: "nema-takvog" })).code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
  expect(errorOf(await single("prompts/get", {})).code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
  expect(errorOf(await single("prompts/get", { name: "constructor" })).code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
});

test("prompts/get napravi-sliku bez obaveznog `opis` -> -32602; prazan string je isto što i odsutan", async () => {
  expect(errorOf(await single("prompts/get", { name: "napravi-sliku" })).code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
  expect(errorOf(await single("prompts/get", { name: "napravi-sliku", arguments: {} })).code).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
  expect(errorOf(await single("prompts/get", { name: "napravi-sliku", arguments: { opis: "  " } })).code).toBe(
    JSON_RPC_ERROR.INVALID_PARAMS,
  );
  // Vrednosti argumenata su stringovi po spec-u.
  expect(errorOf(await single("prompts/get", { name: "napravi-sliku", arguments: { opis: 42 } })).code).toBe(
    JSON_RPC_ERROR.INVALID_PARAMS,
  );
});

test("prompts/get napravi-sliku upućuje na nauciai://models, kredite i create_generation, sa opisom i stilom", async () => {
  const result = resultOf(await single("prompts/get", { name: "napravi-sliku", arguments: { opis: "lisica u snegu", stil: "akvarel" } }));
  const text = messageText(result);

  expect(typeof result.description).toBe("string");
  expect(text).toContain("lisica u snegu");
  expect(text).toContain("akvarel");
  expect(text).toContain("nauciai://models");
  expect(text).toContain("nauciai://credits");
  expect(text).toContain("create_generation");

  const bezStila = messageText(resultOf(await single("prompts/get", { name: "napravi-sliku", arguments: { opis: "lisica" } })));
  expect(bezStila).not.toContain("Željeni stil");
});

test("prompts/get slika-u-video vodi kroz ceo upload i generation lanac", async () => {
  const text = messageText(
    resultOf(await single("prompts/get", { name: "slika-u-video", arguments: { "opis pokreta": "kamera polako kruži" } })),
  );

  expect(text).toContain("kamera polako kruži");
  for (const tool of ["create_upload_url", "register_upload", "create_generation", "wait_for_job", "get_output_url"]) {
    expect(text).toContain(tool);
  }
  expect(text).toContain("POST");
  expect(text).toContain("Content-Type");
});

test("prompts/get pregled-poslova: podrazumevano 10, `koliko` se poštuje, neispravan `koliko` -> -32602", async () => {
  expect(messageText(resultOf(await single("prompts/get", { name: "pregled-poslova" })))).toContain("limit 10");
  expect(messageText(resultOf(await single("prompts/get", { name: "pregled-poslova", arguments: { koliko: "25" } })))).toContain(
    "limit 25",
  );

  for (const koliko of ["0", "51", "pet", "2.5", ""]) {
    const response = await single("prompts/get", { name: "pregled-poslova", arguments: { koliko } });
    if (koliko === "") {
      // Prazan opcioni argument = odsutan.
      expect(messageText(resultOf(response))).toContain("limit 10");
      continue;
    }
    expect(errorOf(response).code, koliko).toBe(JSON_RPC_ERROR.INVALID_PARAMS);
  }
});
