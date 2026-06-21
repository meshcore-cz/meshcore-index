<script>
  import { base } from '$app/paths';
  import { TYPE_META, FW_STATUS_TW } from '$lib/data.js';
  import { SITE_NAME, absUrl } from '$lib/seo.js';
  import Seo from '$lib/Seo.svelte';
  import ReleaseRow from '$lib/ReleaseRow.svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  let { data } = $props();

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absUrl('/'),
    description:
      'A catalog of official and community MeshCore firmwares and the devices they run on.'
  };

  // Filter state is hydrated from / synced to the URL so a filtered view links.
  const initParams = browser ? get(page).url.searchParams : new URLSearchParams();
  let query = $state(initParams.get('q') ?? '');
  let typeFilter = $state(
    ['official', 'fork', 'custom'].includes(initParams.get('type')) ? initParams.get('type') : 'all'
  );

  $effect(() => {
    if (!browser) return;
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (typeFilter !== 'all') p.set('type', typeFilter);
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  });

  const statusLabels = {
    active: 'Active',
    maintenance: 'Maintenance',
    inactive: 'Inactive',
    experimental: 'Experimental'
  };

  let filtered = $derived(
    data.firmwares.filter((fw) => {
      if (typeFilter !== 'all' && fw.type !== typeFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        fw.name.toLowerCase().includes(q) ||
        (fw.maintainer ?? '').toLowerCase().includes(q) ||
        (fw.description ?? '').toLowerCase().includes(q) ||
        (fw.features ?? []).some((f) => f.toLowerCase().includes(q))
      );
    })
  );
</script>

<Seo
  description="A catalog of official and community MeshCore firmwares and the devices they run on — with details, node roles, and a compatibility matrix."
  jsonLd={homeJsonLd}
/>

<section class="mb-7">
  <h1 class="mb-1.5 text-[clamp(1.6rem,5vw,2.2rem)] font-bold">MeshCore Index</h1>
  <p class="max-w-[60ch] text-dim">
    A catalog of official and community MeshCore firmwares and the
    <a class="text-accent2 hover:underline" href="{base}/devices/">devices</a> they run on — with
    details, node roles, and a
    <a class="text-accent2 hover:underline" href="{base}/matrix/">compatibility matrix</a>.
  </p>
</section>

<h2 class="mb-3 text-[1.1rem] font-semibold">All firmwares</h2>

<div class="mb-4 flex flex-wrap items-center gap-4">
  <input
    type="search"
    placeholder="Search firmwares, features, maintainers…"
    bind:value={query}
    class="min-w-[220px] flex-1 rounded-lg border border-edge bg-elev px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
  />
  <div class="flex flex-wrap gap-1.5">
    {#each ['all', 'official', 'fork', 'custom'] as t}
      <button
        onclick={() => (typeFilter = t)}
        class="rounded-full border px-3 py-1.5 text-[0.85rem] {typeFilter === t
          ? 'border-accent bg-accent font-semibold text-[#06231a]'
          : 'border-edge bg-elev text-dim hover:text-ink'}"
      >
        {t === 'all' ? 'All' : TYPE_META[t].label}
      </button>
    {/each}
  </div>
</div>

<p class="mb-4 text-[0.85rem] text-dim">{filtered.length} firmware{filtered.length === 1 ? '' : 's'}</p>

<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
  {#each filtered as fw (fw.id)}
    <a
      class="group flex flex-col gap-2.5 rounded-xl border border-edge bg-elev p-[1.1rem] transition hover:-translate-y-0.5 hover:border-accent"
      href="{base}/firmware/{fw.id}/"
    >
      <div class="flex items-center justify-between">
        <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {TYPE_META[fw.type]?.tw}">
          {TYPE_META[fw.type]?.label ?? fw.type}
        </span>
        <span class="text-[0.75rem] {FW_STATUS_TW[fw.status] ?? 'text-dim'}">
          {statusLabels[fw.status] ?? fw.status}
        </span>
      </div>
      <h2 class="text-[1.15rem] font-semibold">{fw.name}</h2>
      <p class="line-clamp-3 text-[0.9rem] text-dim">{fw.description}</p>
      <div class="mt-auto flex flex-wrap gap-1.5">
        {#each fw.roles ?? [] as role}
          <span class="rounded bg-elev2 px-2 py-0.5 text-[0.72rem] text-dim">{role}</span>
        {/each}
      </div>
      <div class="flex items-center justify-between border-t border-edge pt-2.5 text-[0.8rem] text-dim">
        <span>{fw.maintainer}</span>
        {#if fw.latest_version}<span class="font-mono">{fw.latest_version}</span>{/if}
      </div>
    </a>
  {/each}
</div>

{#if data.latest?.length}
  <section class="mt-9">
    <div class="mb-3 flex items-baseline justify-between border-b border-edge pb-1.5">
      <h2 class="text-[1.1rem] font-semibold">Latest releases</h2>
      <a class="text-[0.85rem] text-accent2 hover:underline" href="{base}/releases/">Show all releases →</a>
    </div>
    <ol class="flex flex-col">
      {#each data.latest as r}
        <li><ReleaseRow release={r} /></li>
      {/each}
    </ol>
  </section>
{/if}
