import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { fillCopy } from "@/lib/crea-copy";
import { CREA_CARD_COPY, CREA_STAMP_COPY } from "@/lib/crea-game-copy";
import { CONDUCT_LABEL, GRADE_LABEL, REPORT_SUBJECTS } from "@/lib/crea-report-card";
import type { SharedReportCard } from "@/lib/crea-report-card-share";
import type { Locale } from "@/lib/i18n";

/**
 * Slika đačke knjižice za deljenje (K26, G5) - `next/og` (Satori), 1200 × 630. Uvek u
 * bojama svetle teme brenda (papir, mastilo, žuta): to je fajl koji se deli, ne ekran,
 * pa tema ne važi i boje su zakucane ovde (nisu `className`).
 */

const PAPER = "#fffdf8";
const PAPER_STRONG = "#ffffff";
const INK = "#0e3158";
const MUTED = "#536273";
const LINE = "#c9d4df";
const YELLOW = "#f4be30";

async function assets() {
  const root = process.cwd();
  const [semi, black, seal] = await Promise.all([
    readFile(join(root, "assets/og/Nunito-SemiBold.ttf")),
    readFile(join(root, "assets/og/Nunito-Black.ttf")),
    readFile(join(root, "public/brand/crea/crea-pecat.svg"), "utf8"),
  ]);
  // C2PA metapodaci su veći deo fajla, a slici ne trebaju.
  const svg = seal.replace(/<metadata>[\s\S]*?<\/metadata>/, "");
  return { semi, black, seal: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

export async function reportCardImage(data: SharedReportCard, locale: Locale): Promise<ImageResponse> {
  const { semi, black, seal } = await assets();
  const { card } = data;
  const overall = card.overall
    ? `${GRADE_LABEL[card.overall.grade][locale]} (${card.overall.average.toLocaleString(locale === "sr" ? "sr-RS" : "en-US", { minimumFractionDigits: 2 })})`
    : CREA_CARD_COPY.overallNone[locale];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, fontFamily: "Nunito", color: INK, padding: 40 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            background: PAPER_STRONG,
            border: `4px solid ${INK}`,
            borderRadius: 16,
            boxShadow: `12px 12px 0 0 ${YELLOW}`,
            padding: "28px 36px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: MUTED }}>{CREA_CARD_COPY.school[locale]}</div>
              <div style={{ fontSize: 50, fontWeight: 900, lineHeight: 1.05 }}>{CREA_CARD_COPY.title[locale]}</div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 600, marginTop: 6 }}>
                {CREA_CARD_COPY.student[locale]}:&nbsp;<span style={{ fontWeight: 900 }}>{data.name}</span>&nbsp;
                <span style={{ color: MUTED }}>@{data.username}</span>
              </div>
            </div>
            <div style={{ display: "flex", position: "relative", width: 150, height: 150, transform: "rotate(-8deg)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Satori crta <img>, nije DOM. */}
              <img src={seal} width={150} height={150} alt="" />
              {card.overall?.grade === 5 ? (
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 20, display: "flex", justifyContent: "center" }}>
                  <div style={{ background: INK, color: PAPER_STRONG, borderRadius: 999, padding: "3px 12px", fontSize: 19, fontWeight: 900 }}>
                    {CREA_STAMP_COPY.grade[locale]}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {card.subjects.map((subject) => (
              <div
                key={subject.id}
                style={{ display: "flex", alignItems: "center", borderTop: `2px solid ${LINE}`, padding: "6px 0", fontSize: 25 }}
              >
                <div style={{ width: 300, fontWeight: 900 }}>{REPORT_SUBJECTS.find((s) => s.id === subject.id)!.label[locale]}</div>
                {subject.grade ? (
                  <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 999,
                        background: INK,
                        color: PAPER_STRONG,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 26,
                      }}
                    >
                      {subject.grade}
                    </div>
                    <div style={{ marginLeft: 14, fontWeight: 600 }}>{GRADE_LABEL[subject.grade][locale]}</div>
                  </div>
                ) : (
                  <div style={{ flex: 1, color: MUTED, fontWeight: 600 }}>{CREA_CARD_COPY.ungraded[locale]}</div>
                )}
                <div style={{ color: MUTED, fontWeight: 600 }}>{`${subject.done}/${subject.total}`}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: "auto", borderTop: `2px solid ${LINE}`, paddingTop: 12, fontSize: 24 }}>
            <div style={{ display: "flex", marginRight: 36 }}>
              <span style={{ color: MUTED, fontWeight: 600 }}>{CREA_CARD_COPY.conduct[locale]}:&nbsp;</span>
              <span style={{ fontWeight: 900 }}>{CONDUCT_LABEL[card.conduct][locale]}</span>
            </div>
            <div style={{ display: "flex", marginRight: 36 }}>
              <span style={{ color: MUTED, fontWeight: 600 }}>{CREA_CARD_COPY.overall[locale]}:&nbsp;</span>
              <span style={{ fontWeight: 900 }}>{overall}</span>
            </div>
            <div style={{ display: "flex", marginLeft: "auto", color: MUTED, fontWeight: 600 }}>
              {`${fillCopy(CREA_CARD_COPY.streak[locale], { n: card.bestStreak })} · nauciai.com/crea`}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Nunito", data: semi, weight: 600, style: "normal" },
        { name: "Nunito", data: black, weight: 900, style: "normal" },
      ],
      // Kratko: vlasnik može da sakrije knjižicu, a slika ne sme dugo da ostane u kešu.
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    },
  );
}
