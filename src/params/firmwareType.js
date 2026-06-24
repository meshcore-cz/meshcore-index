// Route matcher: only these firmware-type slugs resolve to the filtered firmware
// list at /firmwares/<type>/. Invalid types 404 instead of rendering an empty list.
const TYPES = new Set(['official', 'fork', 'custom']);

/** @param {string} param */
export function match(param) {
  return TYPES.has(param);
}
