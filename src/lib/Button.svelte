<script module>
  // Shared variant + size class maps so every button across the Atlas pulls
  // from one design-system definition.
  export const BUTTON_VARIANTS = {
    primary: 'border border-accent bg-accent font-semibold text-bg hover:bg-accent/90',
    outline: 'border border-edge bg-elev text-ink hover:border-accent',
    ghost: 'border border-transparent text-dim hover:bg-elev2 hover:text-ink',
    subtle: 'border border-edge bg-elev text-dim hover:text-ink',
    link: 'text-accent2 hover:underline',
    danger: 'border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20'
  };

  export const BUTTON_SIZES = {
    sm: 'justify-center gap-1 rounded-md px-2 py-1 text-[0.8rem]',
    md: 'justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.85rem]',
    lg: 'justify-center gap-2 rounded-lg px-4 py-2 text-[0.95rem]',
    icon: 'justify-center rounded-lg p-2',
    // Opt out of all sizing/centering — caller supplies its own layout classes.
    none: ''
  };
</script>

<script>
  import { Button } from 'bits-ui';

  /**
   * Design-system button on bits-ui Button. Renders an <a> when `href` is set
   * (with full keyboard/disabled handling), otherwise a <button>.
   */
  let {
    variant = 'outline',
    size = 'md',
    /** Toggle/chip active state — only meaningful with variant="chip" handled by caller. */
    href = undefined,
    type = 'button',
    class: extra = '',
    children,
    ...rest
  } = $props();

  const base =
    'inline-flex items-center font-medium leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 disabled:pointer-events-none';
</script>

<Button.Root
  {href}
  type={href ? undefined : type}
  class={`${base} ${BUTTON_SIZES[size] ?? BUTTON_SIZES.md} ${BUTTON_VARIANTS[variant] ?? ''} ${extra}`}
  {...rest}
>
  {@render children?.()}
</Button.Root>
