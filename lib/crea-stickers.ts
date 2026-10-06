import type { LocalizedText } from "./i18n";

/**
 * Nalepnice za editor i šablone (S28/S29, K10). Fajlovi su u
 * `public/brand/crea/stickers/` - Microsoft Fluent Emoji, stil „Flat", MIT licenca
 * (`public/brand/crea/stickers/LICENSE`, izvor i commit u `IZVOR.md`). Hostujemo ih
 * kod nas, pa platno ostaje „čisto" (isti origin) i izvoz radi.
 */

export const CREA_STICKER_SOURCE = {
  name: "Microsoft Fluent Emoji (Flat)",
  url: "https://github.com/microsoft/fluentui-emoji",
  commit: "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc",
  license: "MIT",
} as const;

export type CreaStickerGroup = "lica" | "znaci" | "slavlje" | "stvari";

export type CreaSticker = { id: string; group: CreaStickerGroup; label: LocalizedText };

export const CREA_STICKER_GROUPS: ReadonlyArray<{ id: CreaStickerGroup; label: LocalizedText }> = [
  { id: "lica", label: { sr: "Lica", en: "Faces" } },
  { id: "znaci", label: { sr: "Znaci", en: "Signs" } },
  { id: "slavlje", label: { sr: "Slavlje", en: "Party" } },
  { id: "stvari", label: { sr: "Stvari", en: "Things" } },
];

export const CREA_STICKERS: readonly CreaSticker[] = [
  { id: "smeh", group: "lica", label: { sr: "Smeh do suza", en: "Tears of joy" } },
  { id: "zaljubljen", group: "lica", label: { sr: "Zaljubljen", en: "Heart eyes" } },
  { id: "naocare", group: "lica", label: { sr: "Kul", en: "Cool" } },
  { id: "razmislja", group: "lica", label: { sr: "Razmišlja", en: "Thinking" } },
  { id: "vristi", group: "lica", label: { sr: "Vrišti", en: "Screaming" } },
  { id: "slavlje", group: "lica", label: { sr: "Žurka", en: "Partying" } },
  { id: "srce", group: "znaci", label: { sr: "Srce", en: "Heart" } },
  { id: "vatra", group: "znaci", label: { sr: "Vatra", en: "Fire" } },
  { id: "zvezda", group: "znaci", label: { sr: "Zvezda", en: "Star" } },
  { id: "iskre", group: "znaci", label: { sr: "Iskre", en: "Sparkles" } },
  { id: "munja", group: "znaci", label: { sr: "Munja", en: "Lightning" } },
  { id: "sto", group: "znaci", label: { sr: "Sto poena", en: "Hundred points" } },
  { id: "kvacica", group: "znaci", label: { sr: "Kvačica", en: "Check mark" } },
  { id: "palac", group: "znaci", label: { sr: "Palac gore", en: "Thumbs up" } },
  { id: "aplauz", group: "znaci", label: { sr: "Aplauz", en: "Clapping" } },
  { id: "cioda", group: "znaci", label: { sr: "Čioda", en: "Pin" } },
  { id: "konfete", group: "slavlje", label: { sr: "Konfete", en: "Party popper" } },
  { id: "balon", group: "slavlje", label: { sr: "Balon", en: "Balloon" } },
  { id: "torta", group: "slavlje", label: { sr: "Torta", en: "Cake" } },
  { id: "poklon", group: "slavlje", label: { sr: "Poklon", en: "Gift" } },
  { id: "kruna", group: "slavlje", label: { sr: "Kruna", en: "Crown" } },
  { id: "svica", group: "slavlje", label: { sr: "Sveća", en: "Candle" } },
  { id: "hleb", group: "slavlje", label: { sr: "Hleb", en: "Bread" } },
  { id: "vino", group: "slavlje", label: { sr: "Vino", en: "Wine" } },
  { id: "cvet", group: "slavlje", label: { sr: "Lala", en: "Tulip" } },
  { id: "sunce", group: "stvari", label: { sr: "Sunce", en: "Sun" } },
  { id: "kafa", group: "stvari", label: { sr: "Kafa", en: "Coffee" } },
  { id: "pica", group: "stvari", label: { sr: "Pica", en: "Pizza" } },
  { id: "nota", group: "stvari", label: { sr: "Nota", en: "Music note" } },
  { id: "kamera", group: "stvari", label: { sr: "Foto-aparat", en: "Camera" } },
  { id: "raketa", group: "stvari", label: { sr: "Raketa", en: "Rocket" } },
  { id: "sijalica", group: "stvari", label: { sr: "Sijalica", en: "Light bulb" } },
];

