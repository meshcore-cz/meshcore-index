<script>
  // Software icon with a graceful placeholder. Shows the bundled icon when one
  // is set, otherwise a lucide glyph chosen from the software `kind` — so list
  // and detail layouts stay aligned whether or not an icon exists.
  import AppWindow from '@lucide/svelte/icons/app-window';
  import Puzzle from '@lucide/svelte/icons/puzzle';
  import Network from '@lucide/svelte/icons/network';
  import Wrench from '@lucide/svelte/icons/wrench';
  import Activity from '@lucide/svelte/icons/activity';
  import Library from '@lucide/svelte/icons/library';
  import Globe from '@lucide/svelte/icons/globe';
  import Bot from '@lucide/svelte/icons/bot';
  import Box from '@lucide/svelte/icons/box';

  let {
    src = null,
    name = '',
    kind = '',
    /** Size + shape live here (e.g. "h-10 w-10 rounded-md"). */
    class: rootClass = '',
    /** Placeholder glyph size, relative to the box. */
    iconClass = 'h-1/2 w-1/2'
  } = $props();

  const ICONS = {
    client: AppWindow,
    integration: Puzzle,
    gateway: Network,
    monitoring: Activity,
    utility: Wrench,
    library: Library,
    'network-app': Globe,
    bot: Bot
  };
  let Icon = $derived(ICONS[kind] ?? Box);
</script>

<div
  class="flex shrink-0 items-center justify-center overflow-hidden border border-edge bg-elev2 {rootClass}"
>
  {#if src}
    <img {src} alt={name} loading="lazy" class="h-full w-full object-cover" />
  {:else}
    <Icon class="text-dim {iconClass}" aria-hidden="true" />
  {/if}
</div>
