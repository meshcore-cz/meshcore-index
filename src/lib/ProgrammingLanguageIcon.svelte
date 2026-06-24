<script>
  import Devicon from '$lib/Devicon.svelte';
  import { programmingLanguageMeta, programmingLanguageIcon } from '$lib/programming-languages.js';

  let {
    language,
    /** When true, show the language label beside the icon. */
    showLabel = false,
    size = 16,
    class: className = ''
  } = $props();

  let meta = $derived(programmingLanguageMeta(language));
  let icon = $derived(programmingLanguageIcon(language));
</script>

<span class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap {className}" title={meta.label}>
  {#if icon}
    <Devicon {icon} {size} />
  {/if}
  {#if showLabel}<span class="text-[0.85rem]">{meta.label}</span>{/if}
</span>
