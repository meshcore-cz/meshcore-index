<script>
  // Renders an inlined Devicon SVG (official devicon library) at a given size.
  import { deviconSvg } from '$lib/devicon.js';

  // `mono` flattens the icon to the current text colour. Devicon's baked-in
  // `fill="#…"` are presentation attributes, so a stylesheet rule wins over them
  // — no SVG string processing needed. Use with the monochrome `-plain` variants.
  let { icon, size = 16, mono = false, class: className = '' } = $props();
  let svg = $derived(deviconSvg(icon));
</script>

{#if svg}
  <span
    class="devicon inline-flex shrink-0 items-center justify-center {mono ? 'devicon-mono' : ''} {className}"
    style="width: {size}px; height: {size}px"
    aria-hidden="true"
  >{@html svg}</span>
{/if}

<style>
  .devicon :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .devicon-mono :global(svg),
  .devicon-mono :global(svg *) {
    fill: currentColor;
  }
</style>
