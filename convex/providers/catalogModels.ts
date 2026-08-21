/**
 * Ceo katalog v4 na jednom mestu - STUDIO-CATALOG-V4 sekcija 8: **30 redova, ne
 * 110 slugova.** Rezolucija, kvalitet, zvuk, trajanje i broj slika nisu modeli
 * nego parametri, pa jedan red pokriva celu porodicu varijanti.
 *
 * Redovi žive po provajderu i vrsti (`falImageModels`, `googleImageModels`,
 * `falVideoModels`, `googleModels`, `bytePlusModels`, `falToolModels`,
 * `falAudioModels`); ovde se samo spajaju u redosled u kojem ulaze u bazu.
 * Upis radi `studioModels.seedStudioModels`.
 */

import { BYTEPLUS_MODELS } from "./bytePlusModels";
import { FAL_AUDIO_MODELS } from "./falAudioModels";
import { FAL_IMAGE_MODELS } from "./falImageModels";
import { FAL_TOOL_MODELS } from "./falToolModels";
import { FAL_VIDEO_MODELS } from "./falVideoModels";
import { GOOGLE_IMAGE_MODELS } from "./googleImageModels";
import { GOOGLE_VIDEO_MODELS } from "./googleModels";
import type { StudioModelSeed } from "./modelSeed";

/** Poredjani po `sortOrder`-u, jer se u tom redosledu i prikazuju u ModelPicker-u. */
export const STUDIO_MODELS: StudioModelSeed[] = [
  ...GOOGLE_IMAGE_MODELS,
  ...FAL_IMAGE_MODELS,
  ...BYTEPLUS_MODELS,
  ...FAL_VIDEO_MODELS,
  ...GOOGLE_VIDEO_MODELS,
  ...FAL_TOOL_MODELS,
  ...FAL_AUDIO_MODELS,
].sort((a, b) => a.sortOrder - b.sortOrder);

export function studioModelBySlug(slug: string): StudioModelSeed | undefined {
  return STUDIO_MODELS.find((model) => model.slug === slug);
}
