const USERNAME_ALLOWED_PATTERN = /^[A-Za-zČĆŠĐŽčćšđž0-9._]{3,20}$/;
const USERNAME_LETTER_PATTERN = /[A-Za-zČĆŠĐŽčćšđž]/g;

export function normalizeUsername(value: string | undefined | null) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("sr-Latn-RS");
  return normalized || undefined;
}

export function isValidUsername(value: string | undefined | null) {
  if (!value || !USERNAME_ALLOWED_PATTERN.test(value)) return false;
  return (value.match(USERNAME_LETTER_PATTERN)?.length ?? 0) >= 3;
}

export const USERNAME_VALIDATION_MESSAGE_SR =
  "Korisničko ime mora imati između 3 i 20 znakova, najmanje 3 slova, i može sadržati samo slova, cifre, tačku i donju crtu.";
export const USERNAME_VALIDATION_MESSAGE_EN =
  "Username must be 3–20 characters, contain at least 3 letters, and use only letters, numbers, periods, and underscores.";
