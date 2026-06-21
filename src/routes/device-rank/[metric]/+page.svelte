<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { METRICS } from '$lib/metrics.js';
  import { favoriteIds } from '$lib/favorites.js';
  import Seo from '$lib/Seo.svelte';
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';

  let { data } = $props();

  let metric = $derived(data.metric);

  // Reference device + sort direction use query params (shareable overrides).
  // searchParams aren't available during prerender, so read them only in the browser.
  let params = $derived(browser ? $page.url.searchParams : new URLSearchParams());
  let fromId = $derived(params.get('from') ?? null);
  let dir = $derived(params.get('dir') ?? metric.dir);

  let ranked = $derived.by(() => {
    const withVal = data.devices
      .map((d) => ({ device: d, value: metric.get(d) }))
      .filter((r) => r.value != null);
    withVal.sort((a, b) => (dir === 'asc' ? a.value - b.value : b.value - a.value));
    return withVal;
  });

  /** Rank #1 always means "best" for the metric's natural ordering. */
  function rankAt(i, total) {
    return dir === metric.dir ? i + 1 : total - i;
  }

  let fromEntry = $derived.by(() => {
    if (!fromId) return null;
    const i = ranked.findIndex((r) => r.device.id === fromId);
    if (i === -1) return null;
    const { device, value } = ranked[i];
    const total = ranked.length;
    return { device, value, rank: rankAt(i, total), total };
  });

  function flipDir() {
    const p = new URLSearchParams(browser ? $page.url.searchParams : '');
    p.set('dir', dir === 'asc' ? 'desc' : 'asc');
    const qs = p.toString();
    goto(`${base}/device-rank/${metric.id}/${qs ? '?' + qs : ''}`, {
      replaceState: true,
      keepFocus: true,
      noScroll: true
    });
  }
</script>

<Seo
  title={`${metric.label} ranking`}
  description={`Every MeshCore device ranked by ${metric.label.toLowerCase()}${metric.unit ? ` (${metric.unit})` : ''}.`}
/>

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/devices/">← All devices</a>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Device ranking</h1>
<p class="mb-4 max-w-[60ch] text-dim">
  Every device ranked by a single spec. Pick a metric and the table re-sorts.
</p>

<div class="mb-5 flex flex-wrap gap-1.5">
  {#each METRICS as m (m.id)}
    <a
      class="rounded-full border px-2.5 py-1 text-[0.8rem] transition {m.id === metric.id
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-edge bg-elev text-dim hover:border-accent/60 hover:text-ink'}"
      href="{base}/device-rank/{m.id}/{fromId ? `?from=${fromId}` : ''}"
      aria-current={m.id === metric.id ? 'page' : undefined}
    >
      {m.label}{m.unit ? ` (${m.unit})` : ''}
    </a>
  {/each}
</div>

{#if fromEntry}
  <div class="mb-3 overflow-x-auto rounded-lg border border-accent/30 bg-accent/10">
    <table class="w-full border-collapse text-[0.85rem]">
      <tbody>
        <tr>
          <td class="w-12 px-3.5 py-2 text-right tabular-nums text-dim">
            {fromEntry.rank}<span class="text-muted">/{fromEntry.total}</span>
          </td>
          <td class="px-3.5 py-2">
            <a class="flex min-w-0 items-center gap-2 hover:text-accent" href="{base}/device/{fromEntry.device.id}/">
              <span class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded bg-elev2 p-0.5 text-muted">
                {#if fromEntry.device.imageUrl}
                  <img src={fromEntry.device.imageUrl} alt="" class="max-h-full max-w-full object-contain" />
                {:else}
                  <svg aria-hidden="true" viewBox="0 0 24 24" class="h-[15px] w-[15px]">
                    <rect x="7" y="4" width="10" height="16" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
                    <path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                  </svg>
                {/if}
              </span>
              <span class="truncate font-medium">{fromEntry.device.name}</span>
              {#if $favoriteIds.includes(fromEntry.device.id)}<span class="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide text-accent uppercase">Favourite</span>{/if}
            </a>
          </td>
          <td class="px-3.5 py-2 text-right font-semibold tabular-nums">
            {metric.fmt(fromEntry.value)}{metric.unit ? ` ${metric.unit}` : ''}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
{/if}

<div class="overflow-x-auto rounded-xl border border-edge">
  <table class="w-full border-collapse text-[0.9rem]">
    <thead>
      <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
        <th class="w-12 border-b border-edge px-3.5 py-2.5 text-right">#</th>
        <th class="border-b border-edge px-3.5 py-2.5">Device</th>
        <th class="border-b border-edge px-3.5 py-2.5 text-right">
          <button
            class="inline-flex items-center gap-1 hover:text-ink"
            onclick={flipDir}
            title="Toggle sort direction"
          >
            {metric.label}{metric.unit ? ` (${metric.unit})` : ''}
            <ArrowUpDown class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </th>
      </tr>
    </thead>
    <tbody>
      {#each ranked as { device, value }, i (device.id)}
        <tr class="group {$favoriteIds.includes(device.id) || device.id === fromId ? 'bg-accent/10' : ''}">
          <td class="border-b border-edge px-3.5 py-2 text-right tabular-nums text-dim">
            {rankAt(i, ranked.length)}
          </td>
          <td class="border-b border-edge px-3.5 py-2">
            <a class="flex items-center gap-2.5 hover:text-accent" href="{base}/device/{device.id}/">
              <span class="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded bg-elev2 p-0.5 text-muted">
                {#if device.imageUrl}
                  <img src={device.imageUrl} alt="" class="max-h-full max-w-full object-contain" />
                {:else}
                  <svg aria-hidden="true" viewBox="0 0 24 24" class="h-[17px] w-[17px]">
                    <rect x="7" y="4" width="10" height="16" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
                    <path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                  </svg>
                {/if}
              </span>
              <span>{device.name}</span>
              {#if $favoriteIds.includes(device.id)}<span class="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide text-accent uppercase">Favourite</span>{/if}
            </a>
          </td>
          <td class="border-b border-edge px-3.5 py-2 text-right font-semibold tabular-nums">
            {metric.fmt(value)}{metric.unit ? ` ${metric.unit}` : ''}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if !ranked.length}
  <p class="mt-4 rounded-xl border border-edge bg-elev p-8 text-center text-dim">No devices record this spec yet.</p>
{/if}
