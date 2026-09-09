"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * Adresa MCP servera sa dugmetom za kopiranje (MCP-P6-JAVNA-STRANA). Isti
 * obrazac kao kopiranje ključa u `RevealKeyDialog` (`api-keys-page.tsx`):
 * `navigator.clipboard`, kratka potvrda, tiha greška ako pretraživač odbije.
 */
export function McpAddressCopy({ address, copyLabel, copiedLabel }: { address: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Tiho: dugme ostaje, korisnik selektuje tekst rukom.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 select-all break-all rounded-[12px] border border-line bg-paper px-4 py-3 font-mono text-sm font-bold text-ink">
        {address}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-paper-strong px-4 py-2 text-sm font-extrabold text-ink shadow-[3px_3px_0_0_var(--shadow-hard)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
