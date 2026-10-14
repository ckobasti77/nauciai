import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { IGRA_SFX, playIgraSfx } from "./igra-sound";

/**
 * Mikrointerakcije i zvuk (K24): jedan recept za pritisak i hover (`igra-press` /
 * `igra-lift` u `app/globals.css`), podrazumevano ponašanje samo unutar ljuske posle
 * prijave, tost uspeha i zvuk samo kroz postojeći prekidač.
 */

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const css = read("app/globals.css");

/** Telo bloka koji počinje na datom indeksu (brojanje vitičastih zagrada). */
function blockAt(source: string, start: number): { body: string; end: number } {
  const open = source.indexOf("{", start);
  let depth = 1;
  let index = open + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    index += 1;
  }
  return { body: source.slice(open + 1, index - 1), end: index };
}

const k24Start = css.indexOf("IGRA (K24): mikrointerakcije");
const pressLayer = blockAt(css, css.indexOf("@layer components {", k24Start)).body;
const shellLayer = blockAt(css, css.indexOf("@layer base {", css.indexOf("IGRA (K24): podrazumevano"))).body;
const reducedSafe = (body: string) => {
  const start = body.indexOf("@media (prefers-reduced-motion: no-preference)");
  return start < 0 ? "" : blockAt(body, start).body;
};

