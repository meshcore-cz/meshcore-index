# Agent guide — MeshCore Firmware Atlas

Operational notes for AI agents working in this repo.

> **Editing data?** Read [`data/RULES.md`](data/RULES.md) first — it's the
> authoring guide (naming, datasheets, prices, built-in vs optional hardware,
> catalog, pitfalls, checklist) for humans and agents alike.
> Field reference: [`data/SCHEMA.md`](data/SCHEMA.md). Machine contracts:
> [`schema/`](schema/).

## What this repo is

A static SvelteKit site cataloging MeshCore (and related) firmware support for
LoRa hardware. All content lives in YAML under `data/`; the app imports compiled
`src/lib/generated/data.json` (built from that YAML).

## Working in this repo

```bash
npm test              # validate all YAML against JSON Schema + referential checks
npm run build:data    # regenerate data.json and static/schema/*.json
```

- Run **`npm test`** after every data change; run **`build:data`** when `schema/`
  or `data/globals.yaml` change (dev/build hooks usually do this automatically).
- Do **not** create git commits or PRs unless the user explicitly asks.
- Keep diffs focused; don't refactor unrelated UI or bulk-edit all devices unless asked.

## UI / code conventions (when touching `src/`)

- Hero strip **strips the vendor prefix** from catalog MCU/radio names
  (`ESP32-S3`, not `Espressif ESP32-S3`).
- Component datasheet links come from `data/globals.yaml`; device PDFs use `datasheetUrl`.
- Reuse existing helpers in `src/lib/data.js` (`resolveMcuInfo`,
  `deviceDisplayLabel`, `devicePriceLabel`, etc.).

## Before finishing

- `npm test` passes.
- For data changes, follow the contributor checklist in
  [`data/RULES.md`](data/RULES.md).
