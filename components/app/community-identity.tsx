/* eslint-disable @next/next/no-img-element */
import { cn } from "@/components/ui/primitives";
import type { Locale } from "@/lib/i18n";

export type CommunityRole = "student" | "pro_student" | "moderator" | "admin" | string;

export type CommunityRank = {
  level: number;
  label: string;
  completedLessons: number;
} | null;

export function roleLabel(role: CommunityRole | undefined, locale: Locale) {
  if (role === "admin") return "Admin";
  if (role === "moderator") return "Moderator";
  if (role === "pro_student") return "Pro";
  if (role === "student") return locale === "sr" ? "Lite" : "Lite";
  return locale === "sr" ? "Student" : "Student";
}

export function canShowRank(role: CommunityRole | undefined) {
  return role === "student" || role === "pro_student";
}

export function initialsFromName(name: string | undefined) {
  const parts = (name || "Clan zajednice")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "CZ";
}

export function formatCommunityTime(timestamp: number, locale: Locale) {
  return new Date(timestamp).toLocaleDateString(locale === "sr" ? "sr-RS" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RoleBadge({
  role,
  locale,
  className,
  compact = false,
}: {
  role?: CommunityRole;
  locale: Locale;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-black uppercase leading-none shadow-[0_2px_0_rgba(14,49,88,0.16)]",
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[10px]",
        role === "admin" && "border-ink bg-yellow text-ink",
        role === "moderator" && "border-ink/60 bg-ink text-white",
        role === "pro_student" && "border-ink/40 bg-white text-ink",
        (!role || role === "student") && "border-line bg-paper text-ink/70",
        className,
      )}
    >
      {roleLabel(role, locale)}
    </span>
  );
}

export function RankBadge({
  rank,
  role,
  className,
}: {
  rank?: CommunityRank;
  role?: CommunityRole;
  className?: string;
}) {
  if (!rank || !canShowRank(role)) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-black leading-none text-ink/65",
        className,
      )}
      title={`${rank.label} - ${rank.completedLessons}`}
    >
      {rank.label}
    </span>
  );
}

export function CommunityAvatar({
  name,
  avatarUrl,
  role,
  rank,
  locale,
  size = "md",
  showRank = true,
  className,
}: {
  name?: string;
  avatarUrl?: string | null;
  role?: CommunityRole;
  rank?: CommunityRank;
  locale: Locale;
  size?: "sm" | "md" | "lg";
  showRank?: boolean;
  className?: string;
}) {
  const avatarSize = size === "lg" ? "size-16 text-lg" : size === "sm" ? "size-10 text-xs" : "size-12 text-sm";

  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-1.5", className)}>
      <div className="relative pb-2">
        <div
          className={cn(
            "grid place-items-center overflow-hidden rounded-full border-2 border-ink bg-yellow font-black text-ink shadow-[3px_3px_0_rgba(14,49,88,0.15)]",
            avatarSize,
          )}
          aria-hidden={avatarUrl ? undefined : true}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span>{initialsFromName(name)}</span>
          )}
        </div>
        <RoleBadge
          role={role}
          locale={locale}
          compact
          className="absolute bottom-0 left-1/2 max-w-[4.8rem] -translate-x-1/2 truncate whitespace-nowrap"
        />
      </div>
      {showRank ? <RankBadge rank={rank} role={role} className="max-w-[5.5rem] truncate" /> : null}
    </div>
  );
}
