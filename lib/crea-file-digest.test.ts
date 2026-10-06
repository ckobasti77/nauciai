import { createHash } from "node:crypto";
import { expect, test } from "vitest";

import { uploadDigestProblem } from "../convex/studioCore";
import { fileDigest } from "./crea-file-digest";

test("otisak = base64 sha256 sadržaja (oblik iz `_storage.sha256`) i veličina", async () => {
  const bytes = new TextEncoder().encode("Ђурђевдан i čaj");
  const digest = await fileDigest(new Blob([bytes]));
  expect(digest).toEqual({ sha256: createHash("sha256").update(bytes).digest("base64"), size: bytes.length });
  expect(uploadDigestProblem(digest)).toBeNull();
});

test("server prima otisak samo celog i ispravnog oblika", () => {
  expect(uploadDigestProblem({})).toBeNull();
  expect(uploadDigestProblem({ sha256: "abc", size: 3 })).toBe("NEISPRAVAN_OTISAK");
  expect(uploadDigestProblem({ sha256: "A".repeat(43) + "=" })).toBe("NEISPRAVAN_OTISAK");
  expect(uploadDigestProblem({ sha256: "A".repeat(43) + "=", size: -1 })).toBe("NEISPRAVAN_OTISAK");
  expect(uploadDigestProblem({ size: 10 })).toBe("NEISPRAVAN_OTISAK");
});
