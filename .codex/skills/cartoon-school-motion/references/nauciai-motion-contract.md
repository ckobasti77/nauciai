# Nauci AI motion contract

## Visual language

- Ink: `#0e3158`
- Paper: `#fffdf8`
- Yellow: `#f4be30`
- Muted: `#536273`
- Line: `#c9d4df`
- Cards and framed blocks: 16 px radius; inset media: 8 px; pills and compact actions: fully rounded.
- Motion metaphor: paper cards landing on a school desk, hand-drawn lines being sketched, circular progress pieces spinning into place.

## Variants

| Variant | Routes | Page | Item | Stagger | Character |
| --- | --- | ---: | ---: | ---: | --- |
| `showcase` | Marketing, Dashboard, Community | 480 ms | 580 ms | 70 ms | Elastic settle, small alternating card rotation, rotating circles |
| `standard` | Auth, profile, billing, public details | 360 ms | 420 ms | 50 ms | Clear paper reveal with restrained movement |
| `focus` | Lesson player and editors | 240 ms | 280 ms | 25 ms | Short opacity and vertical settle only |

Keep the complete above-the-fold sequence around 950-1100 ms. Do not delay interaction until the timeline finishes.

## Semantic markers

- `data-motion="page"`: route content root; never include the persistent app sidebar.
- `data-motion="hero"`: primary paper or ink stage.
- `data-motion="copy"`: headline and supporting copy group.
- `data-motion="scribble"`: SVG whose paths draw on entry.
- `data-motion="circle"`: progress ring, badge, or circular visual that may rotate in `showcase`.
- `data-motion="chart"`: bar or plot mark that grows from its baseline.
- `data-motion="card"`: framed content card; alternate entry direction in `showcase`.
- `data-motion="interactive"`: primary action that receives a short pop after copy.
- `data-motion-progress`: SVG progress stroke. Provide `data-motion-progress-length` and `data-motion-progress-offset`.

## Replay policy

- Replay on first load, every pathname navigation, browser Back/Forward, and every return to a route.
- On `/{locale}/app`, treat `course=<slug>` and the home view as distinct scenes so Dashboard home and course detail replay when revisited.
- Do not replay for Community `q`, `sort`, `scope`, `track`, or `course` filters, local tabs, pagination, data refresh, toast state, or component rerenders.
- Kill the previous GSAP context before starting the next scene so rapid navigation never leaves hidden or transformed elements.

## Accessibility and cleanup

- With reduced motion, use at most a 120 ms opacity transition and no rotation, scale, parallax, or scroll reveal.
- Do not alter focus, tab order, pointer behavior, accessible names, or reading order.
- Animate transform and opacity rather than width, height, margin, padding, or position.
- Clear temporary inline properties and `will-change` on completion; revert matchMedia and GSAP contexts on cleanup.
