<script>
  import { base } from '$app/paths';
  import {
    deviceMcuLabel,
    deviceSearchText,
    deviceDisplayLabel,
    devicePriceLabel,
    resolveMcuInfo,
    resolveRadio
  } from '$lib/data.js';
  import { compareIds, toggleCompare, clearCompare } from '$lib/compare.js';
  import { favoriteIds, toggleFavorite } from '$lib/favorites.js';
  import Seo from '$lib/Seo.svelte';
  import { browser } from '$app/environment';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  let { data } = $props();

  // --- Per-device accessors used by both facets and card rendering -----------
  const deviceFamily = (d) => resolveMcuInfo(d)?.family?.name ?? deviceMcuLabel(d);
  const radioShort = (d) => {
    const chip = (d.hardware?.radios ?? []).map((r) => r.chip).find((c) => c && c !== 'unknown');
    return chip ? (resolveRadio(chip)?.name ?? chip) : null;
  };
  const deviceChips = (d) =>
    (d.hardware?.radios ?? []).map((r) => r.chip).filter((c) => c && c !== 'unknown');

  // Capability pills shown on each card, in priority order. Only present
  // capabilities render, so cards stay clean for sparsely-documented boards.
  function featurePills(d) {
    const out = [];
    const pw = d.hardware?.power;
    if (d.hardware?.gnss?.status === 'present') out.push({ label: 'GPS' });
    if (d.hardware?.display?.status === 'present')
      out.push({ label: deviceDisplayLabel(d.hardware.display) });
    if (pw?.batteryCapacityMah) out.push({ label: `${pw.batteryCapacityMah} mAh`, accent: true });
    // Only a built-in solar panel is a notable feature — solar *input* (the
    // ability to attach a panel) is an option, not shown here.
    if (pw?.solarPanelBuiltIn) out.push({ label: pw.solarPanelWatts ? `Solar ${pw.solarPanelWatts}W` : 'Solar', accent: true });
    for (const item of d.hardware?.input ?? []) {
      if (item.type === 'keyboard') out.push({ label: 'Keyboard' });
      else if (item.type === 'trackball') out.push({ label: 'Trackball' });
      else if (item.type === 'joystick') out.push({ label: 'Joystick' });
    }
    return out;
  }

  // --- Label helpers ---------------------------------------------------------
  const humanize = (v) =>
    String(v).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const DISPLAY_LABELS = { oled: 'OLED', 'e-paper': 'E-Paper', 'e-ink': 'E-Ink', display: 'LCD' };
  const TRANSPORT_LABELS = { ble: 'BLE', usb: 'USB', tcp: 'TCP', wifi: 'Wi-Fi', ethernet: 'Ethernet', serial: 'Serial' };

  // --- Facet definitions -----------------------------------------------------
  // Each facet extracts the set of values a device carries; selecting values
  // keeps devices whose set intersects the selection (OR within a facet, AND
  // across facets). `primary` facets show by default; the rest live under
  // "Advanced". Facets with no options are hidden automatically.
  const displayTech = (d) => {
    const dp = d.hardware?.display;
    return dp?.status === 'present' && dp.technology && dp.technology !== 'unknown'
      ? [dp.technology]
      : [];
  };
  const FACETS = [
    { id: 'mcu', label: 'MCU', primary: true, get: (d) => { const f = deviceFamily(d); return f && f !== 'Unknown' ? [f] : []; } },
    { id: 'radio', label: 'Radio', primary: true, get: deviceChips, fmt: (v) => v.toUpperCase() },
    { id: 'roles', label: 'Roles', primary: true, get: (d) => d.roles ?? [], fmt: humanize },
    { id: 'vendor', label: 'Vendor', get: (d) => (d.vendorName ? [d.vendorName] : []) },
    { id: 'arch', label: 'Arch', get: (d) => { const a = resolveMcuInfo(d)?.architecture?.name; return a ? [a] : []; } },
    { id: 'band', label: 'Band', get: (d) => [...new Set((d.hardware?.radios ?? []).flatMap((r) => r.frequencyVariants ?? []))], fmt: (v) => `${v}` },
    { id: 'transports', label: 'Link', get: (d) => d.transports ?? [], fmt: (v) => TRANSPORT_LABELS[v] ?? humanize(v) },
    { id: 'kind', label: 'Kind', get: (d) => (d.kind ? [d.kind] : []), fmt: humanize },
    { id: 'lifecycle', label: 'Status', get: (d) => (d.lifecycle ? [d.lifecycle] : []), fmt: humanize },
    { id: 'display', label: 'Screen', get: displayTech, fmt: (v) => DISPLAY_LABELS[v] ?? humanize(v) },
    { id: 'connector', label: 'USB', get: (d) => { const c = d.interfaces?.usb?.connector; return c ? [c] : []; } },
    { id: 'source', label: 'Source', get: (d) => [d.official ? 'Official' : 'Community'] }
  ];

  // --- Boolean capability toggles --------------------------------------------
  const TOGGLES = [
    { id: 'gps', label: 'GPS', primary: true, test: (d) => d.hardware?.gnss?.status === 'present' },
    { id: 'screen', label: 'Display', primary: true, test: (d) => d.hardware?.display?.status === 'present' },
    { id: 'battery', label: 'Battery', primary: true, test: (d) => d.hardware?.power?.batterySupported === true },
    { id: 'solarPanel', label: 'Solar Panel', primary: true, test: (d) => d.hardware?.power?.solarPanelBuiltIn === true },
    { id: 'solarInput', label: 'Solar Input', primary: true, test: (d) => d.hardware?.power?.solarInput === true },
    { id: 'charging', label: 'Charging', test: (d) => d.hardware?.power?.charging === true },
    { id: 'touch', label: 'Touch', test: (d) => d.hardware?.display?.touch === true },
    { id: 'wifi', label: 'Wi-Fi', test: (d) => d.interfaces?.wifi?.status === 'present' },
    { id: 'bluetooth', label: 'Bluetooth', test: (d) => d.interfaces?.bluetooth?.ble === true },
    { id: 'waterproof', label: 'IP-rated', test: (d) => !!d.hardware?.enclosure?.ipRating },
    { id: 'enclosure', label: 'Enclosure', test: (d) => d.hardware?.enclosure?.builtIn === true }
  ];

  // --- Numeric range filters -------------------------------------------------
  const RANGES = [
    { id: 'price', label: 'Price', unit: '$', get: (d) => d.price?.amount },
    { id: 'flash', label: 'Flash', unit: 'MB', get: (d) => d.hardware?.mcu?.flashMb },
    { id: 'psram', label: 'PSRAM', unit: 'MB', get: (d) => d.hardware?.mcu?.psramMb },
    { id: 'battery', label: 'Battery', unit: 'mAh', get: (d) => d.hardware?.power?.batteryCapacityMah },
    { id: 'tx', label: 'TX power', unit: 'dBm', get: (d) => Math.max(...(d.hardware?.radios ?? []).map((r) => r.txPowerDbm).filter((v) => v != null), -Infinity) }
  ];
  const rangeVal = (d, r) => {
    const v = r.get(d);
    return v == null || v === -Infinity ? null : v;
  };

  // Tally distinct values → [value, count], most common first.
  function tally(values) {
    const m = new Map();
    for (const v of values) if (v != null && v !== '') m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  }

  let facetOptions = $derived(
    Object.fromEntries(FACETS.map((f) => [f.id, tally(data.devices.flatMap(f.get))]))
  );

  // --- Filter state (hydrated from / synced to the URL, so a filtered view is
  // shareable and bookmarkable) ----------------------------------------------
  const initParams = browser ? get(page).url.searchParams : new URLSearchParams();
  const csv = (key) => (initParams.get(key) ?? '').split(',').filter(Boolean);

  let query = $state(initParams.get('q') ?? '');
  let advanced = $state(initParams.get('adv') === '1');
  let sort = $state(initParams.get('sort') ?? 'name');

  // Sort options. `cmp` orders two devices; null-valued devices always sink to
  // the bottom regardless of direction.
  const numAsc = (get) => (a, b) => nullLast(get(a), get(b), (x, y) => x - y);
  const numDesc = (get) => (a, b) => nullLast(get(a), get(b), (x, y) => y - x);
  function nullLast(a, b, cmp) {
    const an = a == null, bn = b == null;
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    return cmp(a, b);
  }
  // A `metric` carries the accessor + formatter for a numeric sort. When such a
  // sort is active the card surfaces that value (see sortBadge) so the ordering
  // is legible even for specs not normally shown on the card.
  const numSort = (id, label, dir, metric) => ({
    id,
    label,
    metric,
    cmp: (dir === 'asc' ? numAsc : numDesc)(metric.get)
  });
  const SORTS = [
    { id: 'name', label: 'Name (A–Z)', cmp: (a, b) => a.name.localeCompare(b.name) },
    { id: 'price-asc', label: 'Price (low → high)', cmp: numAsc((d) => d.price?.amount) },
    { id: 'price-desc', label: 'Price (high → low)', cmp: numDesc((d) => d.price?.amount) },
    { id: 'firmwares', label: 'Most firmwares', cmp: numDesc((d) => d.firmwareCount) },
    { id: 'mcu', label: 'MCU', cmp: (a, b) => deviceMcuLabel(a).localeCompare(deviceMcuLabel(b)) || a.name.localeCompare(b.name) },
    numSort('battery', 'Battery (large → small)', 'desc', {
      label: 'Battery', get: (d) => d.hardware?.power?.batteryCapacityMah, fmt: (v) => `${v} mAh`
    }),
    numSort('solar', 'Solar wattage (high → low)', 'desc', {
      label: 'Solar', get: (d) => d.hardware?.power?.solarPanelWatts, fmt: (v) => `${v} W`
    }),
    numSort('idle', 'Power draw, idle (low → high)', 'asc', {
      label: 'Idle', get: (d) => d.hardware?.power?.consumptionIdleMa, fmt: (v) => `${v} mA`
    }),
    numSort('tx', 'Power draw, TX (low → high)', 'asc', {
      label: 'TX draw', get: (d) => d.hardware?.power?.consumptionTxMa, fmt: (v) => `${v} mA`
    })
  ];
  let sel = $state(Object.fromEntries(FACETS.map((f) => [f.id, csv(f.id)])));
  let toggles = $state(
    Object.fromEntries(TOGGLES.map((t) => [t.id, csv('has').includes(t.id)]))
  );
  let ranges = $state(
    Object.fromEntries(
      RANGES.map((r) => {
        const [min = '', max = ''] = (initParams.get(r.id) ?? '').split(',');
        return [r.id, { min, max }];
      })
    )
  );

  function toggleFacet(id, value) {
    const cur = sel[id];
    sel[id] = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  }

  const numSet = (v) => v !== '' && v != null && !Number.isNaN(Number(v));
  const rangeActive = (r) => numSet(ranges[r.id].min) || numSet(ranges[r.id].max);

  let activeCount = $derived(
    FACETS.reduce((n, f) => n + sel[f.id].length, 0) +
      TOGGLES.reduce((n, t) => n + (toggles[t.id] ? 1 : 0), 0) +
      RANGES.reduce((n, r) => n + (rangeActive(r) ? 1 : 0), 0)
  );

  // Whether any advanced control is in use — keeps the section open on reload
  // if it carries active filters, and flags it when collapsed.
  let advancedActive = $derived(
    FACETS.some((f) => !f.primary && sel[f.id].length) ||
      TOGGLES.some((t) => !t.primary && toggles[t.id]) ||
      RANGES.some((r) => rangeActive(r))
  );

  function clearAll() {
    query = '';
    sel = Object.fromEntries(FACETS.map((f) => [f.id, []]));
    toggles = Object.fromEntries(TOGGLES.map((t) => [t.id, false]));
    ranges = Object.fromEntries(RANGES.map((r) => [r.id, { min: '', max: '' }]));
  }

  let filtered = $derived(
    data.devices.filter((d) => {
      if (query.trim() && !deviceSearchText(d).includes(query.toLowerCase())) return false;
      for (const f of FACETS) {
        const s = sel[f.id];
        if (s.length && !f.get(d).some((v) => s.includes(v))) return false;
      }
      for (const t of TOGGLES) if (toggles[t.id] && !t.test(d)) return false;
      for (const r of RANGES) {
        if (!rangeActive(r)) continue;
        const v = rangeVal(d, r);
        if (v == null) return false;
        if (numSet(ranges[r.id].min) && v < Number(ranges[r.id].min)) return false;
        if (numSet(ranges[r.id].max) && v > Number(ranges[r.id].max)) return false;
      }
      return true;
    })
  );

  let activeSort = $derived(SORTS.find((s) => s.id === sort) ?? SORTS[0]);
  let sorted = $derived([...filtered].sort(activeSort.cmp));
  let favoriteDevices = $derived($favoriteIds.map((id) => data.devices.find((d) => d.id === id)).filter(Boolean));

  // When a metric sort is active, the value to surface on each card (or null).
  function sortBadge(d) {
    const m = activeSort.metric;
    if (!m) return null;
    const v = m.get(d);
    return v == null ? null : `${m.label}: ${m.fmt(v)}`;
  }

  const primaryFacets = FACETS.filter((f) => f.primary);
  const advancedFacets = FACETS.filter((f) => !f.primary);
  const primaryToggles = TOGGLES.filter((t) => t.primary);
  const advancedToggles = TOGGLES.filter((t) => !t.primary);

  const chipBase =
    'rounded-full border px-2.5 py-1 text-[0.8rem] transition cursor-pointer select-none';
  const chipOn = 'border-accent bg-accent/15 text-accent';
  const chipOff = 'border-edge bg-elev text-dim hover:border-accent/60 hover:text-ink';
  const rowLabel = 'w-14 shrink-0 pt-1 text-[0.7rem] tracking-wide text-dim uppercase';

  // Reflect the active filters into the query string so a filtered view is
  // shareable. Native history.replaceState keeps it a pure URL-bar update — no
  // navigation, no scroll, no history entries, and no dependence on the router.
  $effect(() => {
    if (!browser) return;
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    for (const f of FACETS) if (sel[f.id].length) p.set(f.id, sel[f.id].join(','));
    const has = TOGGLES.filter((t) => toggles[t.id]).map((t) => t.id);
    if (has.length) p.set('has', has.join(','));
    for (const r of RANGES)
      if (rangeActive(r)) p.set(r.id, `${ranges[r.id].min},${ranges[r.id].max}`);
    if (advanced) p.set('adv', '1');
    if (sort !== 'name') p.set('sort', sort);
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  });
</script>

