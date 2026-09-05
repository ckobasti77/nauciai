import { describe, expect, it } from "vitest";

import { buildShareLinks } from "./community-share";

describe("buildShareLinks", () => {
  const url = "https://nauci.ai/sr/app/community/abc123";
  const title = "Kako da počnem sa AI videom?";

  it("returns the five targets in a stable order", () => {
    const links = buildShareLinks(url, title);
    expect(links.map((link) => link.key)).toEqual([
      "whatsapp",
      "viber",
      "telegram",
      "x",
      "email",
    ]);
  });

  it("puts title and url together for WhatsApp, Viber and Email", () => {
    const links = buildShareLinks(url, title);
    const expected = encodeURIComponent(`${title} ${url}`);
    expect(links.find((link) => link.key === "whatsapp")?.href).toBe(`https://wa.me/?text=${expected}`);
    expect(links.find((link) => link.key === "viber")?.href).toBe(`viber://forward?text=${expected}`);
    expect(links.find((link) => link.key === "email")?.href).toBe(
      `mailto:?subject=${encodeURIComponent(title)}&body=${expected}`,
    );
  });

  it("splits url and text for Telegram and X", () => {
    const links = buildShareLinks(url, title);
    expect(links.find((link) => link.key === "telegram")?.href).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    );
    expect(links.find((link) => link.key === "x")?.href).toBe(
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    );
  });

  it("encodes Serbian letters and query-breaking punctuation", () => {
    const links = buildShareLinks("https://nauci.ai/x?a=1&b=2", "Šta & đe? #ćup");
    const whatsapp = links.find((link) => link.key === "whatsapp")?.href ?? "";
    expect(whatsapp).not.toContain(" ");
    expect(whatsapp).not.toContain("&b=2");
    expect(whatsapp).toContain(encodeURIComponent("Šta & đe? #ćup"));
  });

  it("falls back to the url alone when the title is empty", () => {
    const links = buildShareLinks(url, "   ");
    expect(links.find((link) => link.key === "whatsapp")?.href).toBe(
      `https://wa.me/?text=${encodeURIComponent(url)}`,
    );
  });
});
