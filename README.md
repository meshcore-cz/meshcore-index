# MeshCore Ninja

An open catalog of the [MeshCore](https://meshcore.io) ecosystem — the regional and national **networks** people run, the LoRa **devices** that join them, the **firmwares** that power them, and the **vendors** who make the hardware. Each entry carries detailed specs, with a compatibility matrix and comparison tools across all collections.

> ⚠️ **Work in progress.** This site is brand new and data is still being ingested, so entries may be incomplete or incorrect. We'd appreciate any corrections — please open an [issue](https://github.com/meshcore-cz/meshcore-index/issues) or [pull request](https://github.com/meshcore-cz/meshcore-index/pulls).

It's a static [SvelteKit](https://kit.svelte.dev) site built from human-readable YAML files under [`data/`](data/). The YAML is validated against JSON Schema and compiled into a single `data.json` that the app consumes.

## Quick start

```bash
npm install
npm run dev        # start the dev server (builds data first)
npm run build      # production build
npm run preview    # preview the production build
```

The Go metrics API lives in [`api/`](api/):

```bash
make run-api       # run the API against ./data
make test          # validate data and run API tests
```

## Working with the data

All content lives as YAML under [`data/`](data/):

- `networks/` — organized regional/national MeshCore meshes and how to join them
- `devices/` — supported LoRa hardware
- `firmwares/` — official and community MeshCore firmwares
- `vendors/` — hardware/firmware vendors
- `compatibility/` — which firmwares run on which devices
- `globals.yaml` — shared definitions (node roles, MCU/radio catalogs, etc.)

```bash
npm test           # validate all YAML against JSON Schema + referential checks
npm run build:data # regenerate data.json and static/schema/*.json
```

Run `npm test` after every data change. Before authoring or editing data, read [`data/RULES.md`](data/RULES.md) (the authoring guide) and [`data/SCHEMA.md`](data/SCHEMA.md) (the field reference). Machine-readable contracts live in [`schema/`](schema/).

## Releases

Releases are cut from `main` with a clean, up-to-date working tree:

```bash
make release VERSION=v0.2.0
```

The release helper bumps `package.json` / `package-lock.json`, runs checks,
commits the version bump, creates an annotated tag, and pushes the branch + tag.
Tag pushes create a GitHub release and publish the API Docker image to
`ghcr.io/meshcore-cz/meshcore-ninja-api`.

## Contributing

Edits are made by changing the YAML files in `data/`. See [`AGENTS.md`](AGENTS.md) for repo conventions and [`data/RULES.md`](data/RULES.md) for the authoring guide. Spotted something wrong or missing? [Open an issue or PR](https://github.com/meshcore-cz/meshcore-index) — corrections of any size are welcome.