describe("CSS recept", () => {
  test("igra-press / igra-lift i modifikatori postoje u @layer components", () => {
    for (const name of ["igra-press", "igra-lift", "igra-shadow", "igra-shadow-soft", "igra-shadow-ink", "igra-shadow-yellow", "igra-depth-1", "igra-depth-2", "igra-depth-4"]) {
      expect(pressLayer, name).toMatch(new RegExp(`\\.${name}[\\s{:,]`));
    }
  });

  test("bez IGRA ljuske u dokumentu (javni sajt) recept nema senku ni podizanje (K29)", () => {
    expect(pressLayer).toMatch(/:root:not\(:has\(\[data-igra-ui\]\)\) \.igra-press \{\s*--igra-shadow: transparent;/);
    expect(reducedSafe(pressLayer)).toMatch(/:root:not\(:has\(\[data-igra-ui\]\)\) \.igra-press:hover:not\(:disabled, \[aria-disabled="true"\]\) \{\s*translate: none;/);
  });

  test("svaki modifikator senke koji kod koristi postoji (nepoznat tiho daje 3 px)", () => {
    const used = new Set([...POST_LOGIN_ROOTS, "components/ui"].flatMap(tsxFiles).flatMap((file) => [...read(file).matchAll(/\bigra-(?:depth|shadow)-[a-z0-9]+\b/g)].map((match) => match[0])));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(pressLayer, name).toMatch(new RegExp(`\\.${name}[\\s{:,]`));
  });

  test("senka ide kroz --tw-shadow i samo kroz tokene", () => {
    expect(pressLayer).toContain("--tw-shadow: var(--igra-depth) var(--igra-depth) 0 0 var(--igra-shadow)");
    expect(pressLayer.replaceAll("0 0 #0000", "")).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  test("pomeranje i prelaz postoje samo uz dozvoljen pokret", () => {
    const safe = reducedSafe(pressLayer);
    expect(safe).toMatch(/translate:\s*0 -2px/);
    expect(safe).toMatch(/translate:\s*0 1px/);
    expect(safe).toMatch(/transition:/);
    const outside = pressLayer.replace(safe, "");
    expect(outside).not.toMatch(/\btranslate\s*:/);
    expect(outside).not.toMatch(/\btransition\s*:/);
  });

  test("pritisak skraćuje senku, hover je produži; onemogućeno ne reaguje", () => {
    expect(pressLayer).toMatch(/\.igra-press:active:not\(:disabled, \[aria-disabled="true"\]\) \{\s*--tw-shadow: 1px 1px 0 0 var\(--igra-shadow\);/);
    expect(pressLayer).toMatch(/--tw-shadow: calc\(var\(--igra-depth\) \+ 2px\)/);
    expect(pressLayer).not.toMatch(/\.igra-lift:active/);
  });

  test("podrazumevano ponašanje važi samo u ljusci i gubi od svakog utility-ja", () => {
    for (const selector of shellLayer.match(/^\s*:where[^{]+\{/gm) ?? []) expect(selector).toMatch(/^\s*:where\(\[data-igra-ui\]\)/);
    expect(reducedSafe(shellLayer)).toMatch(/translate:\s*0 1px/);
    expect(shellLayer.replace(reducedSafe(shellLayer), "")).not.toMatch(/\b(?:translate|transition)\s*:/);
  });
});

/** Fajlovi posle prijave; javni sajt, auth i plaćanje se ne diraju (pravila runa). */
const POST_LOGIN_ROOTS = ["components/app", "components/crea", "components/igra", "components/studio", "app/[locale]/app", "app/[locale]/studio"];
const PUBLIC_OR_AUTH = new Set([
  "components/app/theme-toggle.tsx",
  "components/app/checkout-button.tsx",
  "components/app/public-community-comments.tsx",
  "components/app/sign-in-panel.tsx",
]);

function tsxFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) return tsxFiles(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("doslednost po površinama", () => {
  const files = POST_LOGIN_ROOTS.flatMap(tsxFiles).filter((file) => !PUBLIC_OR_AUTH.has(file));

  test("nijedan fajl posle prijave ne ponavlja ručni hover-lift", () => {
    const offenders = files.filter((file) => /(^|[\s"'`])hover:-translate-y-0\.5\b/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  test("recept se ne kombinuje sa sopstvenim pomeranjem ni sa `studio-anim-mikro`", () => {
    for (const file of files) {
      for (const match of read(file).matchAll(/"([^"\n]*\bigra-(?:press|lift)\b[^"\n]*)"/g)) {
        expect(match[1], file).not.toMatch(/(^|\s)(hover:-?translate-|active:translate-|studio-anim-mikro|motion-reduce:hover:)/);
      }
    }
  });

  test("dugme aplikacije koristi recept i ne menja API", () => {
    const button = read("components/ui/button.tsx");
    expect(button).toContain('"igra-press inline-flex');
    expect(button).not.toMatch(/active:translate-y/);
    expect(button).toMatch(/variant\?: ButtonVariant;[\s\S]*size\?: ButtonSize;[\s\S]*loading\?: boolean;/);
  });

  test("ljuske nose `data-igra-ui`, javni sajt ne", () => {
    expect(read("components/app/app-shell.tsx")).toMatch(/<div data-igra-ui className="min-h-screen/);
    expect(read("components/studio/studio-shell.tsx")).toMatch(/<div data-igra-ui className="min-h-screen/);
    for (const file of tsxFiles("components/marketing")) expect(read(file), file).not.toContain("data-igra-ui");
    expect(read("app/[locale]/layout.tsx")).not.toContain("data-igra-ui");
  });

  test("peel samo kroz `useStickerPeel`, na ulazima u stvaranje", () => {
    expect(read("components/igra/peel-link.tsx")).toContain("useStickerPeel(ref)");
    for (const file of ["components/igra/dashboard/crea-quick-start.tsx", "components/igra/crea/crea-start-hero.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("<PeelLink");
      expect(source, file).toContain("data-igra-peel");
      expect(source, file).not.toContain("group-hover:-translate-y");
    }
  });
});

describe("tost", () => {
  const provider = read("components/ui/toast-provider.tsx");

  test("uspeh ima marker i lik; lik je lenj (bez manifesta u početnom JS-u)", () => {
    expect(provider).toContain('<span className="igra-marker bg-yellow text-ink">{toast.title}</span>');
    expect(provider).toMatch(/dynamic\(\(\) => import\("@\/components\/igra\/igra-lik"\)/);
    expect(provider).not.toMatch(/^import .*@\/(components\/igra|lib\/igra-art)/m);
  });

  test("zvuk samo za uspeh i samo kroz playIgraSfx", () => {
    expect(provider).toContain('if (record.tone === "success") playIgraSfx("success");');
    expect(provider).not.toMatch(/new Audio|AudioContext/);
  });

  test("greška ostaje `role=alert` sa ikonom; zatvaranje je mete 44 px i ima natpis po jeziku", () => {
    expect(provider).toContain('role={toast.tone === "error" ? "alert" : "status"}');
    expect(provider).toContain("size-11");
    expect(provider).toContain('t(toast.locale, "Zatvori obaveštenje", "Close notification")');
  });
});

describe("zvuk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubBrowser(setting: string | null) {
    const play = vi.fn(() => Promise.resolve());
    const Audio = vi.fn(function (this: { play: typeof play; volume: number }) {
      this.play = play;
      this.volume = 1;
    });
    vi.stubGlobal("document", {});
    vi.stubGlobal("window", { localStorage: { getItem: () => setting } });
    vi.stubGlobal("Audio", Audio);
    return { Audio, play };
  }

  test("automatski zvuci aplikacije idu samo kroz prekidač (isti ključ svuda)", () => {
    // Zvuk događaja (slavlje, tost) pušta samo `playIgraSfx`, i to samo iz ova dva mesta.
    const callers = [...POST_LOGIN_ROOTS, "components/ui"].flatMap(tsxFiles).filter((file) => read(file).includes("playIgraSfx("));
    expect(callers.sort()).toEqual(["components/igra/celebration-host.tsx", "components/ui/toast-provider.tsx"]);
    // Jedini drugi automatski zvuk je ping četa: čuva ga isti prekidač.
    const chat = read("components/app/chat/chat-notifications.tsx");
    expect(chat).toMatch(/if \(soundEnabled && .*\) playQuietPing\(\);/);
    expect(chat.match(/playQuietPing\(\);/g)).toHaveLength(1);
    for (const file of ["lib/igra-sound.ts", "components/app/sound-toggle.tsx", "components/app/chat/chat-notifications.tsx"]) {
      expect(read(file), file).toContain('const SOUND_KEY = "nauciai-chat-sound";');
    }
    // Fajlovi zvučnih efekata se ne puštaju mimo `lib/igra-sound.ts`.
    for (const file of POST_LOGIN_ROOTS.flatMap(tsxFiles)) expect(read(file), file).not.toMatch(/new Audio\([^)]*brand\/crea\/sfx/);
  });

  test("uspeh je postojeći kratak zvuk (bez novih fajlova)", () => {
    expect(IGRA_SFX.success).toBe("stakleni-zvon");
  });

  test("isključen zvuk ne pravi ni Audio", () => {
    const { Audio, play } = stubBrowser("off");
    playIgraSfx("success");
    playIgraSfx("level");
    expect(Audio).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  test("uključen (podrazumevano) svira tiho", () => {
    const { Audio, play } = stubBrowser(null);
    playIgraSfx("success");
    expect(Audio).toHaveBeenCalledWith("/brand/crea/sfx/stakleni-zvon.mp3");
    expect(play).toHaveBeenCalledTimes(1);
  });
});
