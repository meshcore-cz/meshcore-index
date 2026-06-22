<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import {
    NETWORK_SCOPE_META,
    networkFlags,
    networkRadioSettings,
    bandLabel,
    isAppPresetNetwork
  } from '$lib/data.js';
  import NetworkAreaMap from '$lib/NetworkAreaMap.svelte';
  import AppPresetBadge from '$lib/AppPresetBadge.svelte';
  import Seo from '$lib/Seo.svelte';
  import { onMount } from 'svelte';
  import { LIVE_ENABLED, poll, fmtRate } from '$lib/pulse.js';
  let { data } = $props();

  // Live pkt/m per network, polled from the optional API. Keyed by network id;
  // empty (and the column hidden) when no API is configured.
  let liveById = $state({});
  onMount(() =>
    poll('/api/networks', 5000, (res) => {
      const next = {};
      for (const n of res.networks ?? []) next[n.id] = n;
      liveById = next;
    })
  );

  // Whole-row navigation: clicking anywhere on a row opens the network, unless
  // the click landed on a real link/button (let those do their own thing) or
  // the user is selecting text (so text stays selectable/copyable).
  function rowClick(event, id) {
    if (event.target.closest('a, button')) return;
    if (window.getSelection()?.toString()) return;
    goto(`${base}/network/${id}/`);
  }

  // One frequency label per radio, e.g. "869.618 MHz" (falls back to a band key).
  const radioFreq = (r) =>
    r?.frequency_mhz != null
      ? `${r.frequency_mhz} MHz`
      : r?.frequency
        ? (bandLabel(r.frequency) ?? r.frequency)
        : '—';

  // Per-column sort value accessors. Strings sort case-insensitively; nullish
  // (or empty) values always sink to the bottom regardless of direction.
  const SORT_ACCESSORS = {
    name: (n) => n.name?.toLowerCase() ?? '',
    scope: (n) => NETWORK_SCOPE_META[n.scope]?.label ?? n.scope ?? '',
    area: (n) => n.areaKm2,
    frequency: (n) => networkRadioSettings(n)[0]?.frequency_mhz ?? null,
    sf: (n) => networkRadioSettings(n)[0]?.spreading_factor ?? null,
    bw: (n) => networkRadioSettings(n)[0]?.bandwidth_khz ?? null,
    cr: (n) => networkRadioSettings(n)[0]?.coding_rate ?? '',
    live: (n) => liveById[n.id]?.pktPerMin ?? null,
    nodes: (n) => liveById[n.id]?.nodes ?? null,
    observers: (n) => liveById[n.id]?.observers ?? null
  };

  // Default to largest coverage area first, matching the page's prior ordering.
  let sortKey = $state('area');
  let sortDir = $state('desc');

  function toggleSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      // Text columns read best A→Z; numeric columns biggest-first.
      sortDir = typeof SORT_ACCESSORS[key](data.networks[0]) === 'string' ? 'asc' : 'desc';
    }
  }

  // Deprecated networks are kept for reference but pulled out of the map and the
  // main table into their own section below.
  let activeNetworks = $derived(data.networks.filter((n) => !n.deprecated));
  let deprecatedNetworks = $derived(data.networks.filter((n) => n.deprecated));

  let sortedNetworks = $derived.by(() => {
    const get = SORT_ACCESSORS[sortKey];
    const dir = sortDir === 'asc' ? 1 : -1;
    const empty = (v) => v == null || v === '';
    return [...activeNetworks].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (empty(va) && empty(vb)) return 0;
      if (empty(va)) return 1;
      if (empty(vb)) return -1;
      if (typeof va === 'string') return dir * va.localeCompare(vb);
      return dir * (va - vb);
    });
  });
</script>

<Seo
  title="Networks"
  description={`${data.networks.length} organized MeshCore meshes — their radio settings, coverage and how to join.`}
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Networks</h1>
<p class="mb-5 text-dim">
  Organized regional and national MeshCore meshes — their radio settings, coverage and how to
  join.
</p>

