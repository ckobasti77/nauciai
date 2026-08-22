import { describe, expect, test } from "vitest";

import { parseDataUrl } from "./data-url";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("parseDataUrl", () => {
  test("procentno kodiran SVG - tacno oblik koji upisuje mock provajder", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>ćošak</text></svg>';
    const parsed = parseDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);

    expect(parsed?.mimeType).toBe("image/svg+xml");
    expect(decode(parsed!.bytes)).toBe(svg);
  });

  test("base64 oblik", () => {
    const parsed = parseDataUrl("data:image/png;base64,QUJD");
    expect(parsed?.mimeType).toBe("image/png");
    expect(decode(parsed!.bytes)).toBe("ABC");
  });

  test("http i https vracaju null - oni idu na fetch, ne ovuda", () => {
    expect(parseDataUrl("https://fal.media/files/x.mp4")).toBeNull();
    expect(parseDataUrl("http://localhost/x.png")).toBeNull();
  });

  test("neispravan zapis vraca null umesto praznog fajla", () => {
    // Bez zareza nema tela.
    expect(parseDataUrl("data:image/png;base64")).toBeNull();
    // `%` bez dve cifre ruši `decodeURIComponent`.
    expect(parseDataUrl("data:text/plain,100%")).toBeNull();
  });

  test("bez MIME tipa pada na text/plain, ne na prazan tip", () => {
    expect(parseDataUrl("data:,zdravo")?.mimeType).toBe("text/plain");
    expect(parseDataUrl("data:;base64,QUJD")?.mimeType).toBe("text/plain");
  });
});
