---
name: cartoon-school-motion
description: Build, extend, or review playful cartoon-school GSAP motion systems for Nauci AI. Use for page-entry animation, route replay, hand-drawn or paper-card reveals, rotating progress circles, chart entrances, community transitions, dashboard motion, reduced-motion fallbacks, or requests to keep the final layout unchanged while making navigation feel fluid and animated.
---

# Cartoon School Motion

Build one orchestrated motion language for the whole product instead of scattering unrelated effects across components.

## Workflow

1. Read the repository `AGENTS.md` and the relevant guide in `node_modules/next/dist/docs/` before changing Next.js routing, templates, layouts, or client boundaries.
2. Inspect the rendered page, existing GSAP or Motion usage, shared primitives, and dirty worktree. Preserve user changes and the final visual layout.
3. Read [references/nauciai-motion-contract.md](references/nauciai-motion-contract.md) for this project's palette, variants, semantic markers, timing, and replay policy.
4. Reuse the central `PageMotion` boundary and motion contract. Extend semantic markers before adding component-specific timelines.
5. Remove or consolidate older page-entry effects that would animate the same properties at the same time. Keep local interaction motion only when it has a distinct job.
6. Verify every first visit and return visit, including Link navigation and browser Back/Forward.

## Implementation rules

- Animate only `transform`, `opacity`, temporary `clip-path`, or SVG stroke for page entry. Never animate layout dimensions for the route transition.
- Keep server-rendered DOM visible by default. Apply initial hidden states in a client layout effect so no-JavaScript and failed-hydration states remain usable.
- Scope timelines with `gsap.context()` and media behavior with `gsap.matchMedia()`. Revert both on route change or unmount.
- Clear temporary transform, opacity, visibility, clip-path, transform-origin, and will-change styles after completion.
- Treat pathname changes as page visits. On `/app`, include the semantic `course` scene. Ignore search, sort, scope, and filter query changes on Community pages.
- Keep persistent sidebar and header surfaces stable while animating the new page content.
- Use `showcase` for marketing, dashboard, and Community; `standard` for auth, profile, billing, and public detail pages; use `focus` for lesson players and editors.
- Under `prefers-reduced-motion`, remove rotation, scale, parallax, and large movement. Allow only an optional opacity handoff no longer than 120 ms.
- Do not add sound, proprietary GSAP plugins, SplitText dependencies, or navigation-blocking exit delays.
- Keep cards at the repository's 16 px radius and inset media at 8 px unless the request explicitly changes the design system.

## Verification

- Run targeted ESLint while iterating, then `npm run lint`, `npm test`, and `npm run build`.
- Test rapid navigation for duplicated timelines, hidden elements, stale inline transforms, and leaked ScrollTriggers.
- Verify signed-in Dashboard and Community transitions in a real authenticated browser session.
- Test desktop, mobile, keyboard focus, and reduced motion. Confirm every element settles into its original computed layout within about one second.
