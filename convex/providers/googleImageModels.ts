/**
 * Google-ovi modeli za slike iz STUDIO-CATALOG-V4 (2.1 i 2.2), u obliku u kojem
 * ulaze u tabelu `models`. PODATAK, ne seed - upis radi `studioModels.seedStudioModels`.
 *
 * Oba idu **direktno na Google**: fal na Nano Banani uzima 1,12-1,19x (katalog 7).
 * Oba su sinhrona - odgovor nosi sliku, pa im ne treba ni webhook ni poller.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 *
 * **`num_images` NIJE kontrola ovih modela.** Interactions API vraća tačno jednu
 * sliku po pozivu, a posao u bazi ima tačno jedno izlazno polje. Kontrola koja
 * naplaćuje četiri a isporučuje jednu je gora od kontrole koje nema, pa je
 * uklonjena i iz `paramSpec`-a i iz `priceRule.quantityParam`-a (količina je
 * time 1, `studioPricing.quantityFor`).
 */

import {
  aspectRatioControl,
  IMAGE_ACCEPT,
  promptControl,
  resolutionControl,
} from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

/**
 * Odnosi stranica koje Interactions API DOKUMENTUJE za Nano Bananu
 * (`1:1, 16:9, 9:16, 5:4, 3:2, 2:3, 1:4, 4:1, 1:8, 8:1`). Katalog je pisao
 * `4:3` i `3:4` - njih na spisku nema, a nepodrzana vrednost vraca 400 TEK
 * POSLE rezervacije kredita. Zato su zamenjeni najblizim dokumentovanim parom
 * (`3:2` i `2:3`); ostalo je pet opcija, isto kao pre.
 */
const NANO_BANANA_RATIOS = ["1:1", "16:9", "9:16", "3:2", "2:3"];

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
  ],
  priceRule: {
    unit: "image",
    baseUsd: 0.067,
    addUsd: 0.003,
    // Mnozioci su KOLICNICI zvanicnog cenovnika prema 1K ($0,067), ne okrugli
    // brojevi: 0,5K = 0,045; 2K = 0,101; 4K = 0,151. Stari niz (0,75 / 1 / 1,5 / 2)
    // je na 4K racunao 0,134 umesto 0,151 - jedanaest posto ISPOD nabavne, i to
    // bas na najskupljoj opciji.
    multipliers: [
      { param: "resolution", map: { "0.5K": 0.6716, "1K": 1, "2K": 1.5075, "4K": 2.2537 } },
    ],
  },
  capabilities: {
    // Interactions API, isti kao Omni - provajder grana po ovome.
    api: "interactions",
    mode: "sync",
    maxInputImages: 10,
    maxImagesPerRun: 1,
    // Zvanicni cenovnik (`ai.google.dev/gemini-api/docs/pricing`, paid tier):
    // izlaz 60 $/M tokena, ulaz 0,50 $/M. Sa oba broja posao upisuje STVARAN
    // trosak iz `usageMetadata`, umesto da ostane na proceni.
    tokenRatesUsdPerMillion: { output: 60, prompt: 0.5 },
  },
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
  ],
  priceRule: {
    unit: "image",
    baseUsd: 0.134,
    addUsd: 0.015,
    multipliers: [{ param: "resolution", map: { "2K": 1, "4K": 1.791 } }],
  },
  capabilities: {
    api: "interactions",
    mode: "sync",
    thinking: true,
    maxInputImages: 10,
    maxImagesPerRun: 1,
    // Tarifa po MILIONU tokena, za preračun `actualCostUsd`-a iz odgovora (W6).
    // Oba broja su iz kataloga 2.2, ne odnekud drugde:
    // - `output`: 1 120 tokena je slika na 2K, a ona košta `baseUsd: 0.134` ->
    //   0,134 / 1 120 × 10^6 = 119,64 $/M;
    // - `thinking`: 12 $/M piše doslovno u katalogu.
    //
    // ULAZNA tarifa je sada popunjena sa zvaničnog cenovnika
    // (`ai.google.dev/gemini-api/docs/pricing`, paid tier): 2,00 $/M za tekst i
    // sliku na ulazu. Time `tokenCostOutcome` više ne odbija zbir i model
    // UPISUJE stvaran trošak umesto razloga `nema tarife za kategoriju prompt`.
    tokenRatesUsdPerMillion: { output: 119.64, prompt: 2, thinking: 12 },
  },
  sortOrder: 20,
};

export const GOOGLE_IMAGE_MODELS: StudioModelSeed[] = [NANO_BANANA_2, NANO_BANANA_PRO];
