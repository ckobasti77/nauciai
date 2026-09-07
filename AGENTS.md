<!-- BEGIN:nextjs-agent-rules -->
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI shape convention

Four sanctioned radius values. Nothing else should be introduced:

| tier | value | utility |
| --- | --- | --- |
| card | `16px` | `surface-card` |
| inset | `12px` | `surface-inset` |
| media | `8px` | `surface-media` |
| pill | fully round | `rounded-full` |

- Standard cards, panels, framed content blocks, and image containers use the **card** tier.
- Media inside a card uses half the card radius: the **media** tier.
- Nested panels and controls sitting inside a card use the **inset** tier.
- When a card contains an inset image, use `12px` padding between the card border and the image on prominent cards, while keeping compact surfaces at least `8px`.
- Pills, price badges, avatar/favorite icon buttons, and compact status chips use `rounded-full`. There is deliberately no `pill` utility — `rounded-full` already says it.
- Do not introduce sharp-corner cards unless a specific design request overrides this convention.

### How the defaults work

`app/globals.css` supplies a radius **only when the element does not author one**:
a bordered element with no `rounded-*` class gets `16px`, and a `<button>` (or a
button-shaped `<a>`/`<label>`) with no `rounded-*` class gets a pill. Those rules live
in `@layer base` and therefore lose to every Tailwind utility, so **an authored
`rounded-*` class always wins**.

This is load-bearing. Those rules previously sat outside any cascade layer, which beats
every layer regardless of specificity, so every authored `rounded-*` on a button or a
bordered element was silently dead — 45 distinct element recipes were rendering at the
wrong shape, including the course cover, which asked for `8px` and rendered at `16px`.
That is also why the tree accumulated 27 `rounded-*!` escapes and 4 inline
`style={{ borderRadius: 0 }}` hacks; all were removed once the layer was fixed. **Never
move these rules back out of `@layer base`, and never reach for `!` or an inline
`borderRadius` to force a corner** — if a radius is not applying, that is a bug worth
diagnosing, not overriding.

### Known off-scale debt

Roughly 38 call sites still use `6px`, `10px`, `18px`, `28px`, `7px`, `5px`, `4px`, or
`3px`. They are legacy, not sanctioned; migrate them to the nearest tier when you are
already editing the file. Do not add new ones.

## One frame per group

**A full `border-2 border-ink` belongs to the OUTERMOST element of a group and to
nothing inside it.** Children separate themselves by *surface* (the alternating
`bg-surface-a` / `bg-surface-b` pair, or `bg-paper` against `bg-paper-strong`) or by a
thin `--line` rule — `border border-line`, `border-t border-line`, `divide-y divide-line`
— never by a second `border-2`.

- **Media gets exactly one frame, on the wrapper.** A cover, thumbnail, or attachment
  inside an already-framed card carries no border of its own. When a pale image needs an
  edge so it does not bleed into the paper, use the inset hairline
  `shadow-[inset_0_0_0_1px_var(--shadow-hard-14)]`, not a border.
- **Lists are not grids.** A list of comments, discussions, or rows separates its items
  with one `--line` rule between them. Giving every item a full frame turns the list into
  a lattice — that is the exact regression this rule exists to prevent.
- **Style carriers keep their borders.** Buttons and anything button-shaped, pills,
  chips, badges, avatar rings, inputs, selects, textareas, and modals wear the border as
  an affordance, not as decoration. Never strip those.
- **Floating layers start a new group.** A dropdown, popover, or dock sits *above* the
  panel rather than inside it, so it is its own outermost element and may carry a full
  frame.
- Status colours (`border-amber-*`, `border-red-*`) carry meaning, not shape, and are
  outside this rule.

`npm run check:frames` (`scripts/check-frames.mjs`) walks the JSX tree and fails on a
full frame nested inside another one. It is **scoped** to the surfaces already migrated
(community, comments, member profile, classroom, Studio gallery, admin lists) — the rest
of the tree still carries the same debt. Widen the gate by adding a path to `ROOTS` in
that script when you migrate a surface; do not invent a second rule.

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
