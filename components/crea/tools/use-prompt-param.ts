"use client";

import { useSearchParams } from "next/navigation";
import { useState, type Dispatch, type SetStateAction } from "react";

import { creaPromptFromParams } from "@/lib/crea-shell";

/**
 * Glavno polje za opis alata koje prima `?opis=` (K25, U11: „Napravi ovako" iz inspiracije;
 * K13: „Probni list" iz composera). Opis iz adrese je početna vrednost, a nov opis u adresi
 * (drugi primer u istom alatu) zameni tekst - isto pravilo kao `starterPrompt` u composeru.
 */
export function usePromptParamState(): [string, Dispatch<SetStateAction<string>>] {
  const searchParams = useSearchParams();
  const prefill = creaPromptFromParams(searchParams);
  const [text, setText] = useState(prefill ?? "");
  const [seen, setSeen] = useState(prefill);
  if (prefill !== seen) {
    setSeen(prefill);
    if (prefill !== null) setText(prefill);
  }
  return [text, setText];
}
