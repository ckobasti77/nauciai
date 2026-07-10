<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI shape convention

For live coding in this site, keep UI radius values consistent:

- Standard cards, panels, framed content blocks, and image containers use `16px` border radius.
- Media inside a card uses half the card radius: `8px`.
- When a card contains an inset image, use `12px` padding between the card border and the image on prominent cards, while keeping compact surfaces at least `8px`.
- Pills, price badges, avatar/favorite icon buttons, and compact status chips should be fully rounded.
- Do not introduce sharp-corner cards unless a specific design request overrides this convention.

## Full-screen single-target drop convention

When a page, modal, or editor has exactly one meaningful drop target for the
file type being handled, make the whole active screen or modal surface accept
that drop while the UI is open. Follow the profile avatar pattern: use
window-level drag guards, show a clear full-screen overlay, prevent default file
drops that would navigate the browser, and only run the upload/action after a
type-specific guard confirms the dropped file is valid for that surface.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
