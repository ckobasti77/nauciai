import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { communityBadges, type CommunityBadgeKey } from "./community-gamification";
import { COMMUNITY_SECTIONS } from "./community-sections";
import { evaluateBadges, EMPTY_BADGE_COUNTERS, igraBadge } from "./igra-badges";
import { authorRankView, COMMUNITY_BADGE_STICKER, communityHeroCall, isArrival, newestCreatedAt } from "./igra-community";
import { COMMUNITY_FIXTURES } from "./igra-fixtures";
import { levelFromXp } from "./igra-level";

/**
 * Zajednica (K11): Iskrin poziv, čip autora, značke kao nalepnice, „pristiglo" obaveštenje,
 * i provere nad izvorom da zajednica nije dobila nijedan upit po temi ili komentaru.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const THREAT = /izgubi|propust|kazn|sramot|hurry|lose|miss out|penalt/i;

describe("heroj", () => {
  it("svaka sekcija zajednice ima Iskrin poziv na oba jezika", () => {
    for (const section of COMMUNITY_SECTIONS) {
      for (const locale of ["sr", "en"] as const) {
        const call = communityHeroCall(section.id, locale);
        expect(call.length, `${section.id} ${locale}`).toBeGreaterThan(10);
        expect(call.length, `${section.id} ${locale}`).toBeLessThanOrEqual(60);
        expect(call, `${section.id} ${locale}`).not.toMatch(THREAT);
      }
    }
    expect(new Set(COMMUNITY_SECTIONS.map((section) => communityHeroCall(section.id, "sr"))).size).toBe(COMMUNITY_SECTIONS.length);
  });

  it("nepoznata sekcija (i ime sa prototipa) dobija poziv diskusija", () => {
    expect(communityHeroCall("nepostoji", "sr")).toBe(communityHeroCall("discussions", "sr"));
    expect(communityHeroCall("toString", "en")).toBe(communityHeroCall("discussions", "en"));
  });
});

describe("čip autora", () => {
  it("broji završene lekcije, sa množinom po jeziku", () => {
    expect(authorRankView({ completedLessons: 1 }, "sr")).toEqual({ text: "1 lekcija", label: "Završenih lekcija: 1" });
    expect(authorRankView({ completedLessons: 3 }, "sr")?.text).toBe("3 lekcije");
    expect(authorRankView({ completedLessons: 17 }, "sr")?.text).toBe("17 lekcija");
    expect(authorRankView({ completedLessons: 21 }, "sr")?.text).toBe("21 lekcija");
    expect(authorRankView({ completedLessons: 1 }, "en")).toEqual({ text: "1 lesson", label: "Lessons completed: 1" });
    expect(authorRankView({ completedLessons: 64 }, "en")?.text).toBe("64 lessons");
  });

  it("separator hiljada po jeziku, razlomak nadole", () => {
    expect(authorRankView({ completedLessons: 1250 }, "sr")?.text).toBe("1.250 lekcija");
    expect(authorRankView({ completedLessons: 1250 }, "en")?.text).toBe("1,250 lessons");
    expect(authorRankView({ completedLessons: 2.9 }, "sr")?.text).toBe("2 lekcije");
  });

  it("bez ranga (nalog tima), bez lekcija i loš ulaz: nema čipa", () => {
    expect(authorRankView(null, "sr")).toBeNull();
    expect(authorRankView(undefined, "sr")).toBeNull();
    expect(authorRankView({ completedLessons: 0 }, "sr")).toBeNull();
    expect(authorRankView({ completedLessons: 0.5 }, "sr")).toBeNull();
    expect(authorRankView({ completedLessons: -3 }, "sr")).toBeNull();
    expect(authorRankView({ completedLessons: Number.NaN }, "en")).toBeNull();
  });

  it("čip ne kaže „nivo”: red nosi lekcije, ne XP", () => {
    for (const lessons of [1, 5, 15, 30, 60, 200]) {
      for (const locale of ["sr", "en"] as const) {
        const view = authorRankView({ completedLessons: lessons }, locale)!;
        expect(`${view.text} ${view.label}`).not.toMatch(/nivo|level/i);
      }
    }
  });
});

describe("značke zajednice kao nalepnice", () => {
  const KEYS: CommunityBadgeKey[] = ["first_thread", "ten_comments", "first_helpful", "week_streak"];

  it("svaka značka ima mapiranje; samo „Deset komentara” ostaje ikonica", () => {
    expect(Object.keys(COMMUNITY_BADGE_STICKER).sort()).toEqual([...KEYS].sort());
    expect(COMMUNITY_BADGE_STICKER.ten_comments).toBeNull();
    for (const key of KEYS.filter((item) => item !== "ten_comments")) {
      const sticker = COMMUNITY_BADGE_STICKER[key]!;
      expect(igraBadge(sticker).group, key).toBe("zajednica");
    }
  });

  it("nalepnica stoji tamo gde bi i bedž bio zarađen (isti prag)", () => {
    // Prvi koristan odgovor: značka zajednice i bedž „Koristan odgovor" se pale na istom broju.
    for (const helpfulAnswers of [0, 1, 5]) {
      const community = communityBadges({ helpfulAnswers }).includes("first_helpful");
      const badge = evaluateBadges({ ...EMPTY_BADGE_COUNTERS, helpfulAnswers }).find((item) => item.key === "koristan-odgovor")!.earned;
      expect(community, String(helpfulAnswers)).toBe(badge);
    }
    for (const streak of [6, 7, 30]) {
      const community = communityBadges({ streakDays: streak }).includes("week_streak");
      const badge = evaluateBadges({ ...EMPTY_BADGE_COUNTERS, bestStreak: streak }).find((item) => item.key === "niz-7")!.earned;
      expect(community, String(streak)).toBe(badge);
    }
  });
});

describe("obaveštenje koje stigne", () => {
  const list = [{ createdAt: 300 }, { createdAt: 900 }, { createdAt: 600 }];

  it("polazna tačka je najnoviji zatečen red; prazna lista je 0", () => {
    expect(newestCreatedAt(list)).toBe(900);
    expect(newestCreatedAt([])).toBe(0);
  });

  it("pristiglo je samo ono što je strogo novije; starije strane nikad", () => {
    const baseline = newestCreatedAt(list);
    expect(isArrival({ createdAt: 901 }, baseline)).toBe(true);
    expect(isArrival({ createdAt: 900 }, baseline)).toBe(false);
    expect(list.some((item) => isArrival(item, baseline))).toBe(false);
    expect(isArrival({ createdAt: 10 }, baseline)).toBe(false);
    // Lista je bila prazna: prvo obaveštenje koje stigne jeste novo.
    expect(isArrival({ createdAt: 1 }, newestCreatedAt([]))).toBe(true);
  });
});

describe("test podaci zajednice", () => {
  it("nov korisnik vidi prazna stanja; aktivan ima čip, čip bez lekcija i nalog tima", () => {
    expect(COMMUNITY_FIXTURES.novi).toEqual({ posts: [], members: [], notifications: [] });
    const chips = COMMUNITY_FIXTURES.aktivan.posts.map((post) => authorRankView(post.authorRank, "sr"));
    expect(chips.some((chip) => chip !== null)).toBe(true);
    expect(chips.filter((chip) => chip === null).length).toBeGreaterThanOrEqual(2);
  });

  it("članovi pokrivaju sve uloge i nivoe od 1 do 12", () => {
    const members = COMMUNITY_FIXTURES.aktivan.members;
    expect(new Set(members.map((member) => member.role))).toEqual(new Set(["admin", "moderator", "pro_student", "student"]));
    const levels = members.filter((member) => member.role === "student" || member.role === "pro_student").map((member) => levelFromXp(member.xp ?? 0).level);
    expect(Math.min(...levels)).toBe(1);
    expect(Math.max(...levels)).toBe(12);
  });

  it("legenda ima sve pročitano, aktivan bar jedno nepročitano", () => {
    expect(COMMUNITY_FIXTURES.legenda.notifications.every((notification) => notification.readAt)).toBe(true);
    expect(COMMUNITY_FIXTURES.aktivan.notifications.some((notification) => !notification.readAt)).toBe(true);
  });
});

describe("izvor: bez novih upita i bez javnog sajta", () => {
  const COMMUNITY_UI = [
    "components/app/community-v2/community-shared.tsx",
    "components/app/community-v2/community-shell.tsx",
    "components/app/community-v2/community-members.tsx",
    "components/app/community-v2/community-mentions.tsx",
    "components/app/community-v2/community-discussions.tsx",
    "components/app/community-comments.tsx",
    "components/app/community-thread-detail.tsx",
    "components/app/community-gamification.tsx",
    "components/app/community-member-progress.tsx",
    "components/app/member-profile.tsx",
  ];
  const IGRA_COMMUNITY = readdirSync(join(ROOT, "components/igra/community")).map((file) => `components/igra/community/${file}`);

  it("zajednica ne pita napredak člana po temi, komentaru ni kartici", () => {
    for (const file of [...COMMUNITY_UI, ...IGRA_COMMUNITY]) {
      expect(read(file), file).not.toMatch(/api\.igra\.|getMemberProgress|getMyProgress/);
    }
  });

  it("nove komponente zajednice su prezentacione i slike crtaju samo kroz IgraArt", () => {
    expect(IGRA_COMMUNITY.length).toBeGreaterThanOrEqual(2);
    for (const file of [...IGRA_COMMUNITY, "components/app/community-member-progress.tsx"]) {
      const source = read(file);
      expect(source, file).not.toMatch(/from "convex\/react"|_generated\/api|useQuery|useMutation|igra-fixtures/);
      expect(source, file).not.toMatch(/<img\b|\/brand\/igra\//);
      expect(source, file).not.toMatch(/rounded-[\w[\]./-]+!|!rounded-|borderRadius|#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("javne stranice zajednice čitaju `community-identity`: on ostaje bez IGRA koda", () => {
    const identity = read("components/app/community-identity.tsx");
    expect(identity).not.toMatch(/@\/components\/igra|@\/lib\/igra-/);
  });

  it("brojač glasova ne vuče katalog bedževa ni amblem nivoa; `lib/igra-community` katalog uvozi samo kao tip", () => {
    expect(read("components/app/community-gamification.tsx")).not.toMatch(/@\/components\/igra|@\/lib\/igra-|community-member-progress/);
    const lib = read("lib/igra-community.ts");
    expect(lib).toMatch(/import type \{ IgraBadgeKey \} from "\.\/igra-badges";/);
    expect(lib).not.toMatch(/^import \{[^}]*\} from "\.\/igra-(badges|art)";/m);
  });

  it("heroj je jedini nosilac `data-igra-hero`; scena nije `priority`, nego preload samo od `lg` (telefon je ne skida)", () => {
    const hero = read("components/igra/community/community-hero.tsx");
    expect(hero.match(/data-igra-hero/g)).toHaveLength(1);
    expect(hero).not.toMatch(/<IgraArt[^>]*\bpriority\b/);
    expect(hero).toMatch(/hidden[^"]*lg:block/);
    // Računar sliku dobija unapred iz HTML-a, telefon je ne traži (media = Tailwind `lg`).
    expect(hero).toContain('preload(scene.src, { as: "image", fetchPriority: "high", media: "(min-width: 64rem)" })');
    for (const file of COMMUNITY_UI) expect(read(file), file).not.toMatch(/data-igra-hero/);
  });

  it("tema, komentar i detalj nose čip autora, a ne stari „Nivo N” ispod avatara", () => {
    for (const file of ["components/app/community-v2/community-shared.tsx", "components/app/community-comments.tsx", "components/app/community-thread-detail.tsx"]) {
      const source = read(file);
      expect(source, file).toMatch(/<AuthorRankChip rank=\{(post|node)\.authorRank\}/);
      // Avatar koji još dobija `rank` ne sme da crta stari „Nivo N" ispod sebe.
      for (const avatar of source.match(/<CommunityAvatar[\s\S]*?\/>/g) ?? []) {
        if (/\brank=/.test(avatar)) expect(avatar, file).toContain("showRank={false}");
      }
    }
  });

  it("obaveštenje koje stigne animira samo klasa iz no-preference bloka", () => {
    const css = read("app/globals.css");
    const block = css.slice(css.indexOf("IGRA (K11)"));
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.igra-arrive \{/);
    expect(read("components/app/community-v2/community-mentions.tsx")).toMatch(/arrived && "igra-arrive"/);
  });
});
