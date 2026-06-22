<script>
  import { base } from '$app/paths';
  import { TYPE_META, FW_STATUS_TW } from '$lib/data.js';
  import Seo from '$lib/Seo.svelte';
  import ReleaseRow from '$lib/ReleaseRow.svelte';
  import Button from '$lib/Button.svelte';
  import Chip from '$lib/Chip.svelte';
  import { fwCompareIds, toggleFwCompare, clearFwCompare } from '$lib/fwCompare.js';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  let { data } = $props();

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
  title="Firmwares"
  description="Official and community MeshCore firmwares — the official build plus community forks and custom variants, with node roles and supported devices."
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Firmwares</h1>
<p class="mb-5 max-w-[60ch] text-dim">
  The official MeshCore build plus community forks and custom variants — with node roles and the
  <a class="text-accent2 hover:underline" href="{base}/devices/">devices</a> they run on.
</p>

<div class="mb-4 flex flex-wrap items-center gap-4">
  <input
    type="search"
    placeholder="Search firmwares, features, maintainers…"
    bind:value={query}
    class="min-w-[220px] flex-1 rounded-lg border border-edge bg-bg px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
  />
  <div class="flex flex-wrap gap-1.5">
    {#each ['all', 'official', 'fork', 'custom'] as t}
      <Chip pressed={typeFilter === t} onPressedChange={() => (typeFilter = t)} class="px-3 py-1.5 text-[0.85rem]">
        {t === 'all' ? 'All' : TYPE_META[t].label}
      </Chip>
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
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {TYPE_META[fw.type]?.tw}">
            {TYPE_META[fw.type]?.label ?? fw.type}
          </span>
          <Button
            variant=""
            size="none"
            aria-label="Compare {fw.name}"
            aria-pressed={$fwCompareIds.includes(fw.id)}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleFwCompare(fw.id);
            }}
            class="rounded-md border px-1.5 py-0.5 text-[0.66rem] font-medium transition {$fwCompareIds.includes(
              fw.id
            )
              ? 'border-accent bg-accent text-bg'
              : 'border-edge text-dim opacity-0 group-hover:opacity-100 hover:text-ink'}"
          >
            {$fwCompareIds.includes(fw.id) ? '✓ Compare' : '+ Compare'}
          </Button>
        </div>
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

{#if $fwCompareIds.length}
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
    <div class="pointer-events-auto flex items-center gap-3 rounded-full border border-edge bg-elev2 py-2 pr-2 pl-4 shadow-2xl">
      <span class="text-[0.85rem] text-dim">
        <span class="font-semibold text-ink">{$fwCompareIds.length}</span> selected
      </span>
      <Button variant="" size="none" class="text-[0.85rem] text-dim hover:text-ink" onclick={clearFwCompare}>Clear</Button>
      <a
        class="rounded-full bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-bg hover:opacity-90"
        href="{base}/compare-firmwares/?ids={$fwCompareIds.join(',')}"
      >
        Compare →
      </a>
    </div>
  </div>
{/if}
