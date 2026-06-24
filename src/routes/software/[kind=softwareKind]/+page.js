import { software, softwareKindsInUse } from '$lib/data.js';

// Prerender one filtered list per software kind in use.
export function entries() {
  return softwareKindsInUse().map((kind) => ({ kind }));
}

export function load({ params }) {
  return { software, kind: params.kind };
}
