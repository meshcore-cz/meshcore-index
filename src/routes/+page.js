import { networks, devices, firmwares, software, vendors, contributors } from '$lib/data.js';

export function load() {
  return {
    counts: {
      networks: networks.length,
      devices: devices.length,
      firmwares: firmwares.length,
      software: software.length,
      vendors: vendors.length
    },
    contributors
  };
}
