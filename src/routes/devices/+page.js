import { devices, firmwaresForDevice } from '$lib/data.js';

export function load() {
  return {
    devices: devices.map((d) => ({
      ...d,
      firmwareCount: firmwaresForDevice(d.id).length
    }))
  };
}
