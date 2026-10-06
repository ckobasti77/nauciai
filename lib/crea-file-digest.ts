/**
 * Otisak fajla koji se najavljuje uz dozvolu za upload (K30, nalaz K29-01):
 * sha256 u base64 - isti oblik koji Convex upisuje u `_storage.sha256` - i
 * veličina u bajtovima. Server prijavu fajla drugačijeg sadržaja odbija, pa
 * dozvola ne može da prisvoji tuđ fajl.
 */
export async function fileDigest(blob: Blob): Promise<{ sha256: string; size: number }> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  let binary = "";
  for (const byte of hash) binary += String.fromCharCode(byte);
  return { sha256: btoa(binary), size: blob.size };
}
