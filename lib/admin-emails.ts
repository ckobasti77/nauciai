export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseAdminEmails(value?: string | null) {
  return new Set(
    String(value ?? "")
      .split(/[;,\n\r]+/)
      .map(normalizeEmail)
      .filter(Boolean),
  );
}
