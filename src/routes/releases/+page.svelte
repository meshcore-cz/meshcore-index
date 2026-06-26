<script>
  import { base } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
  import { SITE_NAME } from '$lib/seo.js';
  import PageHeader from '$lib/PageHeader.svelte';
  import Pagination from '$lib/Pagination.svelte';
  import Chip from '$lib/Chip.svelte';
  import { displayVersion, fmtDateTime, relativeTime } from '$lib/format.js';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  let { data } = $props();

  const releaseHref = (r) => `${base}${r.project.href}#release-${r.version}`;

  // Make the whole row navigate to the release, but don't hijack a real click on
  // the project link, a modified click (open-in-new-tab etc.), or a text
  // selection drag.
  function onRowClick(e, r) {
    if (e.target.closest('a, button')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.getSelection?.().toString()) return;
    goto(releaseHref(r));
  }

  const PER_PAGE = 100;
  let page = $state(1);

  // Filter state starts at its defaults so the first client render matches the
  // prerendered (unfiltered) HTML; the URL is read in onMount, after hydration.
  // Reading it at init would diverge from the prerendered list and corrupt
  // hydration (see the Devices page for the same pattern).
  let kind = $state('all'); // all | firmware | software
  let query = $state('');
  let hydrated = $state(false);

  onMount(() => {
    const p = new URLSearchParams(location.search);
    const k = p.get('kind');
    if (k === 'firmware' || k === 'software') kind = k;
    query = p.get('q') ?? '';
    hydrated = true;
  });

  $effect(() => {
    // Wait until onMount has applied the URL → state, or the first run would
    // immediately overwrite the incoming query string with empty defaults.
    if (!browser || !hydrated) return;
    const p = new URLSearchParams();
    if (kind !== 'all') p.set('kind', kind);
    if (query.trim()) p.set('q', query.trim());
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  });

  const counts = {
    all: data.releases.length,
    firmware: data.releases.filter((r) => r.project.kind === 'firmware').length,
    software: data.releases.filter((r) => r.project.kind === 'software').length
  };
  const KINDS = [
    { id: 'all', label: 'All' },
    { id: 'firmware', label: 'Firmwares' },
    { id: 'software', label: 'Software' }
  ];

  let filtered = $derived(
    data.releases.filter((r) => {
      if (kind !== 'all' && r.project.kind !== kind) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (
          !r.project.name.toLowerCase().includes(q) &&
          !(r.version ?? '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    })
  );

  // Back to the first page whenever the active filter changes.
  let filterKey = $derived(`${kind}|${query.trim().toLowerCase()}`);
  $effect(() => {
    void filterKey;
    page = 1;
  });

  let pageItems = $derived(filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE));

  // Scroll to top whenever the page changes via the pager.
  $effect(() => {
    void page;
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  });

  const KIND_BADGE = {
    firmware: 'bg-accent/15 text-accent',
    software: 'bg-accent2/15 text-accent2'
  };
</script>

<Seo
  title="Releases"
  description={`${data.releases.length} MeshCore firmware and software releases across all projects, newest first.`}
/>

<svelte:head>
  <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} — Releases`} href="{base}/releases.xml" />
</svelte:head>

<PageHeader tool="releases" subtitleClass="mb-4">
  Releases across all firmwares and software, newest first.
  <a
    href="{base}/releases.xml"
    class="ml-2 inline-flex items-center gap-1 text-accent hover:underline"
    title="RSS feed"
  >
    <svg viewBox="0 0 24 24" class="size-4 fill-current" aria-hidden="true">
      <path
        d="M6.18 17.82a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36ZM4 11.43a8.57 8.57 0 0 1 8.57 8.57h-3a5.57 5.57 0 0 0-5.57-5.57v-3ZM4 4a16 16 0 0 1 16 16h-3A13 13 0 0 0 4 7V4Z"
      />
    </svg>
    RSS
  </a>
</PageHeader>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <div class="flex flex-wrap gap-1.5">
    {#each KINDS as k (k.id)}
      <Chip pressed={kind === k.id} onPressedChange={() => (kind = k.id)} class="px-3 py-1.5 text-[0.85rem]">
        {k.label} <span class="opacity-60">{counts[k.id]}</span>
      </Chip>
    {/each}
  </div>
  <input
    type="search"
    placeholder="Search project or version…"
    bind:value={query}
    class="min-w-[200px] flex-1 rounded-lg border border-edge bg-bg px-3 py-2 text-[0.9rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
  />
</div>

<p class="mb-4 text-[0.85rem] text-dim">{filtered.length} releases</p>

{#if pageItems.length}
  <div class="overflow-x-auto">
    <table class="w-full min-w-[640px] border-collapse text-[0.9rem]">
      <thead>
        <tr class="text-left text-[0.72rem] tracking-wide text-dim uppercase">
          <th class="border-b border-edge px-2.5 py-2 font-semibold">Type</th>
          <th class="border-b border-edge px-2.5 py-2 font-semibold">Project</th>
          <th class="border-b border-edge px-2.5 py-2 font-semibold">Version</th>
          <th class="border-b border-edge px-2.5 py-2 font-semibold">Released</th>
          <th class="border-b border-edge px-2.5 py-2 text-right font-semibold">Date</th>
        </tr>
      </thead>
      <tbody>
        {#each pageItems as r (r.project.kind + r.project.id + r.version)}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <tr class="cursor-pointer hover:bg-elev/60" onclick={(e) => onRowClick(e, r)}>
            <td class="border-b border-edge px-2.5 py-2.5 align-middle">
              <span class="rounded px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase {KIND_BADGE[r.project.kind]}">
                {r.project.kind === 'software' ? 'Software' : 'Firmware'}
              </span>
            </td>
            <td class="border-b border-edge px-2.5 py-2.5 align-middle">
              <a class="font-medium text-accent2 hover:underline" href={releaseHref(r)}>{r.project.name}</a>
            </td>
            <td class="border-b border-edge px-2.5 py-2.5 align-middle whitespace-nowrap">
              <span class="font-mono font-semibold">{displayVersion(r.version)}</span>
              {#if r.prerelease}
                <span class="ml-1.5 rounded bg-warn/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide text-warn uppercase">Pre</span>
              {/if}
              {#if r.variants.length > 1}
                <span class="ml-1.5 text-[0.75rem] text-dim">{r.variants.length} variants</span>
              {/if}
            </td>
            <td class="border-b border-edge px-2.5 py-2.5 align-middle whitespace-nowrap text-[0.82rem] text-dim">
              {relativeTime(r.datetime)}
            </td>
            <td class="border-b border-edge px-2.5 py-2.5 text-right align-middle whitespace-nowrap font-mono text-[0.82rem] text-dim">
              {fmtDateTime(r.datetime)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <Pagination count={filtered.length} perPage={PER_PAGE} bind:page />
{:else}
  <p class="rounded-xl border border-edge bg-elev p-8 text-center text-dim">No releases match these filters.</p>
{/if}
