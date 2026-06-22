<script>
  // Provenance footer shown at the bottom of a record detail page: when the
  // record was last edited, plus links to its source YAML and compiled JSON.
  import { REPO_URL } from '$lib/seo.js';

  let { source = null, jsonPath = null } = $props();

  const fmtDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(+d)
      ? null
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  let edited = $derived(fmtDate(source?.updatedAt));
  let sourceUrl = $derived(source?.path ? `${REPO_URL}/blob/main/${source.path}` : null);
</script>

<footer class="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-edge pt-4 text-[0.85rem] text-dim">
  {#if edited}
    <span>Last edited <time datetime={source.updatedAt}>{edited}</time></span>
  {/if}
  {#if sourceUrl}
    {#if edited}<span class="text-edge">·</span>{/if}
    <a class="transition hover:text-accent hover:underline" href={sourceUrl} target="_blank" rel="noopener noreferrer">View source</a>
  {/if}
  {#if jsonPath}
    <span class="text-edge">·</span>
    <!-- Static asset, not a route: data-sveltekit-reload bypasses the client
         router so trailingSlash:'always' can't rewrite it to a 404. -->
    <a class="transition hover:text-accent hover:underline" href={jsonPath} data-sveltekit-reload>View JSON</a>
  {/if}
</footer>
