/**
 * fal-ovi modeli za slike iz STUDIO-CATALOG-V4 (2.3, 2.4, 2.5, 2.7), u obliku u
 * kojem ulaze u tabelu `models`. PODATAK, ne seed - upis radi
 * `studioModels.seedStudioModels`.
 *
 * Sva četiri su kod fal-a parity (katalog 7), pa nemaju šta da traže na
 * direktnoj ruti. Seedream 5 **Lite** je ovde, a Seedream 5 **Pro** ide direktno
 * na BytePlus (`bytePlusModels.ts`) - ista porodica, dve rute, jer fal na Pro-u
 * uzima 1,50x.
 *
 * Cene su prepisane iz kataloga doslovno. Ne preračunavaju se.
 */

import type { ParamControl } from "../studioParamSpec";
import {
  aspectRatioControl,
  IMAGE_ACCEPT,
  numImagesControl,
  promptControl,
} from "./modelControls";
import type { StudioModelSeed } from "./modelSeed";

const SEEDREAM_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"];

/**
 * `quality` i `size` kod GPT Image-a NISU ukras: fal podrazumeva `quality: high`
 * (katalog 2.3), pa svaki zahtev mora da nosi obe vrednosti. `default` na obe
 * kontrole je ono što ih pina - `sanitizeSpecParams` popunjava svaku kontrolu
 * koju klijent nije poslao, pa low tarifa ne može da se naplati na high poslu.
 */
function qualityControl(): ParamControl {
  return {
    key: "quality",
    type: "segmented",
    labelSr: "Kvalitet",
    labelEn: "Quality",
    helpSr: "Menja i cenu i vreme generisanja. Podrazumevan je srednji.",
    helpEn: "Changes both price and generation time. Medium is the default.",
    default: "medium",
    options: [
      { value: "low", labelSr: "Nizak", labelEn: "Low" },
      { value: "medium", labelSr: "Srednji", labelEn: "Medium" },
      { value: "high", labelSr: "Visok", labelEn: "High" },
    ],
    affectsPrice: true,
  };
}

function sizeControl(values: string[]): ParamControl {
  return {
    key: "size",
    type: "select",
    labelSr: "Dimenzije",
    labelEn: "Size",
    default: "1024x1024",
    options: values.map((value) => ({ value, labelSr: value, labelEn: value })),
    affectsPrice: true,
  };
}

/**
 * `gpt-image-2` - OpenAI GPT Image 2 preko fal-a (katalog 2.3).
 *
 * **Cena nije monotona po rezoluciji**: 1024x1024 na visokom kvalitetu ($0,211)
 * je SKUPLJI od 1536x1024 ($0,165). Zato `lookup` tabela, ne množioci - množilac
 * bi tvrdio da veća slika uvek košta više, a ovde ne košta.
 */
export const GPT_IMAGE_2: StudioModelSeed = {
  slug: "gpt-image-2",
  provider: "fal",
  kind: "image",
  family: "gpt-image",
  labelSr: "GPT Image 2",
  labelEn: "GPT Image 2",
  taglineSr: "Model koji najbolje čita dug i precizan opis.",
  taglineEn: "The model that reads a long, precise brief best.",
  descriptionSr:
    "Slika iz teksta ili izmena okačenih slika, sa tri nivoa kvaliteta i sedam dimenzija. Cena zavisi od para kvalitet-dimenzije i nije uvek veća za veću sliku - zato uvek stoji na dugmetu.",
  descriptionEn:
    "Text-to-image or editing uploaded images, with three quality levels and seven sizes. The price depends on the quality/size pair and is not always higher for a bigger image - which is why it is always on the button.",
  endpoints: {
    text: "openai/gpt-image-2",
    image_multi: "openai/gpt-image-2",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    qualityControl(),
    sizeControl([
      "1024x1024",
      "1024x1536",
      "1536x1024",
      "1024x768",
      "1920x1080",
      "2560x1440",
      "3840x2160",
    ]),
    numImagesControl(),
  ],
  priceRule: {
    unit: "image",
    lookup: {
      params: ["quality", "size"],
      map: {
        "low|1024x1024": 0.006,
        "medium|1024x1024": 0.053,
        "high|1024x1024": 0.211,
        "low|1024x1536": 0.005,
        "medium|1024x1536": 0.042,
        "high|1024x1536": 0.165,
        "low|1536x1024": 0.005,
        "medium|1536x1024": 0.042,
        "high|1536x1024": 0.165,
        "low|1024x768": 0.005,
        "medium|1024x768": 0.037,
        "high|1024x768": 0.145,
        "low|1920x1080": 0.005,
        "medium|1920x1080": 0.04,
        "high|1920x1080": 0.158,
        "low|2560x1440": 0.007,
        "medium|2560x1440": 0.056,
        "high|2560x1440": 0.222,
        "low|3840x2160": 0.012,
        "medium|3840x2160": 0.101,
        "high|3840x2160": 0.401,
      },
    },
    quantityParam: "num_images",
  },
  capabilities: { mode: "async_webhook", maxInputImages: 10, maxImagesPerRun: 4 },
  sortOrder: 30,
};

