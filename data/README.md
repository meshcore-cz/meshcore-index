# MeshCore Ninja data

The MeshCore Ninja catalogue, authored as human-readable YAML and compiled into
`data.json` for the site and API.

- `networks/` — regional/national MeshCore meshes and how to join them
- `devices/` — supported LoRa hardware
- `firmwares/` — official and community MeshCore firmwares
- `vendors/` — hardware/firmware vendors
- `compatibility/` — which firmwares run on which devices
- `globals.yaml` — shared definitions (node roles, MCU/radio catalogs, bands, …)

Authoring guide: [`RULES.md`](RULES.md). Field reference: [`SCHEMA.md`](SCHEMA.md).
Machine-readable schemas live in [`../schema/`](../schema/).

## License

All data in this directory — and the generated exports built from it
(`data.json`, `/data.json`, the per-record JSON, and the schemas) — is dedicated
to the public domain under **CC0 1.0 Universal**. See [`LICENSE`](LICENSE).

You may copy, modify, redistribute and use it, commercially or otherwise,
without permission or attribution. CC0 also waives applicable *sui generis*
database rights (EU database law).

> **Contributing:** by adding content here you agree to dedicate it under CC0
> 1.0 and confirm you have the right to do so. Do **not** submit copyrighted
> descriptions, photographs or vendor logos — link to the source or supply your
> own wording and assets. Third-party images and trademarks remain under their
> original licenses and are not covered by this dedication.

Full breakdown, including code (MIT) and third-party assets:
[`../LICENSES.md`](../LICENSES.md).
