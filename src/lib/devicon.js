// Inlined SVGs from the official Devicon library (https://devicon.dev), via the
// `devicon` npm package. Only the icons referenced by our programming-language
// and platform maps are imported here, so the bundle stays small. Keyed by the
// Devicon `<name>-<variant>` identifier.
//
// Preferred over the Iconify devicon port so we track the upstream library
// directly and share one icon source between languages and platforms.
import pythonOriginal from 'devicon/icons/python/python-original.svg?raw';
import javascriptOriginal from 'devicon/icons/javascript/javascript-original.svg?raw';
import typescriptOriginal from 'devicon/icons/typescript/typescript-original.svg?raw';
import dartOriginal from 'devicon/icons/dart/dart-original.svg?raw';
import bashOriginal from 'devicon/icons/bash/bash-original.svg?raw';
import cplusplusOriginal from 'devicon/icons/cplusplus/cplusplus-original.svg?raw';
import cOriginal from 'devicon/icons/c/c-original.svg?raw';
import kotlinOriginal from 'devicon/icons/kotlin/kotlin-original.svg?raw';
import rustOriginal from 'devicon/icons/rust/rust-original.svg?raw';
import html5Original from 'devicon/icons/html5/html5-original.svg?raw';
import css3Original from 'devicon/icons/css3/css3-original.svg?raw';
import goOriginal from 'devicon/icons/go/go-original.svg?raw';
import swiftOriginal from 'devicon/icons/swift/swift-original.svg?raw';
import javaOriginal from 'devicon/icons/java/java-original.svg?raw';
import csharpOriginal from 'devicon/icons/csharp/csharp-original.svg?raw';
import phpOriginal from 'devicon/icons/php/php-original.svg?raw';
import rubyOriginal from 'devicon/icons/ruby/ruby-original.svg?raw';
import luaOriginal from 'devicon/icons/lua/lua-original.svg?raw';
import vuejsOriginal from 'devicon/icons/vuejs/vuejs-original.svg?raw';
import nixosOriginal from 'devicon/icons/nixos/nixos-original.svg?raw';
import perlOriginal from 'devicon/icons/perl/perl-original.svg?raw';
import elixirOriginal from 'devicon/icons/elixir/elixir-original.svg?raw';
import haskellOriginal from 'devicon/icons/haskell/haskell-original.svg?raw';
import clojureOriginal from 'devicon/icons/clojure/clojure-original.svg?raw';
import zigOriginal from 'devicon/icons/zig/zig-original.svg?raw';
import scalaOriginal from 'devicon/icons/scala/scala-original.svg?raw';
// Platforms — monochrome `-plain` variants, rendered in currentColor (see the
// `mono` option of Devicon.svelte). Windows has no plain variant, so its
// single-colour `-original` is used (mono flattens it the same way).
import androidPlain from 'devicon/icons/android/android-plain.svg?raw';
import dockerPlain from 'devicon/icons/docker/docker-plain.svg?raw';
import linuxPlain from 'devicon/icons/linux/linux-plain.svg?raw';
import kubernetesPlain from 'devicon/icons/kubernetes/kubernetes-plain.svg?raw';
import raspberrypiPlain from 'devicon/icons/raspberrypi/raspberrypi-plain.svg?raw';
import arduinoPlain from 'devicon/icons/arduino/arduino-plain.svg?raw';
import windows11Original from 'devicon/icons/windows11/windows11-original.svg?raw';
import proxmoxPlain from 'devicon/icons/proxmox/proxmox-plain.svg?raw';

/** @type {Record<string, string>} */
export const DEVICON_SVGS = {
  'python-original': pythonOriginal,
  'javascript-original': javascriptOriginal,
  'typescript-original': typescriptOriginal,
  'dart-original': dartOriginal,
  'bash-original': bashOriginal,
  'cplusplus-original': cplusplusOriginal,
  'c-original': cOriginal,
  'kotlin-original': kotlinOriginal,
  'rust-original': rustOriginal,
  'html5-original': html5Original,
  'css3-original': css3Original,
  'go-original': goOriginal,
  'swift-original': swiftOriginal,
  'java-original': javaOriginal,
  'csharp-original': csharpOriginal,
  'php-original': phpOriginal,
  'ruby-original': rubyOriginal,
  'lua-original': luaOriginal,
  'vuejs-original': vuejsOriginal,
  'nixos-original': nixosOriginal,
  'perl-original': perlOriginal,
  'elixir-original': elixirOriginal,
  'haskell-original': haskellOriginal,
  'clojure-original': clojureOriginal,
  'zig-original': zigOriginal,
  'scala-original': scalaOriginal,
  'android-plain': androidPlain,
  'docker-plain': dockerPlain,
  'linux-plain': linuxPlain,
  'kubernetes-plain': kubernetesPlain,
  'raspberrypi-plain': raspberrypiPlain,
  'arduino-plain': arduinoPlain,
  'windows11-original': windows11Original,
  'proxmox-plain': proxmoxPlain
};

/** @param {string | null | undefined} key Devicon `<name>-<variant>` id. */
export function deviconSvg(key) {
  return (key && DEVICON_SVGS[key]) || null;
}
