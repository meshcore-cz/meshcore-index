<script>
  import { Avatar } from 'bits-ui';

  /**
   * Image with a graceful fallback, built on bits-ui Avatar. While the image
   * loads (or if it fails / is absent) the fallback content is shown instead.
   *
   * Pass either `src` (+ `alt`) for a remote image, or just children/`label`
   * for an icon/initial fallback.
   */
  let {
    src = undefined,
    alt = '',
    /** Fallback text (e.g. an initial) when no image and no children given. */
    label = '',
    /** Container classes — size/shape/border live here. */
    class: rootClass = '',
    imgClass = 'h-full w-full object-contain',
    children
  } = $props();
</script>

<Avatar.Root delayMs={0} class={rootClass}>
  {#if src}
    <Avatar.Image {src} {alt} class={imgClass} />
  {/if}
  <Avatar.Fallback class="flex h-full w-full items-center justify-center">
    {#if children}
      {@render children()}
    {:else if label}
      <span class="text-[0.7rem] font-bold text-dim">{label.slice(0, 1).toUpperCase()}</span>
    {/if}
  </Avatar.Fallback>
</Avatar.Root>
