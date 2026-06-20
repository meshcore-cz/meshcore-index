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
| `notes`  | no       | Short caveat shown in the matrix tooltip / detail page. |

## Adding a device

Create `data/devices/<id>/device.yaml`.

| Field             | Required | Type     | Notes |
|-------------------|----------|----------|-------|
| `name`            | yes      | string   | Human-readable board name. |
| `mcu`             | yes      | string   | Chip family, e.g. `ESP32`, `nRF52`. |
| `vendorId`        | no       | string   | References a `data/vendors/<id>/` directory. Optional — a device need not have a vendor. |
| `radio`           | no       | string   | e.g. `SX1262`, `SX1276`, `LR1110`. |
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
| `website`     | no       | url    | Official site. |
| `logo`        | no       | string | SVG filename in the same directory (e.g. `logo.svg`). |
| `description` | no       | string | One short paragraph. |

## Build & validate

- `npm run build:data` — compile all YAML into `data.json` (also `/data.json`).
- `npm test` / `npm run validate` — validate every file against the JSON
  Schemas and check that `vendorId` / device references resolve.

Both run automatically: `build:data` via the dev/build pre-hooks, and editing
any YAML while `npm run dev` is running live-rebuilds `data.json`.
