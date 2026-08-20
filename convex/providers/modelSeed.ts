/**
 * Oblik jednog reda `models` kataloga (STUDIO-CATALOG-V4 1.1) pre nego što
 * udje u bazu - JSON polja su ovde još pravi objekti, pa ih testovi i cenovna
 * pravila čitaju bez `JSON.parse`-a.
 *
 * Tip je zajednički jer je red kataloga isti bez obzira na provajdera; upis u
 * bazu radi seed kataloga (S5), ne ovaj fajl.
 */

import type { ParamControl } from "../studioParamSpec";
import type { PriceRule } from "../studioPricing";

export type StudioModelProvider = "fal" | "google" | "byteplus";

export type StudioModelSeed = {
  slug: string;
  provider: StudioModelProvider;
  kind: "image" | "video" | "audio";
  family: string;
  labelSr: string;
  labelEn: string;
  taglineSr: string;
  taglineEn: string;
  descriptionSr: string;
  descriptionEn: string;
  endpoints: Record<string, string>;
  inputModes: string[];
  inputSpec: Record<string, Record<string, { max: number; accept: string[] }>>;
  paramSpec: ParamControl[];
  priceRule: PriceRule;
  capabilities: Record<string, unknown>;
  sortOrder: number;
};
