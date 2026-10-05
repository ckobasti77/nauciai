import type { Id } from "@/convex/_generated/dataModel";
import type { NightProviderStatus } from "@/convex/creaNightCore";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import type { CreaTool } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";
import type { StudioModel } from "@/lib/studio-models";

/** Rad iz galerije koji ulazi u alat (`?ulaz=<jobId>`, K05); rezultat postaje njegova verzija. */
export type ToolSource = { jobId: Id<"generationJobs">; url: string; kind?: "image" | "video" | "audio" };

/**
 * Za plaćene izmene iz alata (K11): katalog radionice (sa faktorima cena v2) i
 * stanje ključeva provajdera - ista odluka o dostupnosti kao u composeru.
 */
export type CreaPaidContext = {
  catalog: readonly StudioModel[];
  providerStatus: Partial<Record<StudioModel["provider"], boolean>> | undefined;
  publicEnabled: boolean;
  isStaff: boolean;
  /** Noćna tura (K08) za serije (S39, K15): fleg cena v2 i ključevi batch provajdera. */
  pricingV2?: boolean;
  nightProviders?: Partial<NightProviderStatus>;
};

/** Ono što svaka komponenta alata dobija od radionice. */
export type CreaToolProps = {
  tool: CreaTool;
  locale: Locale;
  caps: CreaDeviceCaps | null;
  /** Kapija za „Sačuvaj u galeriju" (`hasStudioAccess`). */
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  source: ToolSource | null;
  /** `null` dok se katalog učitava. */
  paid: CreaPaidContext | null;
};
