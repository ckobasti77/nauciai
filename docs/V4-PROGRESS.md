# V4 - dnevnik implementacije

Svaki korak dopisuje svoj red na kraj. Ne brisati ranije redove.

Korak | Status | Sta je uradjeno | Fajlovi
--- | --- | --- | ---
N1 | gotovo | Nova singleton tabela `platformSettings` (kontakt, mreze, cene, pravni podaci) sa javnim `get` upitom i admin-only `update` mutacijom koja validira e-adresu, E.164 telefon i https URL mreze sa ocekivanog domena. Novi admin ekran /app/admin/settings sa cetiri kartice (cuvanje po kartici, optimisticki prikaz, toast, napomena gde se polje prikazuje) i nova stavka „Opste informacije“ u admin navigaciji. Sekcija cena na landingu vise ne cita `lib/pricing.ts` direktno nego `platformSettings` kroz `resolveSettings`; `lib/pricing.ts` je od sada samo rezerva. | `convex/schema.ts`, `convex/platformSettings.ts`, `convex/platformSettings.test.ts`, `lib/platform-settings.ts`, `lib/platform-settings.test.ts`, `lib/pricing.ts`, `lib/convex-http.ts`, `lib/sidebar-contexts.ts`, `lib/sidebar-contexts.test.ts`, `components/app/admin-platform-settings.tsx`, `components/marketing/marketing-page.tsx`, `app/[locale]/app/admin/settings/page.tsx`, `app/[locale]/(marketing)/page.tsx`
