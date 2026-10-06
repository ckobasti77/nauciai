"use client";

import { optionOf, speciesById, type CharacterChoice } from "@/lib/crea-character";

/**
 * Sličica lika iz izbora (S36): glava, kosa, oči i odeća u izabranim bojama -
 * da korisnik vidi da klik nešto menja pre nego što plati list. Boje su sadržaj
 * lika (kao sličice stilova u K13), pa idu kroz `fill`, iste u obe teme; obris je
 * mastilo teme (`currentColor`).
 */
export function CharacterDoll({ choice, className }: { choice: CharacterChoice; className?: string }) {
  const species = speciesById(choice.vrsta);
  const robot = species.id === "robot";
  const skin = robot ? "#c7ced6" : (optionOf("ten", choice.ten)?.swatch ?? "#d9a77f");
  const hair = optionOf("bojaKose", choice.bojaKose)?.swatch ?? "#6b4226";
  const eyes = optionOf("oci", choice.oci)?.swatch ?? "#6b4226";
  const outfit = optionOf("odeca", choice.odeca)?.swatch ?? "#4a78b5";
  const hairStyle = species.uses.hair ? choice.kosa : "celav";
  const stroke = { stroke: "currentColor", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

  return (
    <svg viewBox="0 0 120 160" aria-hidden="true" className={className}>
      {/* Duga kosa iza glave */}
      {hairStyle === "duga" || hairStyle === "pletenica" ? (
        <path d="M33 52 Q32 96 44 104 L76 104 Q88 96 87 52 Z" fill={hair} {...stroke} />
      ) : null}
      {/* Telo i odeća */}
      <path d="M30 150 Q30 104 60 102 Q90 104 90 150 Z" fill={outfit} {...stroke} />
      <path d="M52 102 L60 114 L68 102" fill="none" {...stroke} />
      {/* Vrat */}
      <rect x="53" y="86" width="14" height="16" fill={skin} {...stroke} />
      {/* Glava */}
      {robot ? (
        <>
          <line x1="60" y1="20" x2="60" y2="30" {...stroke} />
          <circle cx="60" cy="17" r="4" fill="#f4be30" {...stroke} />
          <rect x="36" y="30" width="48" height="58" rx="10" fill={skin} {...stroke} />
        </>
      ) : (
        <ellipse cx="60" cy="60" rx="24" ry="29" fill={skin} {...stroke} />
      )}
      {species.id === "vilenjak" ? (
        <>
          <path d="M36 58 L24 46 L37 66" fill={skin} {...stroke} />
          <path d="M84 58 L96 46 L83 66" fill={skin} {...stroke} />
        </>
      ) : null}
      {/* Kosa preko glave */}
      {hairStyle === "kratka" ? <path d="M36 52 Q38 28 60 28 Q82 28 84 52 Q72 40 60 42 Q48 40 36 52 Z" fill={hair} {...stroke} /> : null}
      {hairStyle === "srednja" || hairStyle === "duga" || hairStyle === "pletenica" ? (
        <path d="M34 62 Q32 28 60 28 Q88 28 86 62 Q80 44 60 42 Q40 44 34 62 Z" fill={hair} {...stroke} />
      ) : null}
      {hairStyle === "srednja" ? (
        <>
          <path d="M34 60 Q32 80 40 86" fill="none" stroke={hair} strokeWidth={8} strokeLinecap="round" />
          <path d="M86 60 Q88 80 80 86" fill="none" stroke={hair} strokeWidth={8} strokeLinecap="round" />
        </>
      ) : null}
      {hairStyle === "kovrdzava" ? (
        <g fill={hair} {...stroke}>
          <circle cx="40" cy="44" r="10" />
          <circle cx="52" cy="34" r="10" />
          <circle cx="68" cy="34" r="10" />
          <circle cx="80" cy="44" r="10" />
          <circle cx="36" cy="58" r="8" />
          <circle cx="84" cy="58" r="8" />
        </g>
      ) : null}
      {hairStyle === "pundja" ? (
        <>
          <circle cx="60" cy="24" r="9" fill={hair} {...stroke} />
          <path d="M36 54 Q38 32 60 32 Q82 32 84 54 Q72 42 60 44 Q48 42 36 54 Z" fill={hair} {...stroke} />
        </>
      ) : null}
      {hairStyle === "pletenica" ? <path d="M78 86 Q90 108 84 128" fill="none" stroke={hair} strokeWidth={8} strokeLinecap="round" /> : null}
      {/* Oči i osmeh */}
      <circle cx="51" cy="62" r="4" fill={eyes} {...stroke} strokeWidth={2} />
      <circle cx="69" cy="62" r="4" fill={eyes} {...stroke} strokeWidth={2} />
      {choice.dodatak === "naocare" ? (
        <g fill="none" {...stroke} strokeWidth={2.5}>
          <circle cx="51" cy="62" r="8" />
          <circle cx="69" cy="62" r="8" />
          <line x1="59" y1="62" x2="61" y2="62" />
        </g>
      ) : null}
      <path d="M52 76 Q60 82 68 76" fill="none" {...stroke} strokeWidth={2.5} />
      {choice.dodatak === "kapa" ? <path d="M34 46 Q36 22 60 22 Q84 22 86 46 Z M84 44 L100 46" fill="#d9493a" {...stroke} /> : null}
      {choice.dodatak === "sal" ? <path d="M42 100 Q60 112 78 100 L80 108 Q60 120 40 108 Z" fill="#f4be30" {...stroke} /> : null}
      {choice.dodatak === "slusalice" ? <path d="M40 98 Q60 112 80 98" fill="none" stroke="currentColor" strokeWidth={6} strokeLinecap="round" /> : null}
    </svg>
  );
}
