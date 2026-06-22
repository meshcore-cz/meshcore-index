<script>
  import { Tooltip } from 'bits-ui';

  /**
   * Lightweight tooltip on bits-ui Tooltip.
   *
   * Pass your trigger element via the `trigger` snippet; it receives the merged
   * trigger props (spread them onto your element) so the tooltip never wraps an
   * extra <button> around your control:
   *
   *   <Tooltip text="Toggle theme">
   *     {#snippet trigger(props)}
   *       <Button {...props}>…</Button>
   *     {/snippet}
   *   </Tooltip>
   *
   * A single <Tooltip.Provider> in the root layout supplies shared timing.
   */
  let { text, side = 'top', sideOffset = 6, delayDuration = undefined, trigger } = $props();
</script>

<Tooltip.Root {delayDuration}>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      {@render trigger(props)}
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      {side}
      {sideOffset}
      class="z-50 max-w-xs rounded-md border border-edge bg-elev2 px-2 py-1 text-[0.78rem] text-ink shadow-lg shadow-black/30"
    >
      <Tooltip.Arrow class="text-edge" />
      {text}
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>
