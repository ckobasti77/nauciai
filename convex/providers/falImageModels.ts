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
  FAL_IMAGE_SIZES,
  IMAGE_ACCEPT,
  imageSizeControl,
  numImagesControl,
  perMegapixelSizeMap,
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
    // Izmena ima SVOJU rutu sa obaveznim nizom `image_urls` (Crea K07, nalaz N4;
    // https://fal.ai/models/openai/gpt-image-2/edit/llms.txt). Ranije je
    // `image_multi` išao na rutu za tekst, koja okačene slike ne čita.
    image_multi: "openai/gpt-image-2/edit",
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
    // Ulazne slike OpenAI naplaćuje kao tokene ($8 na 1M, fal strana iznad).
    // Broj tokena po slici nije objavljen, pa je 0,03 $ po slici (~3 750
    // tokena) konzervativna procena (K07 ODLUKA); u tekst režimu je nula.
    extras: [{ param: "input_images", freeCount: 0, usdEach: 0.03 }],
  },
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 10,
    maxImagesPerRun: 4,
    fal: { fields: { image: "image_urls" } },
    tags: ["text", "edit", "refs", "quality"],
    // Noćna tura (Crea K08, O7): OpenAI Batch, 50 % i `completion_window: "24h"`
    // (https://developers.openai.com/api/docs/guides/batch). Radi SAMO uz
    // `OPENAI_API_KEY`; bez njega opcija se ne vidi. Cena je pola fal tabele iznad
    // (zvanična cena po slici nije nađena, K06 §12.3); tarife batch-a po tokenu su
    // iz K06 (https://developers.openai.com/api/docs/pricing, nepotvrđeno uživo).
    batch: { provider: "openai", model: "gpt-image-2", discount: 0.5, tokenRatesUsdPerMillion: { prompt: 2.5, output: 15 } },
  },
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
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 10,
    maxImagesPerRun: 4,
    // Edit ruta traži NIZ i za jednu sliku (Crea K07, nalaz N3;
    // https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit/llms.txt).
    fal: { fields: { image: "image_urls" } },
  },
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
    fal: { fields: { image: "image_urls" } },
  },
  sortOrder: 70,
};

// ── Crea K07 (S2): novi modeli za slike ────────────────────────────────────
// Rute, polja i cene: `docs/crea/planovi/K06.md` §2 (izvori pročitani
// 2026-10-05). Od K13 se svi izlazi poziva čuvaju (S5), pa `num_images` imaju
// dve skice za probni list (S4): Z-Image Turbo i FLUX.2 klein (1-4 po pozivu).

const FLAT_SIZE_VALUES = ["auto_2K", ...FAL_IMAGE_SIZES];

/**
 * `seedream-5-flash` - najjeftiniji Seedream ($0,027 po slici,
 * https://fal.ai/models/bytedance/seedream/v5/flash/text-to-image). Ravna cena,
 * pa veličina ne dira račun. Ruta je bez `fal-ai/` prefiksa, kao kod MiniMax-a.
 * fal za Flash nema `seed`, pa model nema ni seme.
 */
export const SEEDREAM_5_FLASH: StudioModelSeed = {
  slug: "seedream-5-flash",
  provider: "fal",
  kind: "image",
  family: "seedream",
  labelSr: "Seedream 5 Flash",
  labelEn: "Seedream 5 Flash",
  taglineSr: "Dobra slika za malo kredita, i iz opisa i iz tvojih slika.",
  taglineEn: "A good image for few credits, from a prompt or from your pictures.",
  descriptionSr:
    "Brza i jeftina tarifa Seedream 5. Pravi sliku iz opisa ili menja do deset okačenih slika. Jedna cena bez obzira na veličinu.",
  descriptionEn:
    "The fast, cheap Seedream 5 tier. Makes an image from a prompt or edits up to ten uploaded images. One price regardless of size.",
  endpoints: {
    text: "bytedance/seedream/v5/flash/text-to-image",
    image_multi: "bytedance/seedream/v5/flash/edit",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 10, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [promptControl(), imageSizeControl(FLAT_SIZE_VALUES, "auto_2K", { affectsPrice: false })],
  // Cena izmene na fal strani nije posebno navedena (nepotvrđeno) - ista kao tekst.
  priceRule: { unit: "image", baseUsd: 0.027 },
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 10,
    maxImagesPerRun: 1,
    fal: { fields: { image: "image_urls" } },
    tags: ["cheap", "photo", "edit", "refs"],
  },
  sortOrder: 72,
};

