# Fakultet za AI

Production-oriented MVP for a bilingual Serbian/English AI education platform built with Next.js App Router, Convex/Auth, Stripe Billing, Mux Video, GSAP, Motion, and Tailwind CSS.

## Routes

- `/sr` and `/en`: localized marketing pages.
- `/sr/sign-in` and `/en/sign-in`: Convex Auth sign-in and registration.
- `/sr/app` and `/en/app`: student dashboard.
- `/sr/app/courses/[courseSlug]/lessons/[lessonSlug]`: protected lesson player for a selected track.
- `/sr/app/community`: student community board.
- `/sr/app/profile`: profile surface.
- `/sr/app/billing`: subscription management entrypoint.
- `/sr/admin`: admin workbench shell.
- `/api/stripe/webhook` and `/api/mux/webhook`: raw-body webhook endpoints.

## Local setup

```bash
npm install
copy .env.example .env.local
npx convex dev
npm run convex:auth
npm run convex:oauth
npm run convex:seed
npm run dev
```

`npx convex dev` creates or links the Convex deployment and fills `CONVEX_DEPLOYMENT` / `NEXT_PUBLIC_CONVEX_URL`. The app intentionally renders a setup state when Convex is not configured, so local UI work can continue before live services are connected.
`npm run convex:auth` generates the Convex Auth RS256 key material and sets `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` in the active Convex deployment.
`npm run convex:oauth` sets OAuth provider credentials on the active Convex deployment. Use the production variants below for the production deployment.
`npm run convex:seed` creates the initial Smer za video i audio and Smer za web sajtove records in Convex. It also passes Stripe price IDs from `.env.local` when they exist.

## Required services

Convex:

```bash
npx convex dev
npm run convex:auth
npx convex env set AUTH_SECRET "<random-secret>"
npx convex env set WEBHOOK_SYNC_SECRET "<same-value-as-env-local>"
npx convex env set INITIAL_ADMIN_EMAILS "admin@example.com"
npm run convex:oauth -- --google-id "<google-client-id>" --google-secret "<google-client-secret>" --skip-apple
```

For production, configure the production Convex deployment:

```bash
npm run convex:auth:prod
npx convex env --prod set AUTH_SECRET "<random-secret>"
npx convex env --prod set WEBHOOK_SYNC_SECRET "<same-value-as-vercel>"
npx convex env --prod set INITIAL_ADMIN_EMAILS "nauciai2026@gmail.com"
npm run convex:oauth:prod -- --google-id "<prod-google-client-id>" --google-secret "<prod-google-client-secret>" --skip-apple
```

Google OAuth should use separate dev and prod web clients:

- Dev redirect URI: `https://wandering-fox-41.eu-west-1.convex.site/api/auth/callback/google`
- Prod redirect URI: `https://quick-yak-270.eu-west-1.convex.site/api/auth/callback/google`
- Dev JavaScript origin: `http://localhost:3000`
- Prod JavaScript origin: `https://nauciai.vercel.app`

Vercel production needs only the public Convex bindings and Next-side secrets:

```bash
NEXT_PUBLIC_SITE_URL=https://nauciai.vercel.app
NEXT_PUBLIC_CONVEX_URL=https://quick-yak-270.eu-west-1.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://quick-yak-270.eu-west-1.convex.site
CONVEX_DEPLOYMENT=prod:quick-yak-270
WEBHOOK_SYNC_SECRET=<same-value-as-convex>
```

Convex-only secrets such as `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JWT_PRIVATE_KEY`, and `JWKS` must live in Convex environment variables. Do not rely on Vercel to provide them to Convex Auth.

If secrets were exposed in screenshots or logs, rotate Google OAuth credentials, `AUTH_SECRET`, and `WEBHOOK_SYNC_SECRET`, then update both Convex and Vercel where applicable.

Stripe:

- Create subscription prices for the published tracks.
- Put the price IDs in `STRIPE_PRICE_VIDEO_AUDIO_AI` and `STRIPE_PRICE_VIBE_CODING`.
- Forward webhooks to `/api/stripe/webhook`.
- Required events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

Mux:

- Create an access token and set `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET`.
- Configure a signing key when using signed playback tokens.
- Forward Mux webhooks to `/api/mux/webhook`.
- Required events: `video.asset.ready`, `video.asset.errored`, `video.upload.asset_created`.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
npx convex run --inline-query 'return { cloud: process.env.CONVEX_CLOUD_URL ?? null, site: process.env.CONVEX_SITE_URL ?? null, googleIdLength: process.env.AUTH_GOOGLE_ID?.length ?? null };'
npx convex run --prod --inline-query 'return { cloud: process.env.CONVEX_CLOUD_URL ?? null, site: process.env.CONVEX_SITE_URL ?? null, googleIdLength: process.env.AUTH_GOOGLE_ID?.length ?? null };'
npx convex codegen
npm run convex:seed
```

`npx convex codegen` requires a configured `CONVEX_DEPLOYMENT`; it will fail in a fresh checkout until `npx convex dev` has linked the project.
