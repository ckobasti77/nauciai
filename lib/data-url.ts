/**
 * `data:` URL -> bajtovi, bez mreze.
 *
 * Postoji zbog jednog konkretnog kvara: mock provajder (kad nema `FAL_KEY`)
 * upisuje izlaz kao `data:image/svg+xml;utf8,...`, a Convex `fetch` podrzava
 * samo `http` i `https`. Posao je zato zavrsavao kao `done` BEZ fajla, sa
 * `IZLAZ_NIJE_SACUVAN: Unsupported URL scheme`, a `studio.markOutputFailed`
 * NAMERNO ne refundira (kod pravog provajdera generacija jeste naplacena).
 * Rezultat je bio demo posao koji skine kredite i ne isporuci nista.
 *
 * Podrzana su oba oblika koja `data:` URL ume da ima: `;base64,` i procentno
 * kodiran tekst. Sve ostalo vraca `null`, pa pozivalac pada na `fetch`.
 */
export type InlineData = { mimeType: string; bytes: Uint8Array };

const DEFAULT_MIME = "text/plain";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

export function parseDataUrl(url: string): InlineData | null {
  if (!url.startsWith("data:")) return null;

  const comma = url.indexOf(",");
  if (comma === -1) return null;

  // `data:[<mediatype>][;base64],<data>` - sve izmedju `data:` i zareza su
  // parametri, a samo je poslednji od njih `base64` kad ga ima.
  const meta = url.slice("data:".length, comma);
  const payload = url.slice(comma + 1);
  const parts = meta.split(";").filter(Boolean);
  const isBase64 = parts[parts.length - 1]?.toLowerCase() === "base64";
  // Parametri koji nisu MIME (`charset=utf-8`, `utf8`, `base64`) ne ulaze u tip.
  const mimeType = parts[0] && parts[0].includes("/") ? parts[0] : DEFAULT_MIME;

  try {
    if (isBase64) return { mimeType, bytes: base64ToBytes(payload) };

    return { mimeType, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
  } catch {
    // Neispravan procentni zapis ili base64 - bolje `null` (pa `fetch`, pa
    // jasna greska) nego prazan fajl koji izgleda kao uspeh.
    return null;
  }
}
