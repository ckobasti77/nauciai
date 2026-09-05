import { describe, expect, it } from "vitest";

import { COMMUNITY_RICH_TEXT, collectImageStorageIds, parseRichText, plainTextToRichText, richTextHasContent, richTextToPlainText } from "./rich-text";

describe("rich text contract", () => {
  it("converts legacy plain text into safe paragraphs", () => {
    const value = plainTextToRichText("Prvi pasus\n\nDrugi pasus");
    expect(richTextToPlainText(value)).toBe("Prvi pasus\nDrugi pasus");
    expect(richTextHasContent(value)).toBe(true);
  });

  it("accepts supported marks, lists, sizes, and colors", () => {
    const value = JSON.stringify({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Stavka", marks: [{ type: "bold" }, { type: "textStyle", attrs: { fontSize: "18px", color: "#0e3158" } }] }] }] }] }] });
    expect(parseRichText(value)?.type).toBe("doc");
    expect(richTextToPlainText(value)).toBe("Stavka");
  });

  it.each([
    [{ type: "doc", content: [{ type: "heading" }] }, "nedozvoljen blok"],
    [{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] }] }, "nedozvoljeno formatiranje"],
    [{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { fontSize: "99px" } }] }] }] }, "Veličina"],
    [{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: "red" } }] }] }] }, "Boja"],
  ])("rejects unsupported content", (document, message) => {
    expect(() => parseRichText(JSON.stringify(document))).toThrow(message);
  });
});

describe("community rich text contract", () => {
  const spoilerDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "kraj je ", marks: [{ type: "bold" }] }, { type: "text", text: "tajna", marks: [{ type: "spoiler" }] }] }] };
  const imageNode = (attrs: Record<string, unknown>) => ({ type: "doc", content: [{ type: "paragraph" }, { type: "image", attrs }] });

  it("accepts bold/italic/strike/underline, spoiler and images with a storageId", () => {
    const value = JSON.stringify({ type: "doc", content: [
      { type: "paragraph", content: [
        { type: "text", text: "a", marks: [{ type: "bold" }, { type: "italic" }, { type: "strike" }, { type: "underline" }] },
        { type: "text", text: "b", marks: [{ type: "spoiler" }] },
      ] },
      { type: "image", attrs: { storageId: "kg123", alt: "opis", width: 800, height: 600 } },
    ] });
    expect(parseRichText(value, COMMUNITY_RICH_TEXT)?.type).toBe("doc");
    expect(collectImageStorageIds(value)).toEqual(["kg123"]);
  });

  it.each([
    [{ type: "doc", content: [{ type: "heading" }] }, "nedozvoljen blok"],
    [{ type: "doc", content: [{ type: "bulletList", content: [] }] }, "nedozvoljen blok"],
    [{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] }] }, "nedozvoljeno formatiranje"],
    [{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: "#0e3158" } }] }] }] }, "nedozvoljeno formatiranje"],
    [imageNode({ storageId: "k1", src: "https://evil.example/x.png" }), "nedozvoljeno svojstvo"],
    [imageNode({ alt: "bez ida" }), "storageId"],
  ])("rejects content outside the community whitelist", (document, message) => {
    expect(() => parseRichText(JSON.stringify(document), COMMUNITY_RICH_TEXT)).toThrow(message);
  });

  it("rejects a seventh inline image", () => {
    const images = Array.from({ length: 7 }, (_, index) => ({ type: "image", attrs: { storageId: `k${index}` } }));
    const value = JSON.stringify({ type: "doc", content: images });
    expect(() => parseRichText(value, COMMUNITY_RICH_TEXT)).toThrow("Najviše 6 slika");
  });

  it("masks spoiler text and drops images in the plain-text projection", () => {
    expect(richTextToPlainText(JSON.stringify(spoilerDoc), COMMUNITY_RICH_TEXT)).toBe("kraj je ▮▮▮");
    const withImage = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "pre" }] }, { type: "image", attrs: { storageId: "k1" } }] });
    expect(richTextToPlainText(withImage, COMMUNITY_RICH_TEXT)).toBe("pre");
  });

  it("keeps legacy plain body identical through the plain→rich→plain round trip", () => {
    const original = "Prvi red\nDrugi red\n\nNovi pasus";
    const rich = plainTextToRichText(original);
    expect(richTextToPlainText(rich, COMMUNITY_RICH_TEXT)).toBe("Prvi red\nDrugi red\nNovi pasus");
    expect(richTextHasContent(rich, "", COMMUNITY_RICH_TEXT)).toBe(true);
  });
});
