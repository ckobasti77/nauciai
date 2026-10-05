import { describe, expect, test } from "vitest";

import { crc32, createZip } from "./crea-zip";

const text = (value: string) => new TextEncoder().encode(value);

describe("ZIP (STORE)", () => {
  test("CRC-32 poznatih ulaza", () => {
    expect(crc32(text(""))).toBe(0);
    expect(crc32(text("hello"))).toBe(0x3610a686);
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
  });

  test("lokalna zaglavlja, centralni direktorijum i kraj se slažu", () => {
    const files = [
      { name: "nalepnica-1.webp", data: text("prva") },
      { name: "čestitka/ђ.txt", data: text("druga, malo duža") },
    ];
    const zip = createZip(files);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);

    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralSize = view.getUint32(end + 12, true);
    const centralOffset = view.getUint32(end + 16, true);
    expect(centralOffset + centralSize).toBe(end);

    // Čitanje nazad kroz centralni direktorijum: ime, veličina, CRC i podaci.
    let at = centralOffset;
    for (const file of files) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const nameLength = view.getUint16(at + 28, true);
      const size = view.getUint32(at + 24, true);
      const local = view.getUint32(at + 42, true);
      expect(new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))).toBe(file.name);
      expect(view.getUint32(at + 16, true)).toBe(crc32(file.data));
      expect(view.getUint16(at + 8, true) & 0x0800).toBe(0x0800);
      const localName = view.getUint16(local + 26, true);
      const data = zip.subarray(local + 30 + localName, local + 30 + localName + size);
      expect([...data]).toEqual([...file.data]);
      at += 46 + nameLength;
    }
  });

  test("isti ulaz daje isti paket", () => {
    const files = [{ name: "a.txt", data: text("a") }];
    expect([...createZip(files)]).toEqual([...createZip(files)]);
  });
});
