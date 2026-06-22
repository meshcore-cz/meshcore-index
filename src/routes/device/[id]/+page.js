import { error } from '@sveltejs/kit';
import { devices, getDevice, firmwaresForDevice, familyVariants } from '$lib/data.js';

export function entries() {
  return devices.map((d) => ({ id: d.id }));
}

export function load({ params }) {
  const device = getDevice(params.id);
  if (!device) throw error(404, `Unknown device: ${params.id}`);
  return {
    device,
    firmwares: firmwaresForDevice(params.id),
    family: familyVariants(device)
  };
}
