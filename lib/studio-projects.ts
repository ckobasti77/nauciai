/**
 * Logika i ograničenja za Studio projekte.
 * Čista logika bez Convex ili React zavisnosti.
 */

export const MAX_STUDIO_PROJECTS = 50;
export const PROJECT_NAME_MAX_LENGTH = 60;

export type ProjectNameErrorCode =
  | "PROJEKAT_BEZ_IMENA"
  | "PROJEKAT_PREDUGO_IME"
  | "PROJEKAT_VEC_POSTOJI";

export type ProjectLimitErrorCode = "PREVISE_PROJEKATA";

export type ProjectValidationResult =
  | { ok: true; name: string }
  | { ok: false; code: ProjectNameErrorCode };

/**
 * Validacija imena projekta:
 * 1. Trimuje se
 * 2. Prazno se odbija sa PROJEKAT_BEZ_IMENA
 * 3. Preko 60 karaktera se odbija sa PROJEKAT_PREDUGO_IME
 * 4. Duplikat kod istog korisnika (case-insensitive) se odbija sa PROJEKAT_VEC_POSTOJI
 */
export function validateProjectName(
  rawName: string,
  existingNames: string[] = [],
): ProjectValidationResult {
  const trimmed = rawName.trim();

  if (trimmed.length === 0) {
    return { ok: false, code: "PROJEKAT_BEZ_IMENA" };
  }

  if (trimmed.length > PROJECT_NAME_MAX_LENGTH) {
    return { ok: false, code: "PROJEKAT_PREDUGO_IME" };
  }

  const normalized = trimmed.toLowerCase();
  const isDuplicate = existingNames.some(
    (name) => name.trim().toLowerCase() === normalized,
  );

  if (isDuplicate) {
    return { ok: false, code: "PROJEKAT_VEC_POSTOJI" };
  }

  return { ok: true, name: trimmed };
}

/**
 * Provera gornje granice broja nearhiviranih projekata (maksimalno 50).
 */
export function canCreateStudioProject(activeProjectCount: number): boolean {
  return activeProjectCount < MAX_STUDIO_PROJECTS;
}
