# Data schema

> This file is the **field reference** (what fields exist). For *how to fill them
> well* — naming, datasheets, prices, built-in vs optional hardware, the catalog,
> and the contributor checklist — see [`RULES.md`](RULES.md).

The site is generated entirely from human-readable YAML in this `data/` folder.
No database server — just files you can edit and review in a PR.

There are four independent collections:

```
data/firmwares/<id>/firmware.yaml
data/devices/<id>/device.yaml   (+ optional <image>.svg, <datasheet>.pdf)
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
| `name`            | yes      | string   | Short display name — see [`RULES.md`](RULES.md) naming rules. |
| `vendorId`        | no       | string   | References a `data/vendors/<id>/` directory. Optional — a device need not have a vendor. |
| `kind`            | no       | enum     | `product`, `dev-board`, `module`, `kit`, or `generic-build`. |
| `lifecycle`       | no       | enum     | `announced`, `active`, `discontinued`, or `unknown`. |
| `familyId`        | no       | string   | Shared family/group id for related boards. |
| `revision`        | no       | string   | Hardware revision label. |
| `variantOf`       | no       | string   | Device id this record varies from. |
| `aliases`         | no       | string[] | Longer official titles, module codes, alternate names. |
| `replaces`        | no       | string   | Older device id this record replaces. |
| `product_url`     | no       | url      | Vendor product or marketing page. |
| `official`        | no       | bool     | `true` if listed in the official MeshCore flasher. |
| `image`           | no       | string   | SVG filename placed in the same directory; shown as the thumbnail. |
| `datasheet`       | no       | string   | PDF filename in the same directory (e.g. `datasheet.pdf`); immutable copy of the vendor spec sheet. |
| `roles`           | no       | enum[]   | Canonical roles: `companion`, `repeater`, `room-server`, `observer`, `sensor`, `kiss-modem`, `standalone-ui`. |
| `transports`      | no       | enum[]   | Canonical transports: `ble`, `usb`, `tcp`, `wifi`, `ethernet`, `serial`. |
| `hardware`        | yes      | object   | Structured hardware details; `hardware.mcu` is required, absent optional values mean unknown. |
| `interfaces`      | no       | object   | Structured USB/BLE/Wi-Fi interface details. |
| `description`     | no       | string   | One short paragraph. |

Most boards were generated from the official flasher
[`config.json`](https://github.com/meshcore-dev/flasher.meshcore.io/blob/main/config.json);
their thumbnails come from that repo's `img/` folder.

**Datasheets:** place a vendor PDF in the device directory (e.g.
`data/devices/heltec-v3/datasheet.pdf`) and set `datasheet: datasheet.pdf` in
`device.yaml` — same pattern as `image`. Do not put the PDF URL in a comment;
download the file and commit it so specs stay available if the vendor link breaks.
Validation checks that the file exists when the field is set.

Use structured fields instead of deprecated flat aliases such as `mcu`, `radio`,
`gps`, `display`, `battery`, `connectivity`, or upstream `flasher_roles`.

### `hardware` (optional nested fields)

| Field | Type | Notes |
|-------|------|-------|
| `mcu.model` | string | Catalog key, e.g. `esp32-s3`, `nrf52840`. |
| `mcu.flashMb` / `psramMb` | number | On-board memory. |
| `mcu.ramKb` | number | On-chip SRAM in KB. |
| `radios[]` | array | LoRa / ESP-NOW radios. |
| `radios[].chip` | string | Catalog key, e.g. `sx1262`. |
| `radios[].frequencyVariants[]` | string[] | Regional band keys, e.g. `868`, `915`. |
| `radios[].txPowerDbm` | number | Max TX power in dBm. |
| `radios[].antenna` | string | Antenna connector or included antenna, e.g. `IPEX-1.0`. |
| `display` | object | Panel type, controller, size, resolution. |
| `gnss` | object | GNSS chip and presence. |
| `input[]` | array | Built-in human input and audio I/O. |
| `input[].type` | enum | `keyboard`, `trackball`, `joystick`, `encoder`, `button`, `microphone`, `speaker`. |
| `input[].description` | string | Optional detail, e.g. `mini QWERTY`. |
| `power.batteryConnector` | string | External battery connector, e.g. `SH1.25-2`. |
| `power.batteryChemistry` | enum | `li-po`, `li-ion`, `lifepo4`, `lto`, `nimh`, `alkaline`, `other`. |
| `power.consumptionIdleMa` | number | Typical idle/RX current draw in mA. |
| `power.consumptionTxMa` | number | Typical peak TX current draw in mA. |
| `power.pmic` | string | Charge / power-management IC. |
| `expansion[]` | array | Grove, header, or other expansion ports. |
| `expansion[].type` | string | Port family, e.g. `grove`, `header-2.54`. |
| `expansion[].count` | integer | Number of connectors. |
| `expansion[].pins` | integer | Pin count per header, when relevant. |
| `expansion[].interfaces[]` | string[] | Supported buses, e.g. `I2C`, `UART`. |
| `leds.status` | enum | `unknown`, `none`, `present`. |
| `leds.description` | string | What LEDs are present, e.g. `User RGB + charge status`. |
| `enclosure.builtIn` | bool | Factory enclosure included. |
| `enclosure.ipRating` | string | Ingress protection, e.g. `IPX6`. |
| `physical.dimensionsMm` | object | `width`, `height`, `depth` in millimetres. |
| `physical.weightG` | number | Product weight in grams. |
| `environmental.operatingTempC` | object | `min` / `max` operating temperature in °C. |
| `certifications[]` | string[] | Regulatory marks, e.g. `FCC`, `CE`. |

### `interfaces` (optional nested fields)

| Field | Type | Notes |
|-------|------|-------|
| `usb.connector` | string | e.g. `USB-C`, `Micro-USB`. |
| `usb.bridge` | string | USB–serial bridge IC, e.g. `CP2102`. |
| `usb.capabilities[]` | enum[] | `power`, `serial`, `flashing`, `dfu`. |
| `bluetooth.version` / `ble` | | Bluetooth LE details. |
| `wifi.status` | enum | `present`, `none`, or `unknown`. |
| `wifi.standard` | string | e.g. `802.11 b/g/n`. |

## Adding a vendor

Create `data/vendors/<id>/vendor.yaml` plus a `logo.svg`.

| Field         | Required | Type   | Notes |
|---------------|----------|--------|-------|
| `name`        | yes      | string | Manufacturer name. |
| `website`     | no       | url    | Official site, starting with `http://` or `https://`. |
| `country`     | no       | string | Company or project country, when known. Use `Various` for generic board families. |
| `logo`        | no       | string | Logo filename in the same directory. Prefer SVG, but PNG/JPG/WebP are allowed. |
| `description` | no       | string | One short paragraph. |

## External references (`refs`)

Any device, firmware or vendor may carry a `refs` map that cross-links the
record to its entry in an external database. Each **key** must be a ref id
registered under `refs:` in [`globals.yaml`](globals.yaml); each **value** is
this record's id/slug on that site. The site expands it into a link by
substituting the value into the ref's `urlTemplate` (`{id}` placeholder).

```yaml
# device.yaml
refs:
  mesh-sh-device: lilygo-t-echo   # → https://mesh-sn.de/en/devices/details/lilygo-t-echo
```

Register new databases in `globals.yaml`:

```yaml
refs:
  mesh-sh-device:
    name: mesh-sn.de              # label shown on the detail page
    urlTemplate: https://mesh-sn.de/en/devices/details/{id}
```

An unknown `refs` key fails validation, so add the registry entry first. Use a
type-specific key (e.g. `…-device`, `…-firmware`) when the same site has
different paths per record type.

## Build & validate

- `npm run build:data` — compile all YAML into `data.json` (also `/data.json`).
- `npm test` / `npm run validate` — validate every file against the JSON
  Schemas and check that `vendorId` / device references resolve.

Both run automatically: `build:data` via the dev/build pre-hooks, and editing
any YAML while `npm run dev` is running live-rebuilds `data.json`.
