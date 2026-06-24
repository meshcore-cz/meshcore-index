// Route matcher: only the software-kind slugs resolve to the filtered software
// list at /software/<kind>/. Anything else falls through to /software/[id]/
// (the detail page), so the two dynamic routes can share the segment.
const KINDS = new Set(['client', 'integration', 'gateway', 'monitoring', 'utility', 'library', 'network-app', 'bot']);

/** @param {string} param */
export function match(param) {
  return KINDS.has(param);
}
