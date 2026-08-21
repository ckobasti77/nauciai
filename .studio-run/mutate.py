"""Mutaciono testiranje: privremeno pokvari po jednu popravku i proveri da
odgovarajući test stvarno pukne. Pokreće se ručno (`python .studio-run/mutate.py`
ili sa rednim brojem mutacije); svaka mutacija se vraća u `finally`, pa radno
stablo ostaje netaknuto. Napisano u koraku P1, korisno za svaki sledeći."""

import io
import subprocess
import sys

MUTATIONS = [
    (
        "1. payment_status se ne proverava",
        "app/api/stripe/webhook/route.ts",
        'if (session.payment_status !== "paid") {',
        "if (false) {",
        "app/api/stripe/webhook/route.test.ts",
    ),
    (
        "2. applyStripeGrants tiho izlazi umesto da baci",
        "app/api/stripe/webhook/route.ts",
        'throw new Error("Convex is unreachable for credit grants");\n  }\n\n  for (const grant of grants) {',
        "return;\n  }\n\n  for (const grant of grants) {",
        "app/api/stripe/webhook/route.test.ts",
    ),
    (
        "3. greska iz applyStripeGrant se guta",
        "app/api/stripe/webhook/route.ts",
        '      console.error("Stripe grant was rejected by Convex", event.id, event.type, grant.source, error);\n      throw error;',
        '      console.error("Stripe grant was rejected by Convex", event.id, event.type, grant.source, error);',
        "app/api/stripe/webhook/route.test.ts",
    ),
    (
        "4. markJobRunning ne gleda status",
        "convex/studio.ts",
        '    if (job.status !== "reserved") throw new Error(`POSAO_NIJE_REZERVISAN:${job.status}`);\n',
        "",
        "convex/studio.test.ts",
    ),
    (
        "5. submitJob ne gleda status",
        "convex/studioActions.ts",
        '      if (job.status !== "reserved") return null;',
        "",
        "convex/studioActions.test.ts",
    ),
    (
        "6. sanitizeParams propusta sve",
        "convex/studioCore.ts",
        "  const fields = readParamFields(schemaJson);\n  if (!fields) return { ok: false, reason: \"NEISPRAVNA_SEMA\" };",
        "  const fields = readParamFields(schemaJson);\n  if (!fields) return { ok: false, reason: \"NEISPRAVNA_SEMA\" };\n  return { ok: true, params: raw };",
        "convex/studio.test.ts",
    ),
    (
        "7. dnevni limit troska se ne cita",
        "convex/studio.ts",
        "    if (exceedsDailyCostLimit(usage?.costUsd ?? 0, model.estimatedCostUsd)) {",
        "    if (false) {",
        "convex/studio.test.ts",
    ),
    (
        "8. welcome bonus opet visi na fakturi",
        "convex/creditsCore.ts",
        "      stripeInvoiceId: welcomeBonusKey(userId),",
        '      stripeInvoiceId: `${invoiceId}:welcome`,',
        "convex/credits.test.ts",
    ),
    (
        "9. grantCredits ne proverava postojeci welcome lot",
        "convex/credits.ts",
        "      if (existingBonus) return existingBonus._id;",
        "      if (existingBonus && false) return existingBonus._id;",
        "convex/credits.test.ts",
    ),
    (
        "10. seed ne pina rezoluciju",
        "convex/seed.ts",
        "              ...(resolution ? { resolution } : {}),",
        "",
        "convex/modelCatalog.test.ts",
    ),
    (
        "11. createJob cuva sirove parametre",
        "convex/studio.ts",
        "      params: JSON.stringify(cleanParams),",
        "      params: args.params,",
        "convex/studio.test.ts",
    ),
    (
        "12. neko doda try/catch oko potrosnje (nosivi zid)",
        "convex/studio.ts",
        "    await applySpend(ctx, { userId, amount: creditCost, jobId });",
        '    try {\n      await applySpend(ctx, { userId, amount: creditCost, jobId });\n    } catch {\n      throw new Error("NEDOVOLJNO_KREDITA");\n    }',
        "convex/studio.test.ts",
    ),
    (
        "13. try/catch koji GUTA gresku iz potrosnje",
        "convex/studio.ts",
        "    await applySpend(ctx, { userId, amount: creditCost, jobId });",
        '    try {\n      await applySpend(ctx, { userId, amount: creditCost, jobId });\n    } catch {\n      // tiho nastavlja - posao bi ostao bez naplate\n    }',
        "convex/studio.test.ts",
    ),
    # ── P2: cronovi ────────────────────────────────────────────────────────
    (
        "14. reaper ne gleda starost posla",
        "convex/crons.ts",
        '          q.eq("status", status).lt("createdAt", now - STUCK_AFTER_MS[status]),',
        '          q.eq("status", status).lt("createdAt", now),',
        "convex/crons.test.ts",
    ),
    (
        "15. reserved prag 5 min -> 60 min",
        "convex/crons.ts",
        "reserved: 5 * 60 * 1000 } as const;",
        "reserved: 60 * 60 * 1000 } as const;",
        "convex/crons.test.ts",
    ),
    (
        "16. istek kredita ne smanjuje kesiran balans",
        "convex/credits.ts",
        "    balance: -lot.remaining,",
        "    balance: 0,",
        "convex/crons.test.ts",
    ),
    (
        "17. istek kredita ne gasi lot",
        "convex/credits.ts",
        "  await ctx.db.patch(lot._id, { remaining: 0, exhaustedAt: now });",
        "",
        "convex/crons.test.ts",
    ),
    (
        "18. istek kredita ne preskace vec ugasene lotove",
        "convex/crons.ts",
        '      .filter((q) => q.gt(q.field("remaining"), 0))\n',
        "",
        "convex/crons.test.ts",
    ),
    (
        "19. istek fajlova bez donje granice (poslovi bez expiresAt)",
        "convex/crons.ts",
        '      .withIndex("by_expiry", (q) => q.gt("expiresAt", 0).lte("expiresAt", now))',
        '      .withIndex("by_expiry", (q) => q.lte("expiresAt", now))',
        "convex/crons.test.ts",
    ),
    (
        "20. poster ostaje u storage-u",
        "convex/crons.ts",
        "      if (job.posterStorageId) await ctx.storage.delete(job.posterStorageId);\n",
        "",
        "convex/crons.test.ts",
    ),
    (
        "21. istek fajlova brise ceo red umesto polja",
        "convex/crons.ts",
        "      await ctx.db.patch(job._id, { outputStorageId: undefined, posterStorageId: undefined });",
        "      await ctx.db.delete(job._id);",
        "convex/crons.test.ts",
    ),
    (
        "22. persistOutput ne gleda da posao vec ima fajl",
        "convex/studioActions.ts",
        '    if (!job || job.status !== "done" || !job.falOutputUrl || job.outputStorageId) return null;',
        '    if (!job || job.status !== "done" || !job.falOutputUrl) return null;',
        "convex/studioActions.test.ts",
    ),
    (
        "23. persistOutput ne gleda status posla",
        "convex/studioActions.ts",
        '    if (!job || job.status !== "done" || !job.falOutputUrl || job.outputStorageId) return null;',
        "    if (!job || !job.falOutputUrl) return null;",
        "convex/studioActions.test.ts",
    ),
    (
        "24. neuspelo preuzimanje refundira",
        "convex/studioActions.ts",
        "      await ctx.runMutation(internal.studio.markOutputFailed, {\n        jobId: args.jobId,\n        error: `IZLAZ_NIJE_SACUVAN: ${message}`,\n      });",
        "      await ctx.runMutation(internal.studio.failJob, {\n        jobId: args.jobId,\n        error: `IZLAZ_NIJE_SACUVAN: ${message}`,\n      });",
        "convex/studioActions.test.ts",
    ),
    (
        "25. ne-2xx odgovor se tretira kao uspeh",
        "convex/studioActions.ts",
        "      if (!response.ok) {",
        "      if (false) {",
        "convex/studioActions.test.ts",
    ),
    (
        "26. video dobija istu retenciju kao slika",
        "convex/studioCore.ts",
        "export const OUTPUT_RETENTION_DAYS = { image: 90, audio: 90, video: 30 } as const;",
        "export const OUTPUT_RETENTION_DAYS = { image: 90, audio: 90, video: 90 } as const;",
        "convex/studioActions.test.ts",
    ),
    (
        "27. naslov nije odsecen na 60 znakova",
        "convex/studioCore.ts",
        "  const trimmed = prompt.trim().slice(0, OUTPUT_TITLE_MAX_LENGTH).trim();",
        "  const trimmed = prompt.trim();",
        "convex/studioActions.test.ts",
    ),
    (
        "28. finalizeOutput ne zeleni zadatak",
        "convex/studio.ts",
        "        await applyTaskCompletion(ctx, {",
        "        if (false) await applyTaskCompletion(ctx, {",
        "convex/studioActions.test.ts",
    ),
    (
        "29. createJob ne proverava da je zadatak iz poslate lekcije",
        "convex/studio.ts",
        '        if (!task || task.lessonId !== args.lessonId) throw new Error("ZADATAK_NIJE_U_LEKCIJI");',
        "",
        "convex/studio.test.ts",
    ),
    (
        "30. createJob ne upisuje kontekst lekcije na posao",
        "convex/studio.ts",
        "      ...(args.lessonId ? { lessonId: args.lessonId } : {}),\n      ...(args.taskId ? { taskId: args.taskId } : {}),\n",
        "",
        "convex/studio.test.ts",
    ),
    # ── P4: mock provajder ────────────────────────────────────────────────
    (
        "31. mock se ne aktivira kad FAL_KEY fali (samo STUDIO_MOCK se gleda)",
        "convex/studioActions.ts",
        '      if (!apiKey || process.env.STUDIO_MOCK === "1") {',
        '      if (process.env.STUDIO_MOCK === "1") {',
        "convex/studioActions.test.ts",
    ),
    (
        "32. STUDIO_MOCK=1 override ne radi kad FAL_KEY postoji",
        "convex/studioActions.ts",
        '      if (!apiKey || process.env.STUDIO_MOCK === "1") {',
        "      if (!apiKey) {",
        "convex/studioActions.test.ts",
    ),
    (
        "33. mock falRequestId gubi prefiks",
        "convex/studioActions.ts",
        "          falRequestId: `${MOCK_REQUEST_PREFIX}${args.jobId}`,",
        "          falRequestId: `${args.jobId}`,",
        "convex/studioActions.test.ts",
    ),
    (
        "34. completeMockJob dira i ne-mock (pravi) posao",
        "convex/studioActions.ts",
        '    if (!job || job.status !== "running" || !job.falRequestId?.startsWith(MOCK_REQUEST_PREFIX)) return null;',
        '    if (!job || job.status !== "running") return null;',
        "convex/studioActions.test.ts",
    ),
    (
        "35. mock stopa uspeha nije 85%",
        "convex/studioCore.ts",
        "const MOCK_SUCCESS_RATE = 0.85;",
        "const MOCK_SUCCESS_RATE = 0.5;",
        "convex/studio.test.ts",
    ),
    # ── P6: playground UI ────────────────────────────────────────────────
    (
        "36. listMyJobs vraca samo storageId, bez potpisanog URL-a",
        "convex/studio.ts",
        "          outputUrl: job.outputStorageId ? await ctx.storage.getUrl(job.outputStorageId) : null,",
        "          outputUrl: null,",
        "convex/studio.test.ts",
    ),
    (
        "37. isMock je uvek false - DEMO znacka nema odakle da se procita",
        "convex/studio.ts",
        "          isMock: isMockRequestId(job.falRequestId),",
        "          isMock: false,",
        "convex/studio.test.ts",
    ),
    (
        "38. isMockRequestId prepoznaje i posao bez falRequestId-ja",
        "convex/studioCore.ts",
        "  return falRequestId !== undefined && falRequestId.startsWith(MOCK_REQUEST_PREFIX);",
        "  return true;",
        "convex/studio.test.ts",
    ),
    (
        "39. getStudioState ne cita kill switch",
        "convex/studio.ts",
        "      enabled: flag ? flag.enabled : true,",
        "      enabled: true,",
        "convex/studio.test.ts",
    ),
    (
        "40. getStudioState broji samo reserved, ne i running poslove",
        "convex/studio.ts",
        "      activeJobs: reserved.length + running.length,",
        "      activeJobs: reserved.length,",
        "convex/studio.test.ts",
    ),
    (
        "41. getStudioState ne proverava upis na kurs",
        "convex/studio.ts",
        "      isEnrolled: enrollment !== null,",
        "      isEnrolled: true,",
        "convex/studio.test.ts",
    ),
    (
        "42. forma dozvoljava duzi prompt nego sto server prima",
        "lib/studio-form.ts",
        "        maxLength: Math.min(declared, PROMPT_MAX_LENGTH),",
        "        maxLength: declared,",
        "lib/studio-form.test.ts",
    ),
    (
        "43. buildJobParams ne odseca broj na granice seme",
        "lib/studio-form.ts",
        "      params[field.key] = clampNumber(asNumber, field);",
        "      params[field.key] = asNumber;",
        "lib/studio-form.test.ts",
    ),
    (
        "44. buildJobParams propusta select van skupa do servera",
        "lib/studio-form.ts",
        "      if (typeof value === \"string\" && field.options.includes(value)) params[field.key] = value;",
        "      if (typeof value === \"string\") params[field.key] = value;",
        "lib/studio-form.test.ts",
    ),
    (
        "45. DNEVNI_LIMIT_TROSKA nema svoj ulaz u mapi poruka",
        "lib/studio-form.ts",
        '    "DNEVNI_LIMIT_TROSKA",',
        '    "DNEVNI_LIMIT_NIKAD",',
        "lib/studio-form.test.ts",
    ),
    (
        "46. poznat kod ne dobija svoju poruku",
        "lib/studio-form.ts",
        "    if (raw.includes(code)) return message[locale];",
        "    if (false) return message[locale];",
        "lib/studio-form.test.ts",
    ),
    (
        "47. nepoznata greska prikazuje sirov kod umesto ljudske poruke",
        "lib/studio-form.ts",
        '    ? "Generacija nije pokrenuta. Pokušaj ponovo za koji trenutak."',
        "    ? raw",
        "lib/studio-form.test.ts",
    ),
    (
        "48. istekao fajl se ne razlikuje od posla koji jos preuzima",
        "lib/studio-form.ts",
        '  return job.status === "done" && job.expiresAt !== undefined && !job.outputUrl;',
        "  return false;",
        "lib/studio-form.test.ts",
    ),
    (
        "49. parseParamSchema renderuje i polje nepoznatog tipa",
        "lib/studio-form.ts",
        '    if (field.type === "number") {',
        '    if (field.type !== "nikad") {',
        "lib/studio-form.test.ts",
    ),
    # ── P7: galerija ──────────────────────────────────────────────────────
    (
        "50. deleteJob ne proverava labOutputId (dokaz zadatka bi nestao)",
        "convex/studio.ts",
        '    if (job.labOutputId) throw new Error("POSAO_POVEZAN_SA_LEKCIJOM");\n',
        "",
        "convex/studio.test.ts",
    ),
    (
        "51. deleteJob brise posao koji je jos u letu",
        "convex/studio.ts",
        '    if (job.status === "reserved" || job.status === "running") throw new Error("POSAO_U_TOKU");\n',
        "",
        "convex/studio.test.ts",
    ),
    (
        "52. deleteJob ne proverava vlasnistvo posla",
        "convex/studio.ts",
        "    if (!job || job.userId !== userId) throw new Error(\"Posao nije pronađen.\");",
        "    if (!job) throw new Error(\"Posao nije pronađen.\");",
        "convex/studio.test.ts",
    ),
    (
        "53. listMyJobs ignorise kind filter",
        "convex/studio.ts",
        '    if (args.kind !== undefined) {\n      const kind = args.kind;\n      ordered = ordered.filter((q) => q.eq(q.field("kind"), kind));\n    }\n',
        "",
        "convex/studio.test.ts",
    ),
    (
        "54. listMyJobs ignorise createdAfter filter",
        "convex/studio.ts",
        '    if (args.createdAfter !== undefined) {\n      const createdAfter = args.createdAfter;\n      ordered = ordered.filter((q) => q.gte(q.field("createdAt"), createdAfter));\n    }\n',
        "",
        "convex/studio.test.ts",
    ),
    (
        "55. expiryBadgeDays prijavljuje i vec istekao fajl",
        "lib/studio-gallery.ts",
        "  if (msLeft <= 0) return null;",
        "  if (false) return null;",
        "lib/studio-gallery.test.ts",
    ),
    (
        "56. grantDemoCredits sa fiksnim kljucem idempotencije",
        "convex/seed.ts",
        "        value: `demo:${user._id}:${existingGrants.length + 1}`,",
        "        value: `demo:${user._id}`,",
        "convex/seed.test.ts",
    ),
    (
        "57. grantDemoCredits bez normalizacije mejla",
        "convex/seed.ts",
        "    const email = normalizeEmail(args.email);",
        "    const email = args.email;",
        "convex/seed.test.ts",
    ),
    (
        "58. grantDemoCredits bez requireSyncSecret",
        "convex/seed.ts",
        "    requireSyncSecret(args.syncSecret);" + chr(10) * 2 + "    const email = normalizeEmail",
        "    const email = normalizeEmail",
        "convex/seed.test.ts",
    ),
]


def run(only=None):
    for index, (title, path, old, new, test_file) in enumerate(MUTATIONS, start=1):
        if only and index != only:
            continue
        original = io.open(path, encoding="utf-8").read()
        if old not in original:
            print(f"[{index}] {title}: NIJE NADJEN OBRAZAC u {path}")
            continue
        io.open(path, "w", encoding="utf-8", newline="\n").write(original.replace(old, new, 1))
        try:
            result = subprocess.run(
                ["npx", "vitest", "run", test_file],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=True,
            )
            failed = result.returncode != 0
            marker = "OK (test pada)" if failed else "!!! TEST NE HVATA MUTACIJU"
            tail = [line for line in result.stdout.splitlines() if "Tests" in line]
            print(f"[{index}] {title}: {marker} {tail[-1].strip() if tail else ''}")
        finally:
            io.open(path, "w", encoding="utf-8", newline="\n").write(original)


if __name__ == "__main__":
    run(int(sys.argv[1]) if len(sys.argv) > 1 else None)
