/**
 * Mejl adminima o stanju platforme, istim putem kao `emailVerification.ts`
 * (Resend, `AUTH_RESEND_KEY` / `AUTH_RESEND_FROM`, primaoci iz
 * `INITIAL_ADMIN_EMAILS`).
 *
 * **Nikad ne baca.** Alarm je posledica nečega što je već upisano u bazu, pa
 * greška u slanju sme samo da se zaloguje - inače bi pokvaren Resend ključ
 * obarao transakciju koja je alarm i izazvala. Zato log nosi ceo kontekst: kad
 * mejl ne prođe, Convex log je jedini trag da je alarm uopšte opalio.
 *
 * `crons.ts` ima svoju kopiju ovog slanja (globalni dnevni plafon, W2). Nije
 * preseljena ovamo namerno - pravila run-a traže hirurške izmene, a taj kod
 * ovaj korak ne dira. Spajanje je zaseban, sam po sebi bezopasan korak.
 */

import { env } from "./_generated/server";
import { parseAdminEmails } from "../lib/admin-emails";

export async function sendAdminAlertEmail(params: {
  subject: string;
  text: string;
  /** Šta ide u log kad slanje nije moguće ili ne uspe. */
  context: Record<string, unknown>;
}): Promise<void> {
  const apiKey = String(env.AUTH_RESEND_KEY ?? "").trim();
  const from = String(env.AUTH_RESEND_FROM ?? "").trim();
  const to = [...parseAdminEmails(env.INITIAL_ADMIN_EMAILS)];

  if (!apiKey || !from || to.length === 0) {
    console.error("admin_alert_not_configured", {
      ...params.context,
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
      recipients: to.length,
    });

    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: params.subject, text: params.text }),
    });
    if (!response.ok) {
      console.error("admin_alert_provider_error", {
        ...params.context,
        status: response.status,
        providerRequestId: response.headers.get("x-request-id") ?? undefined,
      });
    }
  } catch (error) {
    console.error("admin_alert_failed", params.context, error);
  }
}
