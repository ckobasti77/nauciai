export function isValidLocalizedPair(sr: string, en: string) {
  return (!sr.trim() && !en.trim()) || Boolean(sr.trim() && en.trim());
}
