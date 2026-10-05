import type { Id } from "@/convex/_generated/dataModel";
import type { CreaDeviceCaps } from "@/lib/crea-device";
import type { CreaTool } from "@/lib/crea-tools";
import type { Locale } from "@/lib/i18n";

/** Ono što svaka komponenta alata dobija od radionice. */
export type CreaToolProps = {
  tool: CreaTool;
  locale: Locale;
  caps: CreaDeviceCaps | null;
  /** Kapija za „Sačuvaj u galeriju" (`hasStudioAccess`). */
  canSave: boolean;
  projectId: Id<"studioProjects"> | null;
};
