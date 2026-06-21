# Contributing data

How to fill the atlas data well — for **anyone** editing the YAML under `data/`,
human or agent.

- **What fields exist:** [`SCHEMA.md`](SCHEMA.md) (field reference).
- **Machine contracts:** [`../schema/`](../schema/) (JSON Schema sources).
- **This file:** the conventions and judgement calls that the schema can't enforce.

All site content is YAML under `data/`. The app reads a compiled
`src/lib/generated/data.json`, built from that YAML.

## Validate your changes

```bash
npm test              # validate all YAML against JSON Schema + referential checks
npm run build:data    # regenerate data.json and static/schema/*.json
```

Run **`npm test`** after every data change. `build:data` runs automatically via
the dev/build hooks, but run it by hand after changing `schema/` or
`data/globals.yaml`.

## Directory layout

```
data/devices/<id>/device.yaml    # id = directory name (kebab-case), not in YAML
data/devices/<id>/<image>.svg    # thumbnail (optional)
data/devices/<id>/datasheet.pdf  # vendor spec PDF (optional, immutable copy)
data/firmwares/<id>/firmware.yaml
data/vendors/<id>/vendor.yaml
data/globals.yaml                # MCU/radio/display/GNSS/frequency catalog
```

A device counts as supported by a firmware only when it's listed in that
firmware's `devices[]` (`data/firmwares/<id>/firmware.yaml`) — not merely by
having a device record.

## Enriching a device

1. Read the vendor **product page**, the **datasheet PDF**, and vendor docs/wiki
   when linked.
2. Copy structure from a **similar enriched device** (see templates) — don't
   invent a sparse partial YAML.
3. Add `# Source:` with the product page URL; add a second `# Source:` line for a
   datasheet or docs URL when helpful.
4. Fill **all applicable structured fields** — not just `description` prose.
5. Add catalog keys to `data/globals.yaml` only when a new MCU model, radio chip,
   or GNSS part appears (additive — unknown keys render as raw text).
6. If the vendor publishes a spec PDF, **commit it locally and link it in YAML**
   (see Datasheets) — don't leave the URL in a comment.

### Templates (copy from these)

| Device kind | Start from |
|-------------|------------|
| Heltec ESP32 + LoRa (V3/V4/T190) | `heltec-v3`, `heltec-v4`, `heltec-t190` |
| Heltec nRF52 + LoRa (T114) | `heltec-t114` |
| Seeed tracker / node | `wio-tracker-l1`, `sensecap-t1000e` |
| Elecrow ThinkNode | `thinknode-m2`, `thinknode-m1` |
| LilyGo handheld | `lilygo-t-deck`, `lilygo-techo` |

### Naming

Keep **`name` as short as possible** — what you'd say out loud or fit on a card.
Drop vendor marketing filler that doesn't distinguish the product.

**Use `name` for the short label:**
- `Heltec T114` not `Heltec Mesh Node T114`
- `Heltec T190` not `Heltec Vision Master T190`
- `Heltec V3` not `Heltec WiFi LoRa 32 V3`
- `LilyGo T-Echo` not `LilyGo T-Echo LILYGO`
- `ThinkNode M2 Mini` when that's the distinct SKU

**Put in `aliases`** (not `name`): official product titles, module codes, old
names. Examples: `Mesh Node T114`, `Vision Master T190`, `WiFi LoRa 32 V3`,
`HT-VMT190`.

**Vendor prefix:** include when it disambiguates (`Seeed Studio Wio Tracker L1`,
`Elecrow ThinkNode M1`). Omit when the brand is obvious or the line is already
unique (`Heltec V3`, `LilyGo T-Deck`, `Heltec T190`).

- Device **id** stays kebab-case and stable (`heltec-v3`, not renamed for marketing).
- **`kind`**: `dev-board` for bare development boards; `product` for finished
  handhelds/enclosed products; `kit` for bundled kits (see `heltec-v4-exp`).

### Description

Keep **`description` short** — one or two sentences (~200–350 characters), like
the hero blurb on the device page. Say **what the product is** and one or two
distinguishing hooks (outdoor node, kit bundle, optional LoRa SKU).

**Do not repeat structured fields** — battery capacity, IP rating, connector
types, display size, antenna ports, and USB details belong in the YAML spec
blocks, not in prose.

**Good examples:** `wio-tracker-l1`, `heltec-v3`, `heltec-t190`
**Too long:** restating expansion connectors, mAh, certifications, or antenna
ports already captured elsewhere.

### URLs & datasheets

- `product_url`: vendor **marketing/product page** (external, may change).
- `datasheet`: **local PDF filename** in the device directory — not a URL.

Datasheets work like thumbnails: a **file in the device directory** plus a
**field in `device.yaml`**. The site links them on the device page.

```yaml
image: heltec_v3.svg          # only if the .svg file exists in the directory
datasheet: datasheet.pdf      # required when you have a vendor PDF
```

When you find a vendor PDF during enrichment:

1. `curl -o data/devices/<id>/datasheet.pdf '<vendor-url>'`
2. Add `datasheet: datasheet.pdf` in `device.yaml`
3. Run `npm test` — validation fails if `datasheet` is set but the file is missing

