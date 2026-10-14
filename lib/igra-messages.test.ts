import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../public/brand/igra/manifest.json";
import { IGRA_MESSAGES_COPY } from "./igra-copy";

/**
 * Poruke (K18): prazna stanja dobijaju ilustraciju, a mikrointerakcije su samo
 * transform/opacity. Čet logika, push, moderacija i privatnost ostaju kakvi su bili,
 * pa se provere vode nad izvorom (komponente čitaju Convex i ne mogu u jsdom).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const assets: Record<string, { ready: boolean } | undefined> = manifest.assets;

const EMPTY = read("components/igra/chat/chat-empty.tsx");
const HUB = read("components/app/chat/messages-hub.tsx");
const INBOX = read("components/app/chat/chat-inbox.tsx");
const THREAD = read("components/app/chat/chat-thread.tsx");
const STUDY = read("components/app/chat/study-hub.tsx");
const COMPOSER = read("components/app/chat/chat-composer.tsx");

describe("prazna stanja poruka", () => {
  it("svaka slika koju koriste postoji u manifestu i spremna je", () => {
    const ids = [...EMPTY.matchAll(/id="([a-z.-]+)"/g)].map((match) => match[1]!);
    expect(ids).toEqual(expect.arrayContaining(["prazno.poruke", "prazno.pretraga"]));
    for (const id of ids) expect(assets[id]?.ready, id).toBe(true);
    for (const id of ["lik.eho.mase", "lik.sova.mase", "lik.sova.misli", "lik.sova.slavi"]) expect(assets[id]?.ready, id).toBe(true);
  });

  it("strana bez izabranog razgovora, lista, pretraga i prazan razgovor idu kroz nove komponente", () => {
    expect(HUB).toContain("<MessagesPickEmpty");
    expect(HUB).not.toContain("<EmptyState");
    expect(INBOX).toContain("<InboxEmpty");
    expect(INBOX).toContain("<InboxSearchEmpty");
    expect(INBOX).not.toContain("<EmptyState");
    expect(THREAD).toContain("<ThreadEmpty");
  });

  it("pozivi dugmadi su isti kao pre (partner → Uči zajedno, novi razgovor → dijalog)", () => {
    expect(HUB).toContain('onFindPartner={() => changeView("study")}');
    expect(INBOX).toContain("onStart={() => setNewConversationOpen(true)} onFindPartner={onOpenStudy}");
    expect(INBOX).toContain("onStart={onStartConversation} onFindPartner={onOpenStudy}");
    expect(EMPTY).toContain('withLocale(locale, "/app/community/members")');
  });

  it("tekstovi ostaju na oba jezika, a Eho ima svoju rečenicu", () => {
    expect(EMPTY).toContain("Ovde se otvaraju tvoji razgovori");
    expect(EMPTY).toContain("Your conversations open here");
    expect(EMPTY).toContain("Pošalji prvu poruku.");
    for (const text of Object.values(IGRA_MESSAGES_COPY)) {
      expect(text.sr.length).toBeGreaterThan(0);
      expect(text.en.length).toBeGreaterThan(0);
    }
  });

  it("Uči zajedno: svih pet praznih stanja nosi Sovu", () => {
    expect(STUDY.match(/art=\{<StudyEmptyArt/g)?.length).toBe(5);
  });

  it("prezentacione komponente ne čitaju Convex i ne sviraju", () => {
    expect(EMPTY).not.toMatch(/convex\/react|_generated\/api|playQuietPing|new Audio/);
  });
});

describe("mikrointerakcije poruka", () => {
  it("dugme Pošalji se samo utisne (transform) i staje uz smanjen pokret", () => {
    expect(COMPOSER).toContain("active:scale-90");
    expect(COMPOSER).toContain("motion-reduce:active:scale-100");
  });

  it("nova reakcija igra jednom kroz ChatMotionScope, a chip prisutan pri učitavanju ne igra", () => {
    expect(THREAD).toContain("data-chat-reaction={reaction.emoji}");
    expect(THREAD).toContain("previousReactionEmojisRef");
    expect(THREAD).toContain('requestChatMotion(chip, { kind: "reaction" })');
    // Početna vrednost je trenutni skup, pa prvi efekat nema šta da pokrene.
    expect(THREAD).toContain("useRef(reactionEmojis)");
  });

  it("zvuk i obaveštenja nisu dirani: ping i dalje čeka prekidač zvuka", () => {
    const notifications = read("components/app/chat/chat-notifications.tsx");
    expect(notifications).toContain('soundEnabled && chatPreference?.sound !== false');
    expect(THREAD).not.toMatch(/playQuietPing|new Audio/);
  });
});
