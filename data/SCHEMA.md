# Data schema

The site is generated entirely from human-readable YAML in this `data/` folder.
No database server — just files you can edit and review in a PR.

There are four independent collections:

```
data/firmwares/<id>/firmware.yaml
data/devices/<id>/device.yaml   (+ optional <image>.svg)
data/vendors/<id>/vendor.yaml   (+ logo.svg)
data/compatibility/<firmware-id>/<firmware-version>/<device-id>.yaml
```

**The `<id>` is the directory name** — it is *not* written inside the YAML.
Renaming the directory renames the record. Ids must be kebab-case (`[a-z0-9-]`).

The canonical machine-readable contracts live in [`/schema`](../schema):
`device.yaml`, `firmware.yaml`, `vendor.yaml`, `compatibility.yaml`, and `changelog.yaml`
(JSON Schema 2020-12 expressed as YAML). `npm test` validates every file
against them.

The build step also publishes JSON copies at `/schema/device.json`,
`/schema/firmware.json`, `/schema/vendor.json`, `/schema/compatibility.json`,
and `/schema/changelog.json`.

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
| `lifecycle`      | no       | enum     | `active` \| `maintenance` \| `archived`. |
| `maturity`       | no       | enum     | `experimental` \| `alpha` \| `beta` \| `stable`. |
| `distribution`   | no       | enum     | `official` \| `vendor` \| `community` \| `personal`. |
| `lineage`        | no       | object   | Upstream/fork/reimplementation metadata. |
| `runtime`        | no       | object   | Framework/language metadata. |
| `capabilities`   | no       | object   | Stable feature flags for filtering/comparison. |
| `devices`        | yes      | array    | Device support list used by the firmware pages and compatibility matrix. |

Firmware `devices` is the source of truth for whether a board is supported by a
firmware. Each entry references a `data/devices/<id>/` record and can include
`status`, `target`, `platformio_board`, and `notes`.

```yaml
devices:
  - id: heltec-v3
    status: supported          # supported | partial | untested | unsupported
    target: heltec_v3
    platformio_board: esp32-s3-devkitc-1
```

## Adding Compatibility Reports

Create `data/compatibility/<firmware-id>/<firmware-version>/<device-id>.yaml`.
These files are optional reports/evidence for a specific firmware version on a
specific device. They do not create support by themselves: the same device must
already be listed in `data/firmwares/<firmware-id>/firmware.yaml`.

The firmware id, version label, and device id are inferred from the path. Use a
filesystem-safe version folder such as `v1.16.0` or `PowerSaving-16`.

```yaml
status: supported          # supported | partial | untested | unsupported
support:
  availability: available  # available | unavailable | unknown
  level: official          # official | vendor | community | experimental
  verification: imported-unverified

roles:
  companion:
    status: untested
    transports:
      ble: untested
      usb: untested
  repeater:
    status: untested

builds:
  - target: heltec_v3
    platformio_board: esp32-s3-devkitc-1
    artifactSource: unknown

verification:
  firmwareVersion: v1.16.0
  confidence: imported-unverified
```

Canonical roles are `companion`, `repeater`, `room-server`, `observer`,
`sensor`, `kiss-modem`, and `standalone-ui`. Canonical transports are `ble`,
`usb`, `tcp`, `wifi`, `ethernet`, and `serial`.

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
| `vendorId`        | no       | string   | References a `data/vendors/<id>/` directory. Optional — a device need not have a vendor. |
| `kind`            | no       | enum     | `product`, `dev-board`, `module`, `kit`, or `generic-build`. |
| `lifecycle`       | no       | enum     | `announced`, `active`, `discontinued`, or `unknown`. |
| `familyId`        | no       | string   | Shared family/group id for related boards. |
| `revision`        | no       | string   | Hardware revision label. |
| `variantOf`       | no       | string   | Device id this record varies from. |
| `aliases`         | no       | string[] | Alternate product names. |
| `replaces`        | no       | string   | Older device id this record replaces. |
| `product_url`     | no       | url      | Product, docs, or datasheet page for the board/module. |
| `official`        | no       | bool     | `true` if listed in the official MeshCore flasher. |
| `image`           | no       | string   | SVG filename placed in the same directory; shown as the thumbnail. |
| `roles`           | no       | enum[]   | Canonical roles: `companion`, `repeater`, `room-server`, `observer`, `sensor`, `kiss-modem`, `standalone-ui`. |
| `transports`      | no       | enum[]   | Canonical transports: `ble`, `usb`, `tcp`, `wifi`, `ethernet`, `serial`. |
| `hardware`        | yes      | object   | Structured hardware details; `hardware.mcu` is required, absent optional values mean unknown. |
| `interfaces`      | no       | object   | Structured USB/BLE/Wi-Fi interface details. |
| `description`     | no       | string   | One short paragraph. |

Most boards were generated from the official flasher
[`config.json`](https://github.com/meshcore-dev/flasher.meshcore.io/blob/main/config.json);
their thumbnails come from that repo's `img/` folder.

Use structured fields instead of deprecated flat aliases such as `mcu`, `radio`,
`gps`, `display`, `battery`, `connectivity`, or upstream `flasher_roles`.

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