**Do not** put `# Datasheet: https://…` in comments — that does not create a link.
Heltec PDFs usually live under `https://resource.heltec.cn/download/<product>/`.

### Prices

- `price.amount`: round to **whole USD** (e.g. `$39.90` → `40`, not `17.9`).
- `price.asOf`: `YYYY-MM` (e.g. `2026-06`).
- Omit `price` entirely when the shop only shows "add to cart" with no fixed USD.

### Built-in vs optional hardware

Read the spec table and packing list carefully. **Do not guess from checkout
options alone.**

| Pattern | YAML approach | Example |
|---------|---------------|---------|
| **Always on board** | `display.status: present` with size/resolution/controller | T190 1.9″ TFT, V3 OLED |
| **Optional at purchase** (common SKU has it) | `display.status: present` + note "optional" in `description` | T114 with display variant |
| **Add-on module only** | `gnss.status: none` + `expansion` for connector/module | T114 L76K, V4 GNSS header |
| **Built-in GNSS** | `gnss.status: present` + `chip` | T1000-E AG3335, T-Echo L76K |

**Do not remove `display: present`** on boards that ship with a display in the
catalogued SKU (e.g. T114 with TFT) — when enriching for MeshCore, that's usually
the configuration meant.

Optional **LoRa** at purchase: still document `radios[]` for the MeshCore target
board; mention an optional/no-LoRa SKU in `description` only.

### Fields to fill when enriching

Use the **datasheet**, not just the shop blurb.

| Area | Fill in |
|------|---------|
| MCU | `model`, `flashMb`, `psramMb` when applicable |
| Radio | all band keys from spec (`433`, `470`, `868`, `915`), `txPowerDbm`, `antenna` |
| Display | `status`, `technology`, `controller`, `size`, `resolution`, `colors` |
| Power | `batterySupported`, `batteryBuiltIn`, `batteryConnector`, `charging`, `solarInput` |
| Physical | `dimensionsMm`, `weightG` from spec table |
| USB | `connector` (usually `USB-C` on current boards — never leave `unknown` if known) |
| Expansion | concrete `type` (`header-2.54`, `gnss-1.25-8`, `quicklink-sh1.0-4p`) — not generic `connector` |
| Image | `image: foo.svg` **only** if `data/devices/<id>/foo.svg` exists |

Skip redundant fields: don't set `display.touch: false`, don't duplicate
datasheet URLs in comments.

### MCU catalog

Devices store only `hardware.mcu.model` (e.g. `esp32-s3`, `esp32`, `nrf52840`).
Family and architecture are derived from `data/globals.yaml`. The original
**ESP32** chip is model `esp32` under family `esp32` — both are registered in
globals; lookup prefers the **model** entry over the family.

### Battery & card badges

- `batterySupported: true` alone = external connector support, **not** a built-in pack.
- Don't expect a "Battery" card badge for connector-only support; badges show
  **`batteryCapacityMah`** (e.g. `850 mAh`) when a built-in capacity is known.
- `batteryBuiltIn: true` + `batteryCapacityMah` for integrated cells.
- Solar: `solarPanelBuiltIn: true` for an integrated panel (drives the "Solar"
  badge); `solarInput: true` is just the ability to attach a panel.

### Display & UI roles

- `standalone-ui` role when the device has a usable on-device display for firmware UI.
- Display size in YAML drives hero/cards (e.g. `0.96″ OLED`, `1.9″ display`).
- Include `controller` (e.g. `ST7789`, `SSD1306`) when the datasheet names it.

### Common pitfalls

- Match **radio chip** to hardware (V2 = SX1276, V3/V4/T114/T190 = SX1262 — ignore wrong titles on shop pages).
- `interfaces.wifi.status: none` when there is no Wi-Fi (LR1110 Wi-Fi *scan* for positioning is not user Wi-Fi).
- **Heltec ESP32-S3R8** boards often have **16 MB flash + 8 MB PSRAM** — check the datasheet, don't leave MCU bare.
- Only add schema fields that exist in `schema/device.yaml` — run `npm test`.
- Keep diffs focused; don't bulk-edit every device unless asked.
- **Don't "correct" display to `unknown`** on boards the catalog treats as having a screen without checking intent.
- **Don't revert or strip** existing enrichment without reviewing against the datasheet first.

## Contributor checklist

- [ ] `npm test` passes
- [ ] Copied structure from a similar enriched device — not a minimal stub
- [ ] Short `name`; long titles in `aliases`; `kind` set correctly
- [ ] `description` is 1–2 sentences (~200–350 chars); no duplicate of structured specs
- [ ] Datasheet PDF downloaded + `datasheet: datasheet.pdf` (when a vendor PDF exists)
- [ ] No `# Datasheet:` URL comments
- [ ] MCU flash/PSRAM, radio bands, display specs, USB connector, physical dims filled from datasheet
- [ ] `image:` only if the SVG file exists in the device directory
- [ ] Display/GNSS reflect built-in vs add-on correctly
- [ ] Price rounded to whole USD, or omitted if the shop has no fixed price
- [ ] `# Source:` comment(s) with product page (+ docs URL if used)
