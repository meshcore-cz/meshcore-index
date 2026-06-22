<script>
  import { onMount } from 'svelte';
  import { isMacPlatform } from '$lib/search.js';

  // The global search shortcut hint: a tight ⌘K on Mac, Ctrl K elsewhere.
  // Rendered in font-sans — the ⌘ glyph looks correct in the sans face (Inter)
  // and clunky/oversized in monospace. Defaults to Mac for SSR, fixed on mount.
  let isMac = $state(true);
  onMount(() => (isMac = isMacPlatform()));
</script>

<span class="font-sans">{#if isMac}⌘K{:else}Ctrl&nbsp;K{/if}</span>
