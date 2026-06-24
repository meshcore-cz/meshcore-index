// Utility / tool pages — labels, routes, icons and where each appears in the UI.
import Grid2X2Check from '@lucide/svelte/icons/grid-2x2-check';
import Trophy from '@lucide/svelte/icons/trophy';
import Code from '@lucide/svelte/icons/code';
import Radio from '@lucide/svelte/icons/radio';
import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
import GitCompare from '@lucide/svelte/icons/git-compare';
import Tags from '@lucide/svelte/icons/tags';
import Braces from '@lucide/svelte/icons/braces';
import Activity from '@lucide/svelte/icons/activity';
import Info from '@lucide/svelte/icons/info';

/** @typedef {'matrix' | 'device-rank' | 'compare' | 'compare-firmwares' | 'releases' | 'languages' | 'bands' | 'schemas' | 'status' | 'about'} ToolId */

/** @type {Record<ToolId, { id: ToolId, label: string, href: string, icon: import('svelte').Component, home?: boolean, homeLabel?: string }>} */
export const TOOLS = {
  matrix: {
    id: 'matrix',
    label: 'Compatibility matrix',
    href: '/matrix/',
    icon: Grid2X2Check,
    home: true
  },
  'device-rank': {
    id: 'device-rank',
    label: 'Device ranking',
    href: '/device-rank/',
    icon: Trophy,
    home: true
  },
  compare: {
    id: 'compare',
    label: 'Compare devices',
    href: '/compare/',
    icon: GitCompareArrows,
    home: true
  },
  'compare-firmwares': {
    id: 'compare-firmwares',
    label: 'Compare firmwares',
    href: '/compare-firmwares/',
    icon: GitCompare,
    home: true
  },
  releases: {
    id: 'releases',
    label: 'Releases',
    homeLabel: 'All releases',
    href: '/releases/',
    icon: Tags,
    home: true
  },
  languages: {
    id: 'languages',
    label: 'Language leaderboard',
    href: '/languages/',
    icon: Code,
    home: true
  },
  bands: {
    id: 'bands',
    label: 'Frequency bands',
    href: '/bands/',
    icon: Radio,
    home: true
  },
  schemas: {
    id: 'schemas',
    label: 'Schema explorer',
    href: '/schemas/',
    icon: Braces,
    home: true
  },
  status: {
    id: 'status',
    label: 'API status',
    href: '/status/',
    icon: Activity,
    home: true
  },
  about: {
    id: 'about',
    label: 'About',
    href: '/about/',
    icon: Info
  }
};

/** Tool links on the home page Tools section, in display order. */
export const HOME_TOOL_IDS = [
  'matrix',
  'device-rank',
  'compare',
  'compare-firmwares',
  'releases',
  'languages',
  'bands',
  'schemas',
  'status'
];

/** @param {ToolId | string | null | undefined} id */
export function toolById(id) {
  return id ? (TOOLS[id] ?? null) : null;
}

/** @param {ToolId} id */
export function toolHomeLabel(id) {
  const tool = TOOLS[id];
  return tool?.homeLabel ?? tool?.label ?? id;
}