/** `gpt-image-15` - isti oblik kao GPT Image 2, druga tabela i tri dimenzije (katalog 2.4). */
export const GPT_IMAGE_15: StudioModelSeed = {
  slug: "gpt-image-15",
  provider: "fal",
  kind: "image",
  family: "gpt-image",
  labelSr: "GPT Image 1.5",
  labelEn: "GPT Image 1.5",
  taglineSr: "Prethodna generacija, jeftinija na visokom kvalitetu u kvadratu.",
  taglineEn: "The previous generation, cheaper at high quality in square format.",
  descriptionSr:
    "Ista logika kao GPT Image 2, ali sa tri dimenzije i nižom cenom na visokom kvalitetu u kvadratu. Dobar izbor kad ti treba niz sličnih slika bez najveće cene.",
  descriptionEn:
    "The same logic as GPT Image 2, but with three sizes and a lower high-quality price in square format. A good pick when you need a run of similar images without the top price.",
  endpoints: {
    text: "openai/gpt-image-1-5",
    image_multi: "openai/gpt-image-1-5",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [
    promptControl(),
    qualityControl(),
    sizeControl(["1024x1024", "1024x1536", "1536x1024"]),
    numImagesControl(),
  ],
  priceRule: {
    unit: "image",
    lookup: {
      params: ["quality", "size"],
      map: {
        "low|1024x1024": 0.009,
        "medium|1024x1024": 0.034,
        "high|1024x1024": 0.133,
        "low|1024x1536": 0.013,
        "medium|1024x1536": 0.051,
        "high|1024x1536": 0.2,
        "low|1536x1024": 0.013,
        "medium|1536x1024": 0.05,
        "high|1536x1024": 0.199,
      },
    },
    quantityParam: "num_images",
  },
  capabilities: { mode: "async_webhook", maxInputImages: 10, maxImagesPerRun: 4 },
  sortOrder: 40,
};

/** `seedream-45` - ravna cena, najjednostavnije pravilo u katalogu (2.5). */
export const SEEDREAM_45: StudioModelSeed = {
  slug: "seedream-45",
  provider: "fal",
  kind: "image",
  family: "seedream",
  labelSr: "Seedream 4.5",
  labelEn: "Seedream 4.5",
  taglineSr: "Jedna cena bez obzira na rezoluciju - za brzo probanje ideja.",
  taglineEn: "One price regardless of resolution - for trying ideas fast.",
  descriptionSr:
    "ByteDance-ov model za slike iz teksta i za izmenu okačenih slika. Nema kontrolu rezolucije jer se sve naplaćuje isto, pa je cena po slici uvek ista.",
  descriptionEn:
    "ByteDance's model for text-to-image and for editing uploaded images. There is no resolution control because everything costs the same, so the per-image price never moves.",
  endpoints: {
    text: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    image_multi: "fal-ai/bytedance/seedream/v4.5/edit",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [promptControl(), aspectRatioControl(SEEDREAM_RATIOS), numImagesControl()],
  priceRule: { unit: "image", baseUsd: 0.04, quantityParam: "num_images" },
  capabilities: { mode: "async_webhook", maxInputImages: 10, maxImagesPerRun: 4 },
  sortOrder: 50,
};

/**
 * `seedream-5-lite` - fal, parity (katalog 2.7). Ide do 4K (Pro staje na 2K),
 * ali **nema layerize ni izmenu po regionima** - to je Pro-only, i zato Pro ide
 * drugom rutom, direktno na BytePlus.
 */
export const SEEDREAM_5_LITE: StudioModelSeed = {
  slug: "seedream-5-lite",
  provider: "fal",
  kind: "image",
  family: "seedream",
  labelSr: "Seedream 5 Lite",
  labelEn: "Seedream 5 Lite",
  taglineSr: "Najnoviji Seedream po ravnoj ceni, ide i do 4K.",
  taglineEn: "The newest Seedream at a flat price, and it goes to 4K.",
  descriptionSr:
    "Laka tarifa Seedream 5. Jedna cena po slici bez obzira na rezoluciju. Nema razlaganje na slojeve ni izmenu po regionima - za to postoji Seedream 5 Pro.",
  descriptionEn:
    "The light Seedream 5 tier. One price per image regardless of resolution. No layer decomposition and no region editing - that is what Seedream 5 Pro is for.",
  endpoints: {
    text: "fal-ai/bytedance/seedream/v5/lite/text-to-image",
    image_multi: "fal-ai/bytedance/seedream/v5/lite/edit",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [promptControl(), aspectRatioControl(SEEDREAM_RATIOS), numImagesControl()],
  priceRule: { unit: "image", baseUsd: 0.035, quantityParam: "num_images" },
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 10,
    maxImagesPerRun: 4,
    maxResolution: "4K",
    layerize: false,
  },
  sortOrder: 70,
};

export const FAL_IMAGE_MODELS: StudioModelSeed[] = [
  GPT_IMAGE_2,
  GPT_IMAGE_15,
  SEEDREAM_45,
  SEEDREAM_5_LITE,
];
