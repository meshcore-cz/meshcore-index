import { error } from '@sveltejs/kit';
import { firmwares, getFirmware, getDevice } from '$lib/data.js';

// Tell the static adapter which firmware pages to prerender.
export function entries() {
  return firmwares.map((fw) => ({ id: fw.id }));
}

export function load({ params }) {
  const firmware = getFirmware(params.id);
  if (!firmware) throw error(404, `Unknown firmware: ${params.id}`);

  const devices = (firmware.devices ?? []).map((d) => ({
    ...d,
    device: getDevice(d.id) ?? { id: d.id, name: d.id }
  }));

  return { firmware, devices };
}
