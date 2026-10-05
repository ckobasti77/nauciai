/* eslint-disable @next/next/no-img-element -- pregled je lokalni `blob:` URL, koji next/image ne obrađuje. */
"use client";

/** Rezultat na šahovnici kad je providan, da se vidi gde je pozadina nestala. */
export function TransparentPreview({ url, alt, transparent }: { url: string; alt: string; transparent: boolean }) {
  return (
    <div
      className="surface-media grid place-items-center overflow-hidden bg-paper p-2 shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]"
      style={
        transparent
          ? {
              backgroundImage: "repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%)",
              backgroundSize: "20px 20px",
            }
          : undefined
      }
    >
      <img src={url} alt={alt} className="max-h-96 w-auto max-w-full object-contain" />
    </div>
  );
}