<Seo
  title="Devices"
  description={`Browse ${data.devices.length} LoRa devices known to run MeshCore — filter by MCU, radio, node role, connectivity, price and more.`}
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Devices</h1>
<p class="mb-4 text-dim">Hardware known to run one or more MeshCore firmwares.</p>

{#if favoriteDevices.length}
  <section class="mb-4 rounded-xl border border-accent/35 bg-accent/10 p-4">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-[0.95rem] font-semibold">Favourite Devices</h2>
      <a
        class="text-[0.8rem] text-accent2 hover:underline"
        href="{base}/compare/?ids={favoriteDevices.map((d) => d.id).join(',')}"
        onclick={() => compareIds.set(favoriteDevices.map((d) => d.id))}
      >
        Compare favourites →
      </a>
    </div>
    <div class="flex gap-2 overflow-x-auto pb-1">
      {#each favoriteDevices as fav (fav.id)}
        <a
          class="group flex min-w-[210px] items-center gap-2 rounded-lg border border-edge bg-elev p-2 transition hover:border-accent"
          href="{base}/device/{fav.id}/"
        >
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-elev2 p-1 text-muted">
            {#if fav.imageUrl}
              <img src={fav.imageUrl} alt="" class="max-h-full max-w-full object-contain" />
            {:else}
              <span class="font-mono text-[0.55rem]">{deviceMcuLabel(fav)}</span>
            {/if}
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[0.85rem] font-medium group-hover:text-accent">{fav.name}</span>
            <span class="block truncate text-[0.72rem] text-dim">{deviceMcuLabel(fav)}</span>
          </span>
        </a>
      {/each}
    </div>
  </section>
{/if}

<input
  type="search"
  placeholder="Search devices, vendor, MCU, radio…"
  bind:value={query}
  class="w-full rounded-lg border border-edge bg-elev px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
/>

<!-- Faceted filters -->
<div class="mt-4 space-y-3 rounded-xl border border-edge bg-elev p-4">
  {#each primaryFacets as f (f.id)}
    {#if facetOptions[f.id].length}
      <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span class={rowLabel}>{f.label}</span>
        <div class="flex flex-1 flex-wrap gap-1.5">
          {#each facetOptions[f.id] as [value, count] (value)}
            <button class="{chipBase} {sel[f.id].includes(value) ? chipOn : chipOff}" onclick={() => toggleFacet(f.id, value)}>
              {f.fmt ? f.fmt(value) : value} <span class="opacity-60">{count}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/each}

  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
    <span class={rowLabel}>Has</span>
    <div class="flex flex-1 flex-wrap gap-1.5">
      {#each primaryToggles as t (t.id)}
        <button class="{chipBase} {toggles[t.id] ? chipOn : chipOff}" onclick={() => (toggles[t.id] = !toggles[t.id])}>{t.label}</button>
      {/each}
    </div>
  </div>

  <!-- Advanced section -->
  <div class="border-t border-edge pt-3">
    <button
      class="flex items-center gap-1.5 text-[0.8rem] font-medium text-dim hover:text-ink"
      onclick={() => (advanced = !advanced)}
      aria-expanded={advanced}
    >
      <span class="inline-block transition-transform {advanced ? 'rotate-90' : ''}">▸</span>
      Advanced filters
      {#if advancedActive && !advanced}
        <span class="rounded-full bg-accent/15 px-1.5 text-[0.7rem] text-accent">active</span>
      {/if}
    </button>

    {#if advanced}
      <div class="mt-3 space-y-3">
        {#each advancedFacets as f (f.id)}
          {#if facetOptions[f.id].length}
            <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span class={rowLabel}>{f.label}</span>
              <div class="flex flex-1 flex-wrap gap-1.5">
                {#each facetOptions[f.id] as [value, count] (value)}
                  <button class="{chipBase} {sel[f.id].includes(value) ? chipOn : chipOff}" onclick={() => toggleFacet(f.id, value)}>
                    {f.fmt ? f.fmt(value) : value} <span class="opacity-60">{count}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/each}

        <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
          <span class={rowLabel}>Has</span>
          <div class="flex flex-1 flex-wrap gap-1.5">
            {#each advancedToggles as t (t.id)}
              <button class="{chipBase} {toggles[t.id] ? chipOn : chipOff}" onclick={() => (toggles[t.id] = !toggles[t.id])}>{t.label}</button>
            {/each}
          </div>
        </div>

        <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
          <span class={rowLabel}>Range</span>
          <div class="flex flex-1 flex-wrap gap-2">
            {#each RANGES as r (r.id)}
              <div class="flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.8rem] {rangeActive(r) ? 'border-accent/60' : 'border-edge'}">
                <span class="text-dim">{r.label}</span>
                <input
                  type="number"
                  inputmode="numeric"
                  placeholder="min"
                  bind:value={ranges[r.id].min}
                  class="w-12 bg-transparent text-right outline-none placeholder:text-dim/50"
                />
                <span class="text-dim">–</span>
                <input
                  type="number"
                  inputmode="numeric"
                  placeholder="max"
                  bind:value={ranges[r.id].max}
                  class="w-12 bg-transparent text-right outline-none placeholder:text-dim/50"
                />
                <span class="text-[0.7rem] text-dim">{r.unit}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<div class="my-3 flex items-center gap-3 text-[0.85rem] text-dim">
  <span>{filtered.length} device{filtered.length === 1 ? '' : 's'}</span>
  {#if activeCount}
    <button class="text-accent2 hover:underline" onclick={clearAll}>Clear filters ({activeCount})</button>
  {/if}
  <label class="ml-auto flex items-center gap-1.5">
    <span class="text-dim">Sort</span>
    <select
      bind:value={sort}
      class="rounded-lg border border-edge bg-elev px-2 py-1 text-ink outline-none focus:border-accent"
    >
      {#each SORTS as s (s.id)}
        <option value={s.id}>{s.label}</option>
      {/each}
    </select>
  </label>
</div>

{#if filtered.length}
  <div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
    {#each sorted as d (d.id)}
      <a
        class="group flex flex-col rounded-xl border border-edge bg-elev p-3 transition hover:-translate-y-0.5 hover:border-accent"
        href="{base}/device/{d.id}/"
      >
        <div class="relative mb-3 flex h-[120px] items-center justify-center overflow-hidden rounded-lg bg-elev2">
          {#if d.imageUrl}
            <img src={d.imageUrl} alt={d.name} loading="lazy" class="max-h-full max-w-full object-contain p-3 transition group-hover:scale-105" />
          {:else}
            <span class="font-mono text-[0.8rem] text-dim">{deviceMcuLabel(d)}</span>
          {/if}
          {#if !d.official}
            <span class="absolute right-2 bottom-2 rounded bg-accent2/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide text-accent2 uppercase">Community</span>
          {/if}
          <button
            type="button"
            aria-label="Compare {d.name}"
            aria-pressed={$compareIds.includes(d.id)}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleCompare(d.id);
            }}
            class="absolute top-2 left-2 flex h-6 items-center gap-1 rounded-md border px-1.5 text-[0.68rem] font-medium transition {$compareIds.includes(
              d.id
            )
              ? 'border-accent bg-accent text-bg'
              : 'border-edge bg-elev/80 text-dim opacity-0 group-hover:opacity-100 hover:text-ink'}"
          >
            {$compareIds.includes(d.id) ? '✓ Compare' : '+ Compare'}
          </button>
          <button
            type="button"
            aria-label="Toggle favourite for {d.name}"
            title={$favoriteIds.includes(d.id) ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={$favoriteIds.includes(d.id)}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleFavorite(d.id);
            }}
            class="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md border text-[0.95rem] leading-none transition {$favoriteIds.includes(
              d.id
            )
              ? 'border-accent bg-accent text-bg'
              : 'border-edge bg-elev/80 text-dim opacity-0 group-hover:opacity-100 hover:text-ink'}"
          >
            {$favoriteIds.includes(d.id) ? '★' : '☆'}
          </button>
        </div>

        <div class="px-1">
          <h2 class="text-[1.02rem] leading-tight font-semibold">{d.name}</h2>
          {#if d.vendorName}<span class="text-[0.8rem] text-dim">{d.vendorName}</span>{/if}

          <div class="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[0.8rem] text-dim">
            <span class="text-ink">{deviceMcuLabel(d)}</span>
            {#if radioShort(d)}<span class="text-edge">·</span><span>{radioShort(d)}</span>{/if}
          </div>
        </div>

        <!-- Pills + footer pinned to the card bottom; the gap above grows so
             cards in a row keep their footers aligned regardless of content. -->
        <div class="mt-auto">
          {#if sortBadge(d) || featurePills(d).length}
            <div class="flex flex-wrap gap-1 px-1 pt-2.5">
              {#if sortBadge(d)}
                <span class="rounded-full border border-accent bg-accent/20 px-2 py-0.5 text-[0.7rem] font-medium text-accent">{sortBadge(d)}</span>
              {/if}
              {#each featurePills(d) as pill}
                <span class="rounded-full border px-2 py-0.5 text-[0.7rem] {pill.accent ? 'border-accent/40 bg-accent/10 text-accent' : 'border-edge bg-elev2 text-dim'}">{pill.label}</span>
              {/each}
            </div>
          {/if}

          <div class="mt-2.5 flex items-center justify-between border-t border-edge px-1 pt-2.5 text-[0.78rem] text-dim">
          <span>{d.firmwareCount} firmware{d.firmwareCount === 1 ? '' : 's'}</span>
          {#if devicePriceLabel(d)}
            <span class="font-semibold text-ink">{devicePriceLabel(d)}</span>
          {:else}
            <span class="text-accent opacity-0 transition group-hover:opacity-100">View →</span>
          {/if}
          </div>
        </div>
      </a>
    {/each}
  </div>
{:else}
  <p class="rounded-xl border border-edge bg-elev p-8 text-center text-dim">No devices match these filters.</p>
{/if}

{#if $compareIds.length}
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
    <div class="pointer-events-auto flex items-center gap-3 rounded-full border border-edge bg-elev2 py-2 pr-2 pl-4 shadow-2xl">
      <span class="text-[0.85rem] text-dim">
        <span class="font-semibold text-ink">{$compareIds.length}</span> selected
      </span>
      <button class="text-[0.85rem] text-dim hover:text-ink" onclick={clearCompare}>Clear</button>
      <a
        class="rounded-full bg-accent px-4 py-1.5 text-[0.85rem] font-semibold text-bg hover:opacity-90"
        href="{base}/compare/?ids={$compareIds.join(',')}"
      >
        Compare →
      </a>
    </div>
  </div>
{/if}
