import { software } from '$lib/data.js';

// Tally how many software entries declare each programming language. A record
// can list several languages, so totals across languages exceed the catalog
// size; `coverage` is the share of all software that uses a given language.
export function load() {
  const counts = new Map();
  for (const s of software) {
    for (const lang of s.languages ?? []) {
      const entry = counts.get(lang) ?? { language: lang, count: 0 };
      entry.count += 1;
      counts.set(lang, entry);
    }
  }

  const languages = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.language.localeCompare(b.language)
  );

  return { languages, totalSoftware: software.length };
}
