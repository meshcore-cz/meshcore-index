// Favourite devices. Persisted to localStorage because this is a long-lived
// personal preference, unlike the session-scoped compare selection.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'atlas:favourite-devices';

function initial() {
  if (!browser) return [];
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export const favoriteIds = writable(initial());

if (browser) {
  favoriteIds.subscribe((ids) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      // ignore quota / privacy-mode errors
    }
  });
}

export function toggleFavorite(id) {
  favoriteIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
}
