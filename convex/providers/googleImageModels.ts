/**
 * Google-ovi modeli za slike iz STUDIO-CATALOG-V4 (2.1 i 2.2), u obliku u kojem
 * ulaze u tabelu `models`. PODATAK, ne seed - upis radi `studioModels.seedStudioModels`.
 *
 * Oba idu **direktno na Google**: fal na Nano Banani uzima 1,12-1,19x (katalog 7).
 * Oba su sinhrona - odgovor nosi sliku, pa im ne treba ni webhook ni poller.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import {
  aspectRatioControl,
  IMAGE_ACCEPT,
  numImagesControl,
  promptControl,
  resolutionControl,
} from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

/** Pet odnosa stranica koje katalog 2.1 nabraja za Nano Bananu. */
const NANO_BANANA_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];

/**
 * `nano-banana-2` - Gemini 3.1 Flash Image (katalog 2.1).
 *
 * `addUsd: 0.003` se sabira POSLE količine jer je to dodatak po generaciji, ne
 * po slici; `computeCostUsd` to radi u tom redosledu i tako ispada tačno cifra
 * iz kataloga (4K: 0,067 x 2 + 0,003 = 0,137).
 */
export const NANO_BANANA_2: StudioModelSeed = {
  slug: "nano-banana-2",
  provider: "google",
  kind: "image",
  family: "nano-banana",
  labelSr: "Nano Banana 2",
  labelEn: "Nano Banana 2",
  taglineSr: "Brza slika sa odličnim tekstom u kadru, do 4K.",
  taglineEn: "Fast images with great in-frame text, up to 4K.",
  descriptionSr:
    "Gemini 3.1 Flash Image - svakodnevni model za slike iz teksta i za izmenu do deset okačenih slika odjednom. Rezolucija ide od 0,5K do 4K i menja cenu.",
  descriptionEn:
    "Gemini 3.1 Flash Image - the everyday model for text-to-image and for editing up to ten uploaded images at once. Resolution runs from 0.5K to 4K and changes the price.",
  endpoints: {
    text: "gemini-3.1-flash-image",
    image_multi: "gemini-3.1-flash-image",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({ values: ["0.5K", "1K", "2K", "4K"], default: "1K" }),
    aspectRatioControl(NANO_BANANA_RATIOS),
    numImagesControl(),
  ],
  priceRule: {
    unit: "image",
    baseUsd: 0.067,
    addUsd: 0.003,
    multipliers: [
      { param: "resolution", map: { "0.5K": 0.75, "1K": 1, "2K": 1.5, "4K": 2 } },
    ],
    quantityParam: "num_images",
  },
  capabilities: { mode: "sync", maxInputImages: 10, maxImagesPerRun: 4 },
  sortOrder: 10,
};

/**
 * `nano-banana-pro` - Gemini 3 Pro Image (katalog 2.2).
 *
 * **1K namerno NE postoji kao opcija.** Google naplaćuje isto za 1K i 2K (1 120
 * tokena oba), pa bi ponuditi 1K značilo naplatiti isto za manju sliku.
 *
 * `addUsd: 0.015` su thinking tokeni - Pro je misleći model i naplaćuje ih
 * posebno po 12 $/M. Na složenom promptu ume da premaši procenu; zato posao
 * upisuje `actualCostUsd`.
 */
export const NANO_BANANA_PRO: StudioModelSeed = {
  slug: "nano-banana-pro",
  provider: "google",
  kind: "image",
  family: "nano-banana",
  labelSr: "Nano Banana Pro",
  labelEn: "Nano Banana Pro",
  taglineSr: "Misleći model za slike - najbolji tekst i najtačnije izmene.",
  taglineEn: "A thinking image model - the best text and the most precise edits.",
  descriptionSr:
    "Gemini 3 Pro Image. Uzmi ga kad slika mora da bude tačna iz prve: čita složen prompt i drži detalje koje Flash ume da promaši. Ide na 2K i 4K - 1K ne postoji jer ga Google naplaćuje isto kao 2K.",
  descriptionEn:
    "Gemini 3 Pro Image. Reach for it when the image has to be right the first time: it reads a complex prompt and holds details Flash can miss. It runs at 2K and 4K - there is no 1K because Google charges the same for it as for 2K.",
  endpoints: {
    text: "gemini-3-pro-image",
    image_multi: "gemini-3-pro-image",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    resolutionControl({
      values: ["2K", "4K"],
      default: "2K",
      helpSr: "1K ne postoji - Google ga naplaćuje isto kao 2K.",
      helpEn: "There is no 1K - Google charges the same for it as for 2K.",
    }),
    aspectRatioControl(NANO_BANANA_RATIOS),
    numImagesControl(),
  ],
  priceRule: {
    unit: "image",
    baseUsd: 0.134,
    addUsd: 0.015,
    multipliers: [{ param: "resolution", map: { "2K": 1, "4K": 1.791 } }],
    quantityParam: "num_images",
  },
  capabilities: {
    mode: "sync",
    thinking: true,
    maxInputImages: 10,
    maxImagesPerRun: 4,
    // Tarifa po MILIONU tokena, za preračun `actualCostUsd`-a iz odgovora (W6).
    // Oba broja su iz kataloga 2.2, ne odnekud drugde:
    // - `output`: 1 120 tokena je slika na 2K, a ona košta `baseUsd: 0.134` ->
    //   0,134 / 1 120 × 10^6 = 119,64 $/M;
    // - `thinking`: 12 $/M piše doslovno u katalogu.
    //
    // ULAZNI tokeni nemaju tarifu ni u katalogu ni ovde, i zato ovaj model još
    // NE upisuje stvaran trošak: `tokenCostUsd` odbija da sabere trošak dok
    // jedna prijavljena kategorija nema svoju cenu. Zbir bez ulaznih tokena bi
    // bio manji od stvarnog, dakle broj koji popravlja lošu maržu. Čim se
    // ulazna tarifa potvrdi sa prve fakture, dopisuje se `prompt` ovde i model
    // počinje da meri - ništa drugo se ne menja.
    tokenRatesUsdPerMillion: { output: 119.64, thinking: 12 },
  },
  sortOrder: 20,
};

export const GOOGLE_IMAGE_MODELS: StudioModelSeed[] = [NANO_BANANA_2, NANO_BANANA_PRO];
