// Programming-language slugs (as carried in software.yaml `languages`) mapped to
// a proper display label and a Devicon icon id (`<name>-<variant>` from the
// official devicon library). Shared by the Language Leaderboard and the software
// detail page so naming and icons stay consistent everywhere. Languages without
// a Devicon icon simply render as their label.
//
// Named "programming languages" to avoid confusion with natural/spoken languages
// the catalogue may describe later.

/** @typedef {{ label: string, icon?: string }} ProgrammingLanguageMeta */

/** @type {Record<string, ProgrammingLanguageMeta>} */
export const PROGRAMMING_LANGUAGES = {
  python: { label: 'Python', icon: 'python-original' },
  javascript: { label: 'JavaScript', icon: 'javascript-original' },
  typescript: { label: 'TypeScript', icon: 'typescript-original' },
  dart: { label: 'Dart', icon: 'dart-original' },
  shell: { label: 'Shell', icon: 'bash-original' },
  cpp: { label: 'C++', icon: 'cplusplus-original' },
  c: { label: 'C', icon: 'c-original' },
  kotlin: { label: 'Kotlin', icon: 'kotlin-original' },
  rust: { label: 'Rust', icon: 'rust-original' },
  html: { label: 'HTML', icon: 'html5-original' },
  css: { label: 'CSS', icon: 'css3-original' },
  go: { label: 'Go', icon: 'go-original' },
  swift: { label: 'Swift', icon: 'swift-original' },
  java: { label: 'Java', icon: 'java-original' },
  csharp: { label: 'C#', icon: 'csharp-original' },
  php: { label: 'PHP', icon: 'php-original' },
  ruby: { label: 'Ruby', icon: 'ruby-original' },
  lua: { label: 'Lua', icon: 'lua-original' },
  vue: { label: 'Vue', icon: 'vuejs-original' },
  nix: { label: 'Nix', icon: 'nixos-original' },
  perl: { label: 'Perl', icon: 'perl-original' },
  elixir: { label: 'Elixir', icon: 'elixir-original' },
  haskell: { label: 'Haskell', icon: 'haskell-original' },
  clojure: { label: 'Clojure', icon: 'clojure-original' },
  zig: { label: 'Zig', icon: 'zig-original' },
  scala: { label: 'Scala', icon: 'scala-original' },
  // Languages we carry but Devicon has no icon for — label only.
  cuda: { label: 'CUDA' },
  metal: { label: 'Metal' },
  assembly: { label: 'Assembly' },
  batchfile: { label: 'Batchfile' },
  basic: { label: 'BASIC' }
};

/** @param {string} id */
export function programmingLanguageMeta(id) {
  return PROGRAMMING_LANGUAGES[id] ?? { label: id.charAt(0).toUpperCase() + id.slice(1) };
}

/** @param {string} id */
export function programmingLanguageLabel(id) {
  return programmingLanguageMeta(id).label;
}

/** @param {string} id Devicon `<name>-<variant>` id, or null when none. */
export function programmingLanguageIcon(id) {
  return PROGRAMMING_LANGUAGES[id]?.icon ?? null;
}
