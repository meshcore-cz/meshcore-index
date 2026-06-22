<script>
  // Marks a network whose radio settings match an official MeshCore app preset.
  // `label` shows the "App preset" text; otherwise it's a compact icon-only chip.
  let { label = false, title = null } = $props();
</script>

<span
  class="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent2/30 bg-accent2/10 px-1.5 py-0.5 text-[0.62rem] font-semibold text-accent2"
  title={title ?? 'Selectable as an official MeshCore app radio preset'}
>
  <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke-linejoin="round" />
    <path d="M10.5 18.5h3" stroke-linecap="round" />
  </svg>
  {#if label}<span>App preset</span>{/if}
</span>
