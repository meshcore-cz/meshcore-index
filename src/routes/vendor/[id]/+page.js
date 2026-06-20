import { error } from '@sveltejs/kit';
import { vendors, getVendor, devicesForVendor } from '$lib/data.js';

export function entries() {
  return vendors.map((v) => ({ id: v.id }));
}

export function load({ params }) {
  const vendor = getVendor(params.id);
  if (!vendor) throw error(404, `Unknown vendor: ${params.id}`);
  return { vendor, devices: devicesForVendor(params.id) };
}