/**
 * `z-image-turbo` - najjeftinija slika u katalogu ($0,005 po megapikselu,
 * https://fal.ai/models/fal-ai/z-image/turbo). Skica za probu (S4).
 * „Proširenje opisa" se gasi: na fal-u košta dodatnih $0,0025 i menja tekst.
 */
export const Z_IMAGE_TURBO: StudioModelSeed = {
  slug: "z-image-turbo",
  provider: "fal",
  kind: "image",
  family: "z-image",
  labelSr: "Z-Image Turbo",
  labelEn: "Z-Image Turbo",
  taglineSr: "Brza skica za kredit-dva - proba pre prave slike.",
  taglineEn: "A quick sketch for a credit or two - a test before the real image.",
  descriptionSr:
    "Najjeftiniji model za slike. Napravi skicu za sekund, pa kad ti se svidi, usavrši je boljim modelom.",
  descriptionEn:
    "The cheapest image model. Make a sketch in a second, then refine it with a better model once you like it.",
  endpoints: { text: "fal-ai/z-image/turbo" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  // `num_images` 1-4 (https://fal.ai/models/fal-ai/z-image/turbo/llms.txt, pročitano 2026-10-05).
  paramSpec: [promptControl(), imageSizeControl(FAL_IMAGE_SIZES, "landscape_4_3", { affectsPrice: true }), numImagesControl()],
  priceRule: { unit: "image", lookup: { params: ["image_size"], map: perMegapixelSizeMap(0.005) }, quantityParam: "num_images" },
  capabilities: {
    mode: "async_webhook",
    maxImagesPerRun: 4,
    seedParam: "seed",
    fal: { fixed: { enable_prompt_expansion: false } },
    tags: ["cheap", "draft", "photo"],
  },
  sortOrder: 74,
};

/**
 * `flux-2-klein` - FLUX.2 klein 9B: tekst $0,006/MP, izmena $0,011/MP za ulaz
 * i izlaz, a svaki ulaz fal svodi na 1 MP (https://fal.ai/models/fal-ai/
 * flux-2/klein/9b). Zato izmena ima svoje pravilo: izlaz po veličini + 0,011 $
 * po okačenoj slici.
 */
export const FLUX_2_KLEIN: StudioModelSeed = {
  slug: "flux-2-klein",
  provider: "fal",
  kind: "image",
  family: "flux-2",
  labelSr: "FLUX.2 klein",
  labelEn: "FLUX.2 klein",
  taglineSr: "Mali i brz FLUX - za skice i jednostavne izmene.",
  taglineEn: "A small, fast FLUX - for sketches and simple edits.",
  descriptionSr:
    "Laka verzija FLUX.2. Pravi sliku iz opisa ili menja do četiri okačene slike, za nekoliko kredita.",
  descriptionEn:
    "The light version of FLUX.2. Makes an image from a prompt or edits up to four uploaded images, for a few credits.",
  endpoints: {
    text: "fal-ai/flux-2/klein/9b",
    image_multi: "fal-ai/flux-2/klein/9b/edit",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 4, accept: IMAGE_ACCEPT } },
  },
  // Veličina se šalje i u izmeni: bez nje fal uzima veličinu ulaza, a ta se ne zna.
  // `num_images` 1-4 samo u tekst režimu (https://fal.ai/models/fal-ai/flux-2/klein/9b/llms.txt, 2026-10-05).
  paramSpec: [
    promptControl(),
    imageSizeControl(FAL_IMAGE_SIZES, "landscape_4_3", { affectsPrice: true }),
    numImagesControl({ showInModes: ["text"] }),
  ],
  priceRule: {
    unit: "image",
    lookup: { params: ["image_size"], map: perMegapixelSizeMap(0.006) },
    quantityParam: "num_images",
    modeRules: {
      image_multi: {
        unit: "image",
        lookup: { params: ["image_size"], map: perMegapixelSizeMap(0.011) },
        extras: [{ param: "input_images", freeCount: 0, usdEach: 0.011 }],
      },
    },
  },
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 4,
    maxImagesPerRun: 4,
    seedParam: "seed",
    fal: { fields: { image: "image_urls" } },
    tags: ["cheap", "draft", "edit"],
  },
  sortOrder: 76,
};

/**
 * `flux-2-pro` - $0,03 za prvi megapiksel + $0,015 za svaki sledeći
 * (https://fal.ai/models/fal-ai/flux-2-pro). Samo tekst: izmena i proširenje
 * kadra broje i megapiksele ULAZA, a server danas ne zna dimenzije okačene
 * slike (K06-9) - stižu u K11/K12.
 */
