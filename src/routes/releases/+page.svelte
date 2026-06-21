<script>
  import ReleaseRow from '$lib/ReleaseRow.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();

  const PER_PAGE = 100;
  let page = $state(1);

  let pageCount = $derived(Math.max(1, Math.ceil(data.releases.length / PER_PAGE)));
  let pageItems = $derived(data.releases.slice((page - 1) * PER_PAGE, page * PER_PAGE));

  function go(p) {
    page = Math.min(pageCount, Math.max(1, p));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }
</script>

<Seo
  title="Releases"
  description={`${data.releases.length} MeshCore firmware releases across all projects, newest first.`}
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Releases</h1>
<p class="mb-5 text-dim">{data.releases.length} releases across all firmwares, newest first.</p>

<ol class="flex flex-col">
  {#each pageItems as r}
    <li><ReleaseRow release={r} /></li>
  {/each}
</ol>

{#if pageCount > 1}
  <nav class="mt-5 flex flex-wrap items-center justify-center gap-1.5">
    <button
      onclick={() => go(page - 1)}
      disabled={page === 1}
      class="rounded-md border border-edge bg-elev px-3 py-1.5 text-[0.85rem] enabled:hover:text-ink disabled:opacity-40"
    >← Prev</button>

    {#each Array(pageCount) as _, i}
      {@const n = i + 1}
      <button
        onclick={() => go(n)}
        class="min-w-9 rounded-md border px-3 py-1.5 text-[0.85rem] {n === page
          ? 'border-accent bg-accent font-semibold text-[#06231a]'
          : 'border-edge bg-elev text-dim hover:text-ink'}"
      >{n}</button>
    {/each}

    <button
      onclick={() => go(page + 1)}
      disabled={page === pageCount}
      class="rounded-md border border-edge bg-elev px-3 py-1.5 text-[0.85rem] enabled:hover:text-ink disabled:opacity-40"
    >Next →</button>
  </nav>
{/if}