{#if data.networks.length}
  <NetworkAreaMap networks={activeNetworks} {liveById} />

  {#snippet sortTh(key, label, alignRight = false, title = null)}
    <th
      class="border-b border-edge px-3.5 py-2.5 {alignRight ? 'text-right' : ''}"
      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        class="inline-flex items-center gap-1 tracking-wide uppercase hover:text-ink {alignRight ? 'flex-row-reverse' : ''} {sortKey === key ? 'text-ink' : ''}"
        onclick={() => toggleSort(key)}
        {title}
      >
        <span>{label}</span>
        <span class="text-[0.7em] {sortKey === key ? 'text-accent' : 'opacity-30'}" aria-hidden="true">
          {sortKey === key && sortDir === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  {/snippet}

  {#snippet networkRow(n)}
    {@const radios = networkRadioSettings(n)}
    {@const rows = Math.max(radios.length, 1)}
    {@const live = liveById[n.id]}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <tbody class="group cursor-pointer hover:bg-elev" onclick={(e) => rowClick(e, n.id)}>
    {#each radios.length ? radios : [null] as r, i}
      {@const last = i === rows - 1}
      {@const bc = last ? 'border-b border-edge' : 'border-b border-edge/30'}
      <tr>
        {#if i === 0}
          <td rowspan={rows} class="border-b border-edge px-3.5 py-2.5 align-middle">
            <a class="flex items-center gap-2.5 font-medium group-hover:text-accent" href="{base}/network/{n.id}/">
              {#each networkFlags(n) as flag (flag.code)}
                <span
                  class="inline-flex h-4 w-6 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-edge/70 [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover"
                  title={flag.code}
                  aria-hidden="true"
                >
                  {@html flag.svg}
                </span>
              {/each}
              <span>{n.name}</span>
              {#if n.short_name && n.short_name !== n.name}
                <span class="font-mono text-[0.74rem] text-dim">{n.short_name}</span>
              {/if}
              {#if isAppPresetNetwork(n)}
                <AppPresetBadge />
              {/if}
            </a>
          </td>
          <td rowspan={rows} class="border-b border-edge px-3.5 py-2.5 align-middle">
            {#if n.scope}
              <span class="rounded-md px-2 py-0.5 text-[0.68rem] font-bold tracking-wide uppercase {NETWORK_SCOPE_META[n.scope]?.tw ?? 'bg-elev2 text-dim'}">
                {NETWORK_SCOPE_META[n.scope]?.label ?? n.scope}
              </span>
            {/if}
          </td>
        {/if}
        <td class="{bc} px-3.5 py-2 font-mono text-[0.8rem] tabular-nums whitespace-nowrap">{radioFreq(r)}</td>
        <td class="{bc} px-3.5 py-2 font-mono text-[0.8rem] tabular-nums text-dim">{r?.spreading_factor != null ? `SF${r.spreading_factor}` : '—'}</td>
        <td class="{bc} px-3.5 py-2 font-mono text-[0.8rem] tabular-nums whitespace-nowrap text-dim">{r?.bandwidth_khz != null ? `${r.bandwidth_khz} kHz` : '—'}</td>
        <td class="{bc} px-3.5 py-2 font-mono text-[0.8rem] tabular-nums text-dim">{r?.coding_rate ?? '—'}</td>
        {#if LIVE_ENABLED && i === 0}
          <td rowspan={rows} class="border-b border-edge px-3.5 py-2.5 text-right align-middle font-mono text-[0.82rem] tabular-nums whitespace-nowrap">
            {#if live}
              <span
                class={live.analyzersConnected ? 'text-accent' : 'text-dim'}
                title="{live.analyzersConnected}/{live.analyzersTotal} analyzers connected · network total across all bands"
              >{fmtRate(live.pktPerMin)}</span>
            {:else}
              <span class="text-dim">—</span>
            {/if}
          </td>
          <td rowspan={rows} class="border-b border-edge px-3.5 py-2.5 text-right align-middle font-mono text-[0.82rem] tabular-nums whitespace-nowrap">
            {#if live}{live.nodes.toLocaleString()}{:else}<span class="text-dim">—</span>{/if}
          </td>
          <td rowspan={rows} class="border-b border-edge px-3.5 py-2.5 text-right align-middle font-mono text-[0.82rem] tabular-nums whitespace-nowrap">
            {#if live}{live.observers.toLocaleString()}{:else}<span class="text-dim">—</span>{/if}
          </td>
        {/if}
      </tr>
    {/each}
    </tbody>
  {/snippet}

  <div class="overflow-x-auto rounded-xl border border-edge">
    <table class="w-full border-collapse text-[0.9rem]">
      <thead>
        <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
          {@render sortTh('name', 'Network')}
          {@render sortTh('scope', 'Scope')}
          {@render sortTh('frequency', 'Frequency')}
          {@render sortTh('sf', 'SF')}
          {@render sortTh('bw', 'BW')}
          {@render sortTh('cr', 'CR')}
          {#if LIVE_ENABLED}
            {@render sortTh('live', 'pkt/m', true, "Unique packets in the last minute, seen by this network's analyzers (live)")}
            {@render sortTh('nodes', 'Nds', true, 'Distinct mesh nodes seen recently across this network (live)')}
            {@render sortTh('observers', 'Obs', true, 'Distinct observer nodes reporting to this network (live)')}
          {/if}
        </tr>
      </thead>
        {#each sortedNetworks as n (n.id)}{@render networkRow(n)}{/each}
    </table>
  </div>

  {#if deprecatedNetworks.length}
    <h2 class="mt-9 mb-1 text-[1.1rem] font-semibold">Deprecated networks</h2>
    <p class="mb-3 max-w-[70ch] text-[0.85rem] text-dim">
      Superseded app presets, kept for reference. Hidden from the coverage map above.
    </p>
    <div class="overflow-x-auto rounded-xl border border-edge opacity-80">
      <table class="w-full border-collapse text-[0.9rem]">
        <thead>
          <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
            <th class="border-b border-edge px-3.5 py-2.5">Network</th>
            <th class="border-b border-edge px-3.5 py-2.5">Scope</th>
            <th class="border-b border-edge px-3.5 py-2.5">Frequency</th>
            <th class="border-b border-edge px-3.5 py-2.5">SF</th>
            <th class="border-b border-edge px-3.5 py-2.5">BW</th>
            <th class="border-b border-edge px-3.5 py-2.5">CR</th>
            {#if LIVE_ENABLED}
              <th class="border-b border-edge px-3.5 py-2.5 text-right">pkt/m</th>
              <th class="border-b border-edge px-3.5 py-2.5 text-right">Nds</th>
              <th class="border-b border-edge px-3.5 py-2.5 text-right">Obs</th>
            {/if}
          </tr>
        </thead>
        {#each deprecatedNetworks as n (n.id)}{@render networkRow(n)}{/each}
      </table>
    </div>
  {/if}
{:else}
  <p class="text-dim">No networks recorded yet.</p>
{/if}