export const FLUX_2_PRO: StudioModelSeed = {
  slug: "flux-2-pro",
  provider: "fal",
  kind: "image",
  family: "flux-2",
  labelSr: "FLUX.2 Pro",
  labelEn: "FLUX.2 Pro",
  taglineSr: "Fotografski realna slika sa puno detalja.",
  taglineEn: "A photographically real image with lots of detail.",
  descriptionSr:
    "Najjači FLUX.2 za sliku iz opisa: verna svetla, materijali i lica. Dobar korak posle skice napravljene FLUX.2 klein-om.",
  descriptionEn:
    "The strongest FLUX.2 for an image from a prompt: true-to-life light, materials and faces. A good step after a FLUX.2 klein sketch.",
  endpoints: { text: "fal-ai/flux-2-pro" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [promptControl(), imageSizeControl(FAL_IMAGE_SIZES, "landscape_4_3", { affectsPrice: true })],
  priceRule: {
    unit: "image",
    lookup: {
      params: ["image_size"],
      map: {
        landscape_4_3: 0.03,
        landscape_16_9: 0.03,
        square_hd: 0.045,
        square: 0.03,
        portrait_4_3: 0.03,
        portrait_16_9: 0.03,
      },
    },
  },
  capabilities: { mode: "async_webhook", maxImagesPerRun: 1, seedParam: "seed", tags: ["photo", "quality"] },
  sortOrder: 78,
};

/**
 * `flux-kontext` - FLUX.1 Kontext [pro], izmena jedne slike rečima, $0,04
 * (https://fal.ai/models/fal-ai/flux-pro/kontext). Max ($0,08) ne ulazi.
 */
export const FLUX_KONTEXT: StudioModelSeed = {
  slug: "flux-kontext",
  provider: "fal",
  kind: "image",
  family: "flux-kontext",
  labelSr: "FLUX Kontext",
  labelEn: "FLUX Kontext",
  taglineSr: "Promeni jednu stvar na slici, a ostalo ostaje isto.",
  taglineEn: "Change one thing in the picture and keep the rest the same.",
  descriptionSr:
    "Okačiš jednu sliku i napišeš šta da se promeni - boja, pozadina, natpis. Lice i kompozicija ostaju.",
  descriptionEn:
    "Upload one image and write what to change - a colour, the background, a sign. The face and composition stay.",
  endpoints: { image_multi: "fal-ai/flux-pro/kontext" },
  inputModes: ["image_multi"],
  inputSpec: { image_multi: { image: { max: 1, accept: IMAGE_ACCEPT } } },
  paramSpec: [
    promptControl(),
    aspectRatioControl(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"]),
  ],
  priceRule: { unit: "image", baseUsd: 0.04 },
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 1,
    maxImagesPerRun: 1,
    seedParam: "seed",
    tags: ["edit"],
  },
  sortOrder: 80,
};

/**
 * `qwen-image-edit` - Qwen Image Edit 2511, $0,03 po megapikselu izlaza
 * (https://fal.ai/models/fal-ai/qwen-image-edit-2511/llms.txt). Da li fal broji
 * i megapiksele ULAZA nije objavljeno (nepotvrđeno) - proverava se prvim
 * računom pre nego što se upali `FAL_KEY`.
 */
export const QWEN_IMAGE_EDIT: StudioModelSeed = {
  slug: "qwen-image-edit",
  provider: "fal",
  kind: "image",
  family: "qwen-image",
  labelSr: "Qwen Image Edit",
  labelEn: "Qwen Image Edit",
  taglineSr: "Izmena slike koja dobro čita i piše tekst.",
  taglineEn: "Image editing that reads and writes text well.",
  descriptionSr:
    "Menja do tri okačene slike po opisu - i natpise na njima. Cena zavisi od veličine izlazne slike.",
  descriptionEn:
    "Edits up to three uploaded images from a description - including the text on them. The price depends on the output size.",
  endpoints: { image_multi: "fal-ai/qwen-image-edit-2511" },
  inputModes: ["image_multi"],
  inputSpec: { image_multi: { image: { max: 3, accept: IMAGE_ACCEPT } } },
  paramSpec: [promptControl(), imageSizeControl(FAL_IMAGE_SIZES, "landscape_4_3", { affectsPrice: true })],
  priceRule: { unit: "image", lookup: { params: ["image_size"], map: perMegapixelSizeMap(0.03) } },
  capabilities: {
    mode: "async_webhook",
    maxInputImages: 3,
    maxImagesPerRun: 1,
    seedParam: "seed",
    fal: { fields: { image: "image_urls" } },
    tags: ["edit", "text"],
  },
  sortOrder: 82,
};

/**
 * `recraft-41` - Recraft V4.1, $0,035 po slici
 * (https://fal.ai/models/fal-ai/recraft/v4.1/text-to-image). Dizajn, plakati,
 * natpisi. Šema nema seme ni broj slika.
 */
export const RECRAFT_41: StudioModelSeed = {
  slug: "recraft-41",
  provider: "fal",
  kind: "image",
  family: "recraft",
  labelSr: "Recraft V4.1",
  labelEn: "Recraft V4.1",
  taglineSr: "Plakati, logotipi i natpisi koji se čitaju.",
  taglineEn: "Posters, logos and lettering you can read.",
  descriptionSr: "Model za dizajn: pravi grafike, plakate i slike sa tekstom. Jedna cena po slici.",
  descriptionEn: "A design model: makes graphics, posters and images with text. One price per image.",
  endpoints: { text: "fal-ai/recraft/v4.1/text-to-image" },
  inputModes: ["text"],
  inputSpec: { text: {} },
  paramSpec: [promptControl(), imageSizeControl(FAL_IMAGE_SIZES, "square_hd", { affectsPrice: false })],
  priceRule: { unit: "image", baseUsd: 0.035 },
  capabilities: { mode: "async_webhook", maxImagesPerRun: 1, tags: ["text", "design"] },
  sortOrder: 84,
};

/**
 * `recraft-41-vector` - isti model, izlaz je pravi SVG, $0,08
 * (https://fal.ai/models/fal-ai/recraft/v4.1/text-to-vector). **Ugašen** dok K15
 * (S41) ne proveri SVG put kroz čuvanje, galeriju i preuzimanje - SVG je danas i
 * DEMO plakat, pa bi ga galerija pomešala sa probnim izlazom.
 */
export const RECRAFT_41_VECTOR: StudioModelSeed = {
  ...RECRAFT_41,
  slug: "recraft-41-vector",
  labelSr: "Recraft V4.1 vektor",
  labelEn: "Recraft V4.1 vector",
  taglineSr: "Logo i ikonice kao vektor (SVG), oštri na svakoj veličini.",
  taglineEn: "Logos and icons as vectors (SVG), sharp at any size.",
  descriptionSr: "Isti Recraft, ali izlaz je vektorska slika: uvećaš je koliko hoćeš i ostaje oštra.",
  descriptionEn: "The same Recraft, but the output is a vector image: scale it as much as you like and it stays sharp.",
  endpoints: { text: "fal-ai/recraft/v4.1/text-to-vector" },
  priceRule: { unit: "image", baseUsd: 0.08 },
  capabilities: {
    mode: "async_webhook",
    maxImagesPerRun: 1,
    output: "image/svg+xml",
    tags: ["vector", "text", "design"],
  },
  isEnabled: false,
  sortOrder: 85,
};

/**
 * `ideogram-45` - Ideogram 4.5, najbolji tekst u slici; cena po kvalitetu
 * $0,03 / $0,06 / $0,22 (https://fal.ai/models/ideogram/v4.5).
 *
 * Izmena sa maskom (Crea K11, S11): režim `mask` ide na `ideogram/v4.5/edit`
 * (https://fal.ai/models/ideogram/v4.5/edit/llms.txt) - `image_url` + `mask_url`
 * iste veličine, CRNO menja, BELO čuva; $0,008 / $0,03 / $0,06 / $0,22 po kvalitetu,
 * veličina ne menja cenu. Masku crta četkica (`slika.cetkica`), pa režim NIJE u
 * composeru „Izmeni" - početnik ne pravi crno-belu masku ručno. Sa maskom fal
 * prima samo `image_size: auto`, zato je veličina vidljiva samo u `text` režimu.
 */
export const IDEOGRAM_45: StudioModelSeed = {
  slug: "ideogram-45",
  provider: "fal",
  kind: "image",
  family: "ideogram",
  labelSr: "Ideogram 4.5",
  labelEn: "Ideogram 4.5",
  taglineSr: "Najbolje piše tekst u slici - pozivnice, plakati, meniji.",
  taglineEn: "The best at text in images - invitations, posters, menus.",
  descriptionSr: "Kad slika mora da ima tačan natpis, ovo je model. Tri nivoa kvaliteta menjaju cenu.",
  descriptionEn: "When the image needs exact lettering, this is the model. Three quality levels change the price.",
  endpoints: { text: "ideogram/v4.5", mask: "ideogram/v4.5/edit" },
  inputModes: ["text", "mask"],
  inputSpec: {
    text: {},
    mask: { image: { max: 1, accept: IMAGE_ACCEPT }, mask: { max: 1, accept: ["image/png"] } },
  },
  paramSpec: [
    promptControl(),
    {
      key: "quality",
      type: "segmented",
      labelSr: "Kvalitet",
      labelEn: "Quality",
      helpSr: "Menja cenu. Za tekst u slici je srednji obično dovoljan.",
      helpEn: "Changes the price. Medium is usually enough for text in images.",
      default: "medium",
      options: [
        { value: "low", labelSr: "Nizak", labelEn: "Low" },
        { value: "medium", labelSr: "Srednji", labelEn: "Medium" },
        { value: "high", labelSr: "Visok", labelEn: "High" },
      ],
      showInModes: ["text"],
      affectsPrice: true,
    },
    {
      key: "quality",
      type: "segmented",
      labelSr: "Kvalitet",
      labelEn: "Quality",
      helpSr: "Menja cenu. Za mali deo slike je nizak obično dovoljan.",
      helpEn: "Changes the price. Low is usually enough for a small part of the image.",
      default: "low",
      options: [
        { value: "very_low", labelSr: "Brzo", labelEn: "Quick" },
        { value: "low", labelSr: "Nizak", labelEn: "Low" },
        { value: "medium", labelSr: "Srednji", labelEn: "Medium" },
        { value: "high", labelSr: "Visok", labelEn: "High" },
      ],
      showInModes: ["mask"],
      affectsPrice: true,
    },
    imageSizeControl(FAL_IMAGE_SIZES, "square_hd", { affectsPrice: false, showInModes: ["text"] }),
  ],
  priceRule: {
    unit: "image",
    lookup: { params: ["quality"], map: { low: 0.03, medium: 0.06, high: 0.22 } },
    modeRules: {
      mask: { unit: "image", lookup: { params: ["quality"], map: { very_low: 0.008, low: 0.03, medium: 0.06, high: 0.22 } } },
    },
  },
  capabilities: {
    mode: "async_webhook",
    maxImagesPerRun: 1,
    seedParam: "seed",
    // fal podrazumevano „proširuje" opis; gasi se da tekst ostane korisnikov.
    fal: { fixed: { enable_prompt_expansion: false } },
    tags: ["text", "design", "mask"],
  },
  sortOrder: 86,
};

/**
 * `grok-imagine-image` - xAI Grok Imagine, $0,02; izmena $0,022
 * (https://fal.ai/grok-imagine). Bez semena. Ime polja ulaza u izmeni nije
 * potvrđeno - ide po fal konvenciji (`image_url`).
 */
export const GROK_IMAGINE_IMAGE: StudioModelSeed = {
  slug: "grok-imagine-image",
  provider: "fal",
  kind: "image",
  family: "grok-imagine",
  labelSr: "Grok Imagine",
  labelEn: "Grok Imagine",
  taglineSr: "Jeftina, živopisna slika za brzu ideju.",
  taglineEn: "A cheap, vivid image for a quick idea.",
  descriptionSr: "Model kompanije xAI za sliku iz opisa ili izmenu jedne okačene slike. Mala cena po slici.",
  descriptionEn: "The xAI model for an image from a prompt or for editing one uploaded image. A small price per image.",
  endpoints: {
    text: "xai/grok-imagine-image",
    image_multi: "xai/grok-imagine-image/edit",
  },
  inputModes: ["text", "image_multi"],
  inputSpec: {
    text: {},
    image_multi: { image: { max: 1, accept: IMAGE_ACCEPT } },
  },
  paramSpec: [promptControl(), aspectRatioControl(["1:1", "16:9", "9:16", "2:3", "3:2"])],
  priceRule: {
    unit: "image",
    baseUsd: 0.02,
    modeRules: { image_multi: { unit: "image", baseUsd: 0.022 } },
  },
  capabilities: { mode: "async_webhook", maxImagesPerRun: 1, tags: ["cheap", "photo"] },
  sortOrder: 88,
};

export const FAL_IMAGE_MODELS: StudioModelSeed[] = [
  GPT_IMAGE_2,
  GPT_IMAGE_15,
  SEEDREAM_45,
  SEEDREAM_5_LITE,
  SEEDREAM_5_FLASH,
  Z_IMAGE_TURBO,
  FLUX_2_KLEIN,
  FLUX_2_PRO,
  FLUX_KONTEXT,
  QWEN_IMAGE_EDIT,
  RECRAFT_41,
  RECRAFT_41_VECTOR,
  IDEOGRAM_45,
  GROK_IMAGINE_IMAGE,
];
