/**
 * HEIC → JPG (S27, K09). `heic-to` (LGPL-3.0, libheif u WASM-u) je ~3 MB i
 * učitava se TEK kad korisnik izabere HEIC fajl - nikad u radionici ni u alatu
 * unapred. Paket se koristi nemenjan, iz `node_modules`, kao zaseban async chunk
 * (uslov LGPL-a: korisnik može da ga zameni drugom verzijom istog API-ja).
 * `heic-to/csp` je ista biblioteka bez `eval`-a, da je ne obori stroži CSP.
 */
export async function heicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import("heic-to/csp");
  const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  const base = file.name.replace(/\.(heic|heif)$/i, "") || "slika";
  return new File([jpeg], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
}
