# Data schema

The site is generated entirely from human-readable YAML in this `data/` folder.
No database server — just files you can edit and review in a PR.

There are three independent collections:

```
data/firmwares/<id>/firmware.yaml
data/devices/<id>/device.yaml   (+ optional <image>.svg)
data/vendors/<id>/vendor.yaml   (+ logo.svg)
```

**The `<id>` is the directory name** — it is *not* written inside the YAML.
Renaming the directory renames the record. Ids must be kebab-case (`[a-z0-9-]`).

The canonical machine-readable contracts live in [`/schema`](../schema):
`device.schema.json`, `firmware.schema.json`, `vendor.schema.json`
(JSON Schema 2020-12). `npm test` validates every file against them.

## Adding a firmware

Create `data/firmwares/<id>/firmware.yaml`.

| Field            | Required | Type     | Notes |
|------------------|----------|----------|-------|
| `name`           | yes      | string   | Human-readable name. |
| `type`           | yes      | enum     | `official` \| `fork` \| `custom`. |
| `maintainer`     | yes      | string   | Person or team. |
| `description`    | yes      | string   | One short paragraph. |
| `status`         | yes      | enum     | `active` \| `maintenance` \| `inactive` \| `experimental`. |
| `repository`     | no       | url      | Source repo. |
| `website`        | no       | url      | Project/docs site. |
| `license`        | no       | string   | SPDX id, e.g. `MIT`. |
| `latest_version` | no       | string   | Version label. |
| `released`       | no       | date     | `YYYY-MM-DD` of `latest_version`. |
| `roles`          | no       | string[] | Node roles, e.g. `companion`, `repeater`, `room-server`, `sensor`. |
| `features`       | no       | string[] | Short feature labels. |
| `devices`        | no       | object[] | Compatibility entries (below). |

### `devices[]` entries

| Field    | Required | Notes |
|----------|----------|-------|
| `id`     | yes      | Must reference a device directory under `data/devices/`. |
| `status` | yes      | `supported` \| `partial` \| `untested` \| `unsupported`. |
| `target` | no       | Firmware-specific build target, e.g. an upstream MeshCore `variants/<target>/` directory. |
| `platformio_board` | no | PlatformIO `board = ...` value used by that target, when known. |
| `notes`  | no       | Short caveat shown in the matrix tooltip / detail page. |

### `changelog` (release source)

Optional. Controls where a firmware's release history comes from. The releases
themselves are cached in a sibling `changelog.yaml` (see below).

| Field    | Notes |
|----------|-------|
| `source` | `github` (default when `repository` is a GitHub URL), `manual`, or `script`. |
| `repo`   | `owner/name` override; otherwise parsed from `repository`. |
| `script` | For `source: script`, the enrichment script filename in the firmware dir (default `fetch-changelog.js`). |

**`source: script`** lets a firmware ship a custom fetcher next to its data, for
when releases live somewhere other than plain GitHub release bodies. The updater
fetches the GitHub releases (for tags/dates/links), then calls the script's
default export — `async ({ githubReleases, mapRelease, fetch }) => releases` —
to produce the final list. Example: `data/firmwares/meshcore-official/fetch-changelog.js`
pulls the real notes from the MeshCore blog's Atom feed.

## Changelogs (`changelog.yaml`)

Each firmware may have `data/firmwares/<id>/changelog.yaml` holding its releases.
For `github` sources this file is **generated** — `npm run changelogs`
(`scripts/update-changelogs.js`) fetches the GitHub releases, and a daily
GitHub Action keeps it fresh. For `manual` sources, write it by hand; the
updater leaves it untouched.

```yaml
source: github            # github | manual
repo: owner/name          # github only
updatedAt: 2026-06-20T…Z  # set by the updater
releases:
  - version: v1.16.0      # required
    name: Companion v1.16.0
    date: 2026-06-06       # YYYY-MM-DD
    url: https://github.com/owner/name/releases/tag/v1.16.0
    prerelease: false
    notes: |
      Release notes…
```

## Adding a device

Create `data/devices/<id>/device.yaml`.

| Field             | Required | Type     | Notes |
|-------------------|----------|----------|-------|
| `name`            | yes      | string   | Human-readable board name. |
| `mcu`             | yes      | string   | Chip family, e.g. `ESP32`, `nRF52`. |
| `vendorId`        | no       | string   | References a `data/vendors/<id>/` directory. Optional — a device need not have a vendor. |
| `radio`           | no       | string   | e.g. `SX1262`, `SX1276`, `LR1110`. |
| `product_url`     | no       | url      | Product, docs, or datasheet page for the board/module. |
| `chip_type`       | no       | string   | Flasher chip family (`esp32`/`nrf52`/…). |
| `official`        | no       | bool     | `true` if listed in the official MeshCore flasher. |
| `image`           | no       | string   | SVG filename placed in the same directory; shown as the thumbnail. |
| `flasher_roles`   | no       | string[] | Roles the official flasher offers for this board. |
| `frequency_bands` | no       | number[] | MHz, e.g. `[868, 915]`. |
| `form_factor`     | no       | string   | e.g. `Handheld`, `Dev board`. |
| `display`         | no       | string   | Screen description, or `None`. |
| `battery`         | no       | string   | Power/battery notes. |
| `gps`             | no       | bool     | Onboard GNSS. |
| `connectivity`    | no       | string[] | e.g. `[USB-C, BLE, Wi-Fi]`. |
| `description`     | no       | string   | One short paragraph. |

Most boards were generated from the official flasher
[`config.json`](https://github.com/meshcore-dev/flasher.meshcore.io/blob/main/config.json);
their thumbnails come from that repo's `img/` folder.

## Adding a vendor

Create `data/vendors/<id>/vendor.yaml` plus a `logo.svg`.

| Field         | Required | Type   | Notes |
|---------------|----------|--------|-------|
| `name`        | yes      | string | Manufacturer name. |
| `website`     | no       | url    | Official site, starting with `http://` or `https://`. |
| `country`     | no       | string | Company or project country, when known. Use `Various` for generic board families. |
| `logo`        | no       | string | Logo filename in the same directory. Prefer SVG, but PNG/JPG/WebP are allowed. |
| `description` | no       | string | One short paragraph. |

## Build & validate

- `npm run build:data` — compile all YAML into `data.json` (also `/data.json`).
- `npm test` / `npm run validate` — validate every file against the JSON
  Schemas and check that `vendorId` / device references resolve.

Both run automatically: `build:data` via the dev/build pre-hooks, and editing
any YAML while `npm run dev` is running live-rebuilds `data.json`.
