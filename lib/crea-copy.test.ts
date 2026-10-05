import { describe, expect, test } from "vitest";

import { LOCAL_RESULT_LIMITS } from "@/convex/creaLocalCore";
import type { LocalRejectReason } from "@/convex/creaLocalCore";
import { CREA_SAVE_ERROR_COPY, creaSaveErrorMessage, fillCopy } from "./crea-copy";

describe("poruke o čuvanju u galeriju", () => {
  test("svaki razlog koji server vraća ima rečenicu", () => {
    const reasons: LocalRejectReason[] = [
      "NEPOZNAT_ALAT",
      "NEISPRAVAN_TIP_FAJLA",
      "FAJL_PREVELIK",
      "PRAZAN_FAJL",
      "MINUTNI_LIMIT",
      "DNEVNI_LIMIT",
      "DNEVNI_LIMIT_PROSTORA",
      "PROJEKAT_NIJE_DOSTUPAN",
    ];
    for (const reason of reasons) expect(creaSaveErrorMessage(reason, "sr")).toBe(CREA_SAVE_ERROR_COPY[reason].sr);
    expect(LOCAL_RESULT_LIMITS.perDay).toBeGreaterThan(0);
  });

  test("bačena greška se prepoznaje po kodu u poruci; duži kod ima prednost", () => {
    expect(creaSaveErrorMessage("[CONVEX M(creaLocal:createLocalResultUploadUrl)] Uncaught Error: DNEVNI_LIMIT_PROSTORA", "en")).toBe(
      CREA_SAVE_ERROR_COPY.DNEVNI_LIMIT_PROSTORA.en,
    );
    expect(creaSaveErrorMessage("Uncaught Error: DNEVNI_LIMIT at handler", "sr")).toBe(CREA_SAVE_ERROR_COPY.DNEVNI_LIMIT.sr);
    expect(creaSaveErrorMessage("Uncaught Error: NEMA_PRISTUPA", "sr")).toBe(CREA_SAVE_ERROR_COPY.NEMA_PRISTUPA.sr);
    expect(creaSaveErrorMessage("Failed to fetch", "sr")).toBe(CREA_SAVE_ERROR_COPY.SLANJE.sr);
  });

  test("popunjavanje teksta", () => {
    expect(fillCopy("Prvi put preuzima {size}.", { size: "12 MB" })).toBe("Prvi put preuzima 12 MB.");
    expect(fillCopy("{n} % manje, {x}", { n: 42 })).toBe("42 % manje, {x}");
  });
});
