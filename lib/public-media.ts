import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Postoji li fajl u `public/`? Javne strane time biraju hero medij PRE rendera, pa
 * poster/loop koji još nije nacrtan ne završi kao polomljen `<video>` ili prazan
 * pravougaonik — komponenta dobije `undefined` i prikaže samo krem podlogu (N7).
 *
 * Provera je namerno BEZ keša: `existsSync` je jedan jeftin syscall po zahtevu, a keš
 * bi značio da fajl ubačen u `public/` dok server radi ne bi bio viđen do restarta.
 */
export function publicFileExists(publicPath: string): boolean {
  return existsSync(path.join(process.cwd(), "public", publicPath.replace(/^\/+/, "")));
}

/** Ista putanja ako fajl postoji, inače `undefined` — spremno za opcioni prop. */
export function existingPublicPath(publicPath: string | undefined): string | undefined {
  if (!publicPath) return undefined;
  return publicFileExists(publicPath) ? publicPath : undefined;
}
