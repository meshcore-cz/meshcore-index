# Frontend conventions

This is a [SvelteKit](https://kit.svelte.dev/) app (Svelte 5, static adapter) styled with
[Tailwind CSS v4](https://tailwindcss.com/). It renders the MeshCore Atlas from a pre-built data
bundle. Keep these conventions in mind when adding UI.

## Stack

- **Svelte 5 runes** — use `$state`, `$derived`, `$props`, `$effect`, `$bindable`. No legacy
  `export let` / reactive `$:` in new code.
- **Tailwind v4 (CSS-first)** — theme tokens live in [`app.css`](app.css) as CSS variables and
  generate utilities. Style with tokens, never hard-coded hex:
  - surfaces: `bg-bg`, `bg-elev`, `bg-elev2`, `border-edge`
  - text: `text-ink` (primary), `text-dim`/`text-muted` (secondary)
  - accents: `text-accent`/`bg-accent` (green), `text-accent2`/`bg-accent2` (blue),
    `ok` / `warn` / `bad` for status
  - Light/dark is handled by flipping the same variables via `data-theme` — so tokens "just work"
    in both themes. Don't special-case colours per theme.
- **Icons** — [`@lucide/svelte`](https://lucide.dev/) (`import { ChevronDown } from '@lucide/svelte'`).
  Inline `<svg>` is fine for one-off custom marks.

## Components — prefer bits-ui

We use **[bits-ui](https://bits-ui.com/)** (headless primitives) for anything interactive — it gives
us accessibility, keyboard handling, and focus management for free. **Reach for a bits-ui primitive
before hand-rolling a button, menu, dialog, toggle, tooltip, etc.** Only write a custom variant when
bits-ui has no fitting primitive or it would be clearly heavier than the need.

To keep usage consistent and themed, bits-ui primitives are wrapped in small reusable components in
[`lib/`](lib). Use these wrappers rather than importing bits-ui directly when one fits:

| Wrapper | Wraps | Use for |
| --- | --- | --- |
| [`Button.svelte`](lib/Button.svelte) | `Button` | Any button/action. `variant` + `size` props; pass `href` to render an `<a>`. Use `variant="" size="none"` to fully style it yourself. |
| [`Select.svelte`](lib/Select.svelte) | `Select` | Dropdown selects (e.g. sort). |
| [`Chip.svelte`](lib/Chip.svelte) | `Toggle` | Pill-shaped filter chips. `pressed` + `onPressedChange`, `tone="accent\|accent2"`. |
| [`Tooltip.svelte`](lib/Tooltip.svelte) | `Tooltip` | Hover/focus tooltips. Pass the trigger via the `trigger` snippet (see gotcha below). |
| [`Avatar.svelte`](lib/Avatar.svelte) | `Avatar` | Logos/images with a fallback (vendors, devices). |
| [`Pagination.svelte`](lib/Pagination.svelte) | `Pagination` | Paged lists. |
| [`CommandPalette.svelte`](lib/CommandPalette.svelte) | `Command` + `Dialog` | Global ⌘K search. |

For primitives without a wrapper yet (e.g. `Collapsible`, `ToggleGroup`), import from bits-ui
directly and style with the design tokens — and consider adding a wrapper if it gets reused.

A single `<Tooltip.Provider>` lives in [`routes/+layout.svelte`](routes/+layout.svelte), so individual
tooltips only render Root/Trigger/Content.

### Two bits-ui gotchas

1. **Dialog with externally-controlled open state:** use `<Dialog.Root {open} onOpenChange={(v) => (open = v)}>`,
   **not** `bind:open`, when a store/prop also drives `open`. Two-way `bind:open` conflicts and the
   dialog won't close.
2. **Tooltip/Trigger around a real button = nested `<button>`** (SSR `node_invalid_placement_ssr`).
   Pass your element through the `child`/`trigger` snippet so props merge onto it instead of wrapping.
   `Tooltip.svelte` already does this — give it your trigger via its `trigger` snippet.

## Data

Pages get data from `+page.js`/`+page.server.js` loaders backed by the generated bundle in
[`lib/generated/`](lib/generated) (built by `scripts/build-data.js`; do not edit by hand). Read it
through the helpers in [`lib/data.js`](lib/data.js) rather than touching the JSON directly. Filter
state is typically mirrored to the URL so filtered views are linkable.

## Conventions

- Match the surrounding file's idiom, comment density, and naming.
- Keep components presentational; put shared logic/derivations in `lib/*.js`.
- Comment the *why*, not the *what* — especially non-obvious data shaping or interaction quirks.
- Verify UI changes in the browser preview before considering them done.
