import type { Id } from "@/convex/_generated/dataModel";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import type { CreaTool } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

/** Rad iz galerije koji ulazi u alat (`?ulaz=<jobId>`, K05); rezultat postaje njegova verzija. */
export type ToolSource = { jobId: Id<"generationJobs">; url: string };

/** Ono što svaka komponenta alata dobija od radionice. */
export type CreaToolProps = {
  tool: CreaTool;
  locale: Locale;
  caps: CreaDeviceCaps | null;
  /** Kapija za „Sačuvaj u galeriju" (`hasStudioAccess`). */
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
  source: ToolSource | null;
};
