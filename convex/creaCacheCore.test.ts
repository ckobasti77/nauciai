import { expect, test } from "vitest";

import { isReusableJob, requestHash, stableStringify } from "./creaCacheCore";

const base = {
  modelSlug: "nano-banana-2",
  inputMode: "text",
  params: { prompt: "mačka na krovu", resolution: "1K", aspect_ratio: "1:1" },
  inputShas: {},
};

test("isti zahtev daje isti otisak, bez obzira na redosled ključeva", () => {
  expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
  expect(requestHash(base)).toBe(
    requestHash({ ...base, params: { aspect_ratio: "1:1", resolution: "1K", prompt: "mačka na krovu" } }),
  );
});

test("drugi model, režim, parametar ili ulaz daje drugi otisak", () => {
  const hash = requestHash(base);
  expect(requestHash({ ...base, modelSlug: "nano-banana-pro" })).not.toBe(hash);
  expect(requestHash({ ...base, inputMode: "image_multi" })).not.toBe(hash);
  expect(requestHash({ ...base, params: { ...base.params, resolution: "2K" } })).not.toBe(hash);
  expect(requestHash({ ...base, params: { ...base.params, prompt: "mačka na krovu." } })).not.toBe(hash);
  const withInput = requestHash({ ...base, inputShas: { image: ["abc"] } });
  expect(withInput).not.toBe(hash);
  expect(requestHash({ ...base, inputShas: { image: ["abd"] } })).not.toBe(withInput);
  // Redosled ulaza menja rezultat (prva slika je glavna).
  expect(requestHash({ ...base, inputShas: { image: ["a", "b"] } })).not.toBe(
    requestHash({ ...base, inputShas: { image: ["b", "a"] } }),
  );
});

test("seme i serverski brojači ne ulaze u otisak; prazan slot je isto što i nijedan", () => {
  const hash = requestHash(base);
  expect(requestHash({ ...base, params: { ...base.params, seed: 42, input_images: 0 } })).toBe(hash);
  expect(requestHash({ ...base, inputShas: { image: [] } })).toBe(hash);
});

test("ponuditi se sme samo gotov, sopstveni, pravi rad sa izlazom koji još postoji", () => {
  const job = {
    userId: "u1",
    status: "done",
    provider: "google",
    outputStorageId: "s1",
    isMock: false,
  };
  const now = 1_000;

  expect(isReusableJob(job, "u1", now)).toBe(true);
  expect(isReusableJob(job, "u2", now)).toBe(false);
  expect(isReusableJob({ ...job, status: "running" }, "u1", now)).toBe(false);
  expect(isReusableJob({ ...job, status: "refunded" }, "u1", now)).toBe(false);
  expect(isReusableJob({ ...job, isMock: true }, "u1", now)).toBe(false);
  expect(isReusableJob({ ...job, provider: "local" }, "u1", now)).toBe(false);
  expect(isReusableJob({ ...job, outputStorageId: undefined }, "u1", now)).toBe(false);
  expect(isReusableJob({ ...job, expiresAt: 999 }, "u1", now)).toBe(false);
  expect(isReusableJob({ ...job, expiresAt: 2_000 }, "u1", now)).toBe(true);
});