/**
 * Sezonske nalepnice (K27, G12): isti izvor i licenca. Birač ih nudi samo dok sezona
 * traje (`stickerPickerGroups`), a sačuvana scena i montaža ih prihvataju uvek.
 */
export type CreaSeasonSticker = { id: string; label: LocalizedText };

export const CREA_SEASON_STICKERS: readonly CreaSeasonSticker[] = [
  { id: "jelka", label: { sr: "Jelka", en: "Christmas tree" } },
  { id: "pahulja", label: { sr: "Pahulja", en: "Snowflake" } },
  { id: "vatromet", label: { sr: "Vatromet", en: "Fireworks" } },
  { id: "deda-mraz", label: { sr: "Deda Mraz", en: "Santa" } },
  { id: "snesko", label: { sr: "Sneško", en: "Snowman" } },
  { id: "zvono", label: { sr: "Zvono", en: "Bell" } },
  { id: "zito", label: { sr: "Žito", en: "Wheat" } },
  { id: "bosiljak", label: { sr: "Bosiljak", en: "Basil" } },
  { id: "rucak", label: { sr: "Slavski ručak", en: "Holiday lunch" } },
  { id: "jaje", label: { sr: "Jaje", en: "Egg" } },
  { id: "pile", label: { sr: "Pile", en: "Chick" } },
  { id: "zeka", label: { sr: "Zeka", en: "Bunny" } },
  { id: "cvet-tresnje", label: { sr: "Cvet trešnje", en: "Cherry blossom" } },
  { id: "korpa", label: { sr: "Korpa", en: "Basket" } },
  { id: "gitara", label: { sr: "Gitara", en: "Guitar" } },
  { id: "slusalice", label: { sr: "Slušalice", en: "Headphones" } },
  { id: "mikrofon", label: { sr: "Mikrofon", en: "Microphone" } },
  { id: "sator", label: { sr: "Šator", en: "Tent" } },
  { id: "prskalica", label: { sr: "Prskalica", en: "Sparkler" } },
];

const BY_ID = new Map<string, { id: string; label: LocalizedText }>(
  [...CREA_STICKERS, ...CREA_SEASON_STICKERS].map((sticker) => [sticker.id, sticker]),
);

export function stickerById(id: string): { id: string; label: LocalizedText } | undefined {
  return BY_ID.get(id);
}

export type StickerPickerGroup = { id: string; label: LocalizedText; stickers: ReadonlyArray<{ id: string; label: LocalizedText }> };

/**
 * Grupe za birač nalepnica: obične grupe, a dok sezona traje (`seasonStickers` iz
 * `lib/crea-seasons.ts`) na vrhu i sezonska grupa sa njenim imenom.
 */
export function stickerPickerGroups(season: { label: LocalizedText; stickers: readonly string[] } | null): StickerPickerGroup[] {
  const regular = CREA_STICKER_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    stickers: CREA_STICKERS.filter((sticker) => sticker.group === group.id),
  }));
  if (!season) return regular;
  const stickers = season.stickers.flatMap((id) => {
    const sticker = BY_ID.get(id);
    return sticker ? [sticker] : [];
  });
  return [{ id: "sezona", label: season.label, stickers }, ...regular];
}

export function stickerUrl(id: string): string {
  return `/brand/crea/stickers/${id}.svg`;
}
