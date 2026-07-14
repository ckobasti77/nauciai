import { describe, expect, it } from "vitest";

import { parseRichText, plainTextToRichText, richTextHasContent, richTextToPlainText } from "./rich-text";

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
