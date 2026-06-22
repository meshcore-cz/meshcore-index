import { writable } from 'svelte/store';

/** Whether the global (Cmd+K) command palette is open. Shared so any page can
 *  open the palette the layout renders. */
export const searchOpen = writable(false);

/** True on Apple platforms. Safe during SSR (defaults to Mac, corrected on
 *  mount) — used to show ⌘ vs Ctrl in the search shortcut hint. */
export function isMacPlatform() {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(ua);
}
