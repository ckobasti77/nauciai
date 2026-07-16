export function publicProfilePath(username?: string | null) {
  const value = username?.trim();
  return value ? `/app/members/${encodeURIComponent(value)}` : "/app/profile";
}
