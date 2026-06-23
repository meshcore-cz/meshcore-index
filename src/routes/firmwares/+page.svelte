<script>
  import { base } from '$app/paths';
  import { TYPE_META, FW_STATUS_TW, LICENSE_TYPE_META, licenseType, descriptionToPlain } from '$lib/data.js';
  import { pluralize } from '$lib/format.js';
  import Seo from '$lib/Seo.svelte';
  import ReleaseRow from '$lib/ReleaseRow.svelte';
  import Button from '$lib/Button.svelte';
  import Chip from '$lib/Chip.svelte';
  import PageHeader from '$lib/PageHeader.svelte';
  import Card from '$lib/Card.svelte';
  import CompareBar from '$lib/CompareBar.svelte';
  import { fwCompareIds, toggleFwCompare, clearFwCompare } from '$lib/fwCompare.js';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  let { data } = $props();

  // Filter state is synced to / from the URL so a filtered view links. It starts
  // at its defaults so the first client render matches the prerendered (unfiltered)
  // HTML; the URL is read in onMount, after hydration. Reading it at init instead
  // diverged from the prerendered list and corrupted hydration.
  let query = $state('');
  let typeFilter = $state('all');
  let hydrated = $state(false);

  onMount(() => {
    const p = new URLSearchParams(location.search);
    query = p.get('q') ?? '';
    typeFilter = ['official', 'fork', 'custom'].includes(p.get('type')) ? p.get('type') : 'all';
    hydrated = true;
  });

  $effect(() => {
    // Wait until onMount has applied the URL → state, or the first run would
    // immediately overwrite the incoming query string with empty defaults.
    if (!browser || !hydrated) return;
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

<PageHeader title="Firmwares" subtitleClass="max-w-[60ch]">
  The official MeshCore build plus community forks and custom variants — with node roles and the
  <a class="text-accent2 hover:underline" href="{base}/devices/">devices</a> they run on.
</PageHeader>

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

<p class="mb-4 text-[0.85rem] text-dim">{pluralize(filtered.length, 'firmware')}</p>

<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
  {#each filtered as fw (fw.id)}
    {@const licensing = licenseType(fw)}
    <Card href="{base}/firmware/{fw.id}/" class="flex flex-col gap-2.5 p-[1.1rem]">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {TYPE_META[fw.type]?.tw}">
            {TYPE_META[fw.type]?.label ?? fw.type}
          </span>
          {#if licensing}
            <span class="rounded-md px-1.5 py-0.5 text-[0.66rem] font-medium {LICENSE_TYPE_META[licensing]?.tw ?? ''}">
              {LICENSE_TYPE_META[licensing]?.label ?? licensing}
            </span>
          {/if}
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
      <p class="line-clamp-3 text-[0.9rem] text-dim">{descriptionToPlain(fw.description)}</p>
      <div class="mt-auto flex flex-wrap gap-1.5">
        {#each fw.roles ?? [] as role}
          <span class="rounded bg-elev2 px-2 py-0.5 text-[0.72rem] text-dim">{role}</span>
        {/each}
      </div>
      <div class="flex items-center justify-between border-t border-edge pt-2.5 text-[0.8rem] text-dim">
        <span>{fw.maintainer}</span>
        {#if fw.latest_version}<span class="font-mono">{fw.latest_version}</span>{/if}
      </div>
    </Card>
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

<CompareBar
  count={$fwCompareIds.length}
  href="{base}/compare-firmwares/?ids={$fwCompareIds.join(',')}"
  onclear={clearFwCompare}
/>
