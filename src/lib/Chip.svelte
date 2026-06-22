<script>
  import { Toggle } from 'bits-ui';

  /**
   * Pill-shaped filter chip on bits-ui Toggle — gives proper aria-pressed and
   * keyboard semantics while preserving the caller's own selection model.
   */
  let {
    pressed = false,
    onPressedChange,
    /** 'accent' (green, default) or 'accent2' (blue) active colour. */
    tone = 'accent',
    class: extra = '',
    children
  } = $props();

  const base = 'rounded-full border px-2.5 py-1 text-[0.8rem] transition cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
  const onTone = {
    accent: 'border-accent bg-accent/15 text-accent',
    accent2: 'border-accent2 bg-accent2/15 text-accent2'
  };
  const off = 'border-edge bg-elev text-dim hover:border-accent/60 hover:text-ink';
</script>

<Toggle.Root
  {pressed}
  {onPressedChange}
  class={`${base} ${pressed ? (onTone[tone] ?? onTone.accent) : off} ${extra}`}
>
  {@render children?.()}
</Toggle.Root>
