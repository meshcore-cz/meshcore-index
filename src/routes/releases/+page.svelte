<script>
  import ReleaseRow from '$lib/ReleaseRow.svelte';
  import Seo from '$lib/Seo.svelte';
  import Pagination from '$lib/Pagination.svelte';
  let { data } = $props();

  const PER_PAGE = 100;
  let page = $state(1);

  let pageItems = $derived(data.releases.slice((page - 1) * PER_PAGE, page * PER_PAGE));

  // Scroll to top whenever the page changes via the pager.
  $effect(() => {
    void page;
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  });
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

<Pagination count={data.releases.length} perPage={PER_PAGE} bind:page />
