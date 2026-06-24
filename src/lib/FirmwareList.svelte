<script>
  // Shared firmware catalogue: search box, type-filter links and the card grid,
  // plus the latest-releases feed and compare bar. `activeType` comes from the
  // route (/firmwares/ or /firmwares/<type>/) so each filtered view is its own
  // prerendered page. The free-text query stays client-side, mirrored to `?q=`.
  import { base } from '$app/paths';
  import { TYPE_META, LICENSE_TYPE_META, licenseType, descriptionToPlain } from '$lib/data.js';
  import { pluralize, displayVersion, relativeTime, fullDateTime, releaseFreshnessTone } from '$lib/format.js';
  import ReleaseRow from '$lib/ReleaseRow.svelte';
  import Button from '$lib/Button.svelte';
  import PageHeader from '$lib/PageHeader.svelte';
  import Card from '$lib/Card.svelte';
  import CompareBar from '$lib/CompareBar.svelte';
  import { fwCompareIds, toggleFwCompare, clearFwCompare } from '$lib/fwCompare.js';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  let { firmwares, latest = [], activeType = 'all' } = $props();

  // Free-text query mirrored to `?q=`. Starts empty so the first client render
  // matches the prerendered HTML; the URL is read in onMount, after hydration.
  let query = $state('');
  let hydrated = $state(false);

  onMount(() => {
    query = new URLSearchParams(location.search).get('q') ?? '';
    hydrated = true;
  });

  $effect(() => {
    if (!browser || !hydrated) return;
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  });

  // Compact star count: 1240 → "1.2k", 980 → "980".
  function fmtStars(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  const TYPE_TABS = ['all', 'official', 'fork', 'custom'];
  const chipBase = 'rounded-full border px-3 py-1.5 text-[0.85rem] transition select-none';
  const chipOn = 'border-accent bg-accent/15 text-accent';
  const chipOff = 'border-edge bg-elev text-dim hover:border-accent/60 hover:text-ink';
  const typeHref = (t) => (t === 'all' ? `${base}/firmwares/` : `${base}/firmwares/${t}/`);

  let filtered = $derived(
    firmwares.filter((fw) => {
      if (activeType !== 'all' && fw.type !== activeType) return false;
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

<PageHeader collection="firmwares" subtitleClass="max-w-[60ch]">
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
  <!-- Type filter — links so each view is its own prerendered route. -->
  <div class="flex flex-wrap gap-1.5">
    {#each TYPE_TABS as t (t)}
      <a href={typeHref(t)} class="{chipBase} {activeType === t ? chipOn : chipOff}">
        {t === 'all' ? 'All' : TYPE_META[t].label}
      </a>
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
        {#if licensing}
          <span class="shrink-0 rounded-md px-1.5 py-0.5 text-[0.66rem] font-medium {LICENSE_TYPE_META[licensing]?.tw ?? ''}">
            {LICENSE_TYPE_META[licensing]?.label ?? licensing}
          </span>
        {/if}
      </div>
      <h2 class="text-[1.15rem] font-semibold">{fw.name}</h2>
      <p class="line-clamp-3 text-[0.9rem] text-dim">{descriptionToPlain(fw.description)}</p>
      <div class="mt-auto flex flex-wrap gap-1.5">
        {#each fw.roles ?? [] as role}
          <span class="rounded bg-elev2 px-2 py-0.5 text-[0.72rem] text-dim">{role}</span>
        {/each}
      </div>
      <!-- Popularity / freshness footer — mirrors the Software list layout:
           stars, latest version + when, and the maintainer, all left-aligned. -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge pt-2.5 text-[0.72rem] text-dim">
        {#if fw.popularity?.githubStars != null}
          <span class="inline-flex items-center gap-1" title="{fw.popularity.githubStars.toLocaleString()} GitHub stars">
            <svg class="h-3.5 w-3.5 text-warn" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="m12 2 2.9 6.3 6.8.7-5 4.6 1.4 6.7L12 17.8 5.9 20.3l1.4-6.7-5-4.6 6.8-.7L12 2Z" />
            </svg>
            <span class="tabular-nums">{fmtStars(fw.popularity.githubStars)}</span>
          </span>
        {/if}
        {#if fw.latest_version}
          <span class="inline-flex items-center gap-1" title={fw.released ? `Released ${fullDateTime(fw.released)}` : ''}>
            <span class="font-mono text-ink/80">{displayVersion(fw.latest_version)}</span>
            {#if fw.released}<span class="text-dim/80">· <span class={releaseFreshnessTone(fw.released)}>{relativeTime(fw.released)}</span></span>{/if}
          </span>
        {/if}
        {#if fw.maintainer}
          <span class="inline-flex min-w-0 items-center gap-1">
            <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" stroke-linecap="round" />
            </svg>
            <span class="truncate">{fw.maintainer}</span>
          </span>
        {/if}
      </div>
    </Card>
  {/each}
</div>

{#if latest?.length}
  <section class="mt-9">
    <div class="mb-3 flex items-baseline justify-between border-b border-edge pb-1.5">
      <h2 class="text-[1.1rem] font-semibold">Latest releases</h2>
      <a class="text-[0.85rem] text-accent2 hover:underline" href="{base}/releases/">Show all releases →</a>
    </div>
    <ol class="flex flex-col">
      {#each latest as r}
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
