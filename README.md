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
npm run convex:seed
npm run dev
```

`npx convex dev` creates or links the Convex deployment and fills `CONVEX_DEPLOYMENT` / `NEXT_PUBLIC_CONVEX_URL`. The app intentionally renders a setup state when Convex is not configured, so local UI work can continue before live services are connected.
`npm run convex:auth` generates the Convex Auth RS256 key material and sets `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` in the active Convex deployment.
`npm run convex:seed` creates the initial Smer za video i audio and Smer za web sajtove records in Convex. It also passes Stripe price IDs from `.env.local` when they exist.

## Required services

Convex:

```bash
npx convex dev
npm run convex:auth
npx convex env set AUTH_SECRET "<random-secret>"
npx convex env set WEBHOOK_SYNC_SECRET "<same-value-as-env-local>"
npx convex env set INITIAL_ADMIN_EMAILS "admin@example.com"
npx convex env set AUTH_GOOGLE_ID "<google-client-id>"
npx convex env set AUTH_GOOGLE_SECRET "<google-client-secret>"
npx convex env set AUTH_APPLE_ID "<apple-client-id>"
npx convex env set AUTH_APPLE_SECRET "<apple-client-secret-jwt>"
```

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
npx convex codegen
npm run convex:seed
```

`npx convex codegen` requires a configured `CONVEX_DEPLOYMENT`; it will fail in a fresh checkout until `npx convex dev` has linked the project.
