import { withLocale, type Locale } from "./i18n";

const TRANSLITERATION_MAP: Record<string, string> = {
  // Serbian Latin
  š: "s",
  Š: "s",
  đ: "dj",
  Đ: "dj",
  č: "c",
  Č: "c",
  ć: "c",
  Ć: "c",
  ž: "z",
  Ž: "z",
  // Serbian Cyrillic
  а: "a",
  А: "a",
  б: "b",
  Б: "b",
  в: "v",
  В: "v",
  г: "g",
  Г: "g",
  д: "d",
  Д: "d",
  ђ: "dj",
  Ђ: "dj",
  е: "e",
  Е: "e",
  ж: "z",
  Ж: "z",
  з: "z",
  З: "z",
  и: "i",
  И: "i",
  ј: "j",
  Ј: "j",
  к: "k",
  К: "k",
  л: "l",
  Л: "l",
  љ: "lj",
  Љ: "lj",
  м: "m",
  М: "m",
  н: "n",
  Н: "n",
  њ: "nj",
  Њ: "nj",
  о: "o",
  О: "o",
  п: "p",
  П: "p",
  р: "r",
  Р: "r",
  с: "s",
  С: "s",
  т: "t",
  Т: "t",
  ћ: "c",
  Ћ: "c",
  у: "u",
  У: "u",
  ф: "f",
  Ф: "f",
  х: "h",
  Х: "h",
  ц: "c",
  Ц: "c",
  ч: "c",
  Ч: "c",
  џ: "dz",
  Џ: "dz",
  ш: "s",
  Ш: "s",
};

/**
 * Transliterates and sanitizes a post title into a clean kebab-case URL slug (max ~60 chars).
 */
export function slugifyCommunityTitle(title: string, maxLength = 60): string {
  if (!title) return "diskusija";

  let result = "";
  for (const char of title) {
    if (TRANSLITERATION_MAP[char]) {
      result += TRANSLITERATION_MAP[char];
    } else {
      result += char;
    }
  }

  // Remove diacritics, lowercase, replace non-alphanumeric with hyphen
  let cleaned = result
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength).replace(/-+$/, "");
  }

  return cleaned || "diskusija";
}

/**
 * Generates canonical SEO slug in format "title-kebab-{postId}".
 */
export function getCommunityPostSlug(title: string, postId: string): string {
  const titleSlug = slugifyCommunityTitle(title);
  return `${titleSlug}-${postId}`;
}

/**
 * Extracts postId from a slug.
 * If slug format is "title-kebab-{postId}", returns "{postId}".
 * If slug is raw "{postId}", returns "{postId}".
 */
export function extractPostIdFromSlug(slug: string): string {
  if (!slug) return "";
  const trimmed = slug.trim();
  const lastDash = trimmed.lastIndexOf("-");
  if (lastDash === -1) {
    return trimmed;
  }
  const candidate = trimmed.slice(lastDash + 1);
  return candidate || trimmed;
}

/**
 * Generates full localized path for a community thread, e.g. "/sr/community/kako-napraviti-ai-video-kd78xyz".
 */
export function getCommunityPostPath(
  locale: Locale,
  post: { title: string; _id: string },
): string {
  const slug = getCommunityPostSlug(post.title, post._id);
  return withLocale(locale, `/community/${slug}`);
}
