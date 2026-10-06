/**
 * Keš modela i otisak izvršnog koda sa CDN-a (K30, nalaz K29-04): izmenjen JS/WASM
 * se ne vraća pozivaocu ni ne upisuje u keš, a otrovan unos u kešu se briše i fajl
 * se preuzima ponovo.
 */

import { createHash } from "node:crypto";

import { afterEach, describe, expect, test, vi } from "vitest";

const CODE_URL = "https://cdn.test/lib@1.0.0/kod.js";
const GOOD = "export default 1;";

vi.mock("./models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./models")>()),
  CDN_CODE_SHA256: { [CODE_URL]: createHash("sha256").update(GOOD).digest("base64") },
}));

const { fetchModelFile } = await import("./cache");

function fakeCache(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial).map(([url, text]) => [url, new Blob([text])]));
  const cache = {
    match: async (url: string) => (store.has(url) ? new Response(store.get(url)) : undefined),
    put: async (url: string, response: Response) => void store.set(url, await response.blob()),
    delete: async (url: string) => store.delete(url),
  };
  vi.stubGlobal("caches", { open: async () => cache });
  return store;
}

function serve(text: string) {
  const fetchMock = vi.fn(async () => new Response(text));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchModelFile i otisak koda", () => {
  test("ispravan kod sa CDN-a se vraća i pamti", async () => {
    const store = fakeCache();
    serve(GOOD);
    expect(await (await fetchModelFile(CODE_URL)).text()).toBe(GOOD);
    expect(await store.get(CODE_URL)?.text()).toBe(GOOD);
  });

  test("izmenjen kod sa CDN-a → INTEGRITY, ništa se ne pamti", async () => {
    const store = fakeCache();
    serve("alert('otrov')");
    await expect(fetchModelFile(CODE_URL)).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(store.has(CODE_URL)).toBe(false);
  });

  test("otrovan unos u kešu se briše i fajl se preuzima ponovo", async () => {
    const store = fakeCache({ [CODE_URL]: "alert('otrov')" });
    const fetchMock = serve(GOOD);
    expect(await (await fetchModelFile(CODE_URL)).text()).toBe(GOOD);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await store.get(CODE_URL)?.text()).toBe(GOOD);
  });

  test("ispravan unos u kešu se vraća bez mreže; fajl van registra (težine modela) se ne proverava", async () => {
    fakeCache({ [CODE_URL]: GOOD, "https://cdn.test/model.onnx": "bilo šta" });
    const fetchMock = serve("ne sme");
    expect(await (await fetchModelFile(CODE_URL)).text()).toBe(GOOD);
    expect(await (await fetchModelFile("https://cdn.test/model.onnx")).text()).toBe("bilo šta");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
