# Design-system proposal (report only — nothing here is implemented)

Measured on branch `fix/radius-cascade-layer`, 108 `.tsx` files, 3150 `className` strings
of which 1802 are distinct.

## Why now

The radius bug just fixed was not really a CSS bug. It was a *systems* bug: because no
`Button` primitive existed, 329 `<button>` tags each spelled out their own shape, and when
a global rule silently overrode all of them the damage was invisible for months and got
papered over with 27 `!` escapes and 4 inline style hacks. A primitive would have made the
override a one-line fix in one file. Every item below is chosen on that basis — how many
hand-rolled sites it absorbs, and what class of silent breakage it prevents.

## Current state of `components/ui/`

Four files. `primitives.tsx` (144 lines) exports `cn`, `LinkButton`, `Panel`,
`SectionHeader`, `HandUnderline`, `BrandMark`, `SketchIcon`. The rest are
`scroll-to-top.tsx`, `smart-sticky.tsx`, `toast-provider.tsx`.

So the repo has exactly **one** layout primitive (`Panel`) and **one** link-shaped button
(`LinkButton`), against the duplication counted below.

## Proposed primitives, ordered by what they absorb

| primitive | absorbs | measured evidence |
| --- | --- | --- |
| `Button` | ~277 sites | 329 `<button>` tags, **277 distinct className expressions** |
| `Card` (extend `Panel`) | ~143 sites | 38 `<Panel>` uses vs **143 inline card recipes** (`border-2` + `bg-white\|paper` + padding) |
| `EmptyState` | ~97 sites | empty-state copy in **31 files, 97 occurrences** |
| `Input` / `Field` | ~57 sites | **57** `outline-none` strings, nearly all on form controls |
| `Dialog` | 20 sites | **20** inline `fixed inset-0` overlays, **1** with focus management |
| `Spinner` | 21 sites | **21 distinct** `<Loader2>` className recipes |
| `Badge` | ~40 sites | pill/chip recipes across community, chat, admin |

### `Dialog` — the highest-severity item

There are 20 inline modal overlays and exactly **one** correct focus trap in the entire
repo: `useModalFocus` at `components/app/member-profile.tsx:35-89`. It is genuinely
complete — Escape to close, Tab cycling in both directions, `body` overflow lock, and focus
restored to the previously-focused element on unmount. It is used twice, in the file that
defines it.

The other 19 overlays have no focus management at all. For a keyboard or screen-reader
user, opening one of those dialogs drops focus behind the overlay with no way back.

**Do not rewrite it.** Lift `useModalFocus` verbatim into `components/ui/dialog.tsx` and
build `Dialog` around it. Then `ConfirmDialog` on top of `Dialog` — several of the 20 are
confirm-delete flows, and a few currently use `window.confirm` (e.g.
`dashboard-content.tsx:344`).

### Sequencing

1. `Button` + `Spinner` — largest absorption, lowest risk, and `Spinner` is a `Button` prop anyway.
2. `Dialog` + `ConfirmDialog` — highest severity; fixes 19 accessibility defects at once.
3. `Input` / `Field` — pair with the focus-visible fix below so it lands once, correctly.
4. `Card` — extend `Panel` rather than adding a rival component.
5. `EmptyState`, `Badge` — mechanical mop-up.

Ship each as: add primitive → migrate 3–5 call sites → review → migrate the rest. Do not
migrate 277 sites in one commit.

---

## Flagged: focus visibility

**57 `outline-none` class strings; 56 have no `focus-visible:` replacement.**

This is not a style nit — it removes the focus ring and puts nothing back, so keyboard
users lose the caret entirely on those controls. Concentrated in `sign-in-panel.tsx` and
`profile-editor.tsx`.

`components/app/sign-in-panel.tsx` has six such fields — lines **298, 319, 350, 384, 407,
426**. The sign-in email field at line 298:

```
mt-2 h-12 w-full rounded-[8px] border-2 border-ink bg-white px-4 text-base
font-bold text-ink outline-none focus:border-yellow
```

Two defects in one string:

1. The only focus affordance is `focus:border-yellow` — a border colour shift from
   `#0e3158` to `#f4be30`. Against the white field that is roughly **1.7:1**, well under
   the **3:1** WCAG 2.1 non-text contrast minimum. The border is already 2px, so nothing
   changes shape or thickness; only hue moves.
2. It uses `focus:` rather than `focus-visible:`, so the state also fires on mouse click.

Fix once inside `Input` rather than 57 times: keep `outline-none` only alongside an
explicit `focus-visible:ring-2 focus-visible:ring-offset-2` (or an equivalent that clears
3:1), so it cannot regress per-call-site.

## Flagged: colour tokens

**154 hardcoded hex occurrences across 49 distinct values in `.tsx`, against 6 `var(--…)` uses.**

| hex | occurrences | token that already exists |
| --- | --- | --- |
| `#2e6f9f` | **23** | *none — undeclared* |
| `#0e3158` | 21 | `--color-ink` |
| `#f4be30` | 19 | `--color-yellow` |
| `#eef3f7` | 15 | *none* |
| `#d7e9f5` | 15 | *none* |

Two separate problems:

- **Retyped tokens.** `#f4be30` and `#0e3158` are retyped 40 times between them while
  `--color-yellow` and `--color-ink` exist in `@theme inline`. A brand tweak means 40 edits
  and 40 chances to miss one.
- **An undeclared fourth brand blue.** `#2e6f9f` appears **23 times** and is the single
  most-used hex in the tree, yet it is in no token, no `@theme` entry, and no doc. It is a
  brand colour by usage and an accident by definition. Either promote it to
  `--color-blue-mid` or fold it into an existing blue — but decide, because right now 23
  sites depend on a value nobody has named.

Note the counts differ from the original brief (which said 333 hexes, `#f4be30` ×24,
`#2e6f9f` ×22, and 0 `var(--…)` uses). Mine count 6-digit hexes in `.tsx` only; the brief
likely also counted `.ts`, 3-digit hexes, and `rgba()` inside shadow recipes. The
conclusion is unchanged.

## Also worth a token

**94 distinct `shadow-[…]` recipes.** Nearly all are variations on the same offset ink
shadow (`Npx Npx 0 rgba(14,49,88,α)`). Three or four named shadow tokens would replace
almost all of them, and would stop `rgba(14,49,88,…)` being a fourth way to retype
`--color-ink`.
