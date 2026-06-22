import { allBands } from '$lib/data.js';

export function load() {
  return { bands: allBands() };
}
