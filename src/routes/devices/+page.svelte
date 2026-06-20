<script>
  import { base } from '$app/paths';
  import {
    deviceMcuLabel,
    deviceSearchText,
    resolveMcuInfo,
    resolveRadio,
    resolveDisplay
  } from '$lib/data.js';
  let { data } = $props();

  // --- Per-device accessors used by both facets and filtering -----------------
  const deviceFamily = (d) => resolveMcuInfo(d)?.family?.name ?? deviceMcuLabel(d);
  // Compact radio label for the card (chip short name, not the long vendor one).
  const radioShort = (d) => {
    const chip = (d.hardware?.radios ?? []).map((r) => r.chip).find((c) => c && c !== 'unknown');
    return chip ? (resolveRadio(chip)?.name ?? chip) : null;
  };

  // Capability pills shown on each card, in priority order. Only present
  // capabilities render, so cards stay clean for sparsely-documented boards.
  function featurePills(d) {
    const out = [];
    const pw = d.hardware?.power;
    if (d.hardware?.gnss?.status === 'present') out.push({ label: 'GPS' });
    if (d.hardware?.display?.status === 'present')
      out.push({ label: resolveDisplay(d.hardware.display.technology)?.name ?? 'Display' });
    if (pw?.batteryCapacityMah) out.push({ label: `${pw.batteryCapacityMah} mAh`, accent: true });
    else if (pw?.batterySupported === true) out.push({ label: 'Battery' });
    // Only a built-in solar panel is a notable feature — solar *input* (the
    // ability to attach a panel) is an option, not shown here.
    if (pw?.solarPanelBuiltIn) out.push({ label: pw.solarPanelWatts ? `Solar ${pw.solarPanelWatts}W` : 'Solar', accent: true });
    return out;
  }
  const deviceChips = (d) =>
    (d.hardware?.radios ?? []).map((r) => r.chip).filter((c) => c && c !== 'unknown');
  const hasGps = (d) => d.hardware?.gnss?.status === 'present';
  const hasDisplay = (d) => d.hardware?.display?.status === 'present';
  const hasBattery = (d) => d.hardware?.power?.batterySupported === true;

  // Tally distinct values → [value, count], most common first.
  function tally(values) {
    const m = new Map();
    for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  let mcuOptions = $derived(tally(data.devices.map(deviceFamily)));
  let radioOptions = $derived(tally(data.devices.flatMap(deviceChips)));
  let roleOptions = $derived(tally(data.devices.flatMap((d) => d.roles ?? [])));

  // --- Filter state ----------------------------------------------------------
  let query = $state('');
  let selMcu = $state([]);
  let selRadio = $state([]);
  let selRoles = $state([]);
  let gpsOnly = $state(false);
  let displayOnly = $state(false);
  let batteryOnly = $state(false);
  let solarPanelOnly = $state(false);
  let solarInputOnly = $state(false);

  // Toggle a value in one of the array-backed facets (reassign for reactivity).
  function toggle(arr, value) {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  let activeCount = $derived(
    selMcu.length +
      selRadio.length +
      selRoles.length +
      (gpsOnly ? 1 : 0) +
      (displayOnly ? 1 : 0) +
      (batteryOnly ? 1 : 0) +
      (solarPanelOnly ? 1 : 0) +
      (solarInputOnly ? 1 : 0)
  );

  function clearAll() {
    query = '';
    selMcu = [];
    selRadio = [];
    selRoles = [];
    gpsOnly = displayOnly = batteryOnly = solarPanelOnly = solarInputOnly = false;
  }

  let filtered = $derived(
    data.devices.filter((d) => {
      if (query.trim() && !deviceSearchText(d).includes(query.toLowerCase())) return false;
      if (selMcu.length && !selMcu.includes(deviceFamily(d))) return false;
      if (selRadio.length && !deviceChips(d).some((c) => selRadio.includes(c))) return false;
      if (selRoles.length && !(d.roles ?? []).some((r) => selRoles.includes(r))) return false;
      if (gpsOnly && !hasGps(d)) return false;
      if (displayOnly && !hasDisplay(d)) return false;
      if (batteryOnly && !hasBattery(d)) return false;
      if (solarPanelOnly && d.hardware?.power?.solarPanelBuiltIn !== true) return false;
      if (solarInputOnly && d.hardware?.power?.solarInput !== true) return false;
      return true;
    })
  );

  const chipBase =
    'rounded-full border px-2.5 py-1 text-[0.8rem] transition cursor-pointer select-none';
  const chipOn = 'border-accent bg-accent/15 text-accent';
  const chipOff = 'border-edge bg-elev text-dim hover:border-accent/60 hover:text-ink';
</script>

<svelte:head><title>Devices — MeshCore Firmware Atlas</title></svelte:head>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Devices</h1>
<p class="mb-4 text-dim">Hardware known to run one or more MeshCore firmwares.</p>

<input
  type="search"
  placeholder="Search devices, vendor, MCU, radio…"
  bind:value={query}
  class="w-full rounded-lg border border-edge bg-elev px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
/>

<!-- Faceted filters -->
<div class="mt-4 space-y-3 rounded-xl border border-edge bg-elev p-4">
  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
    <span class="w-14 shrink-0 pt-1 text-[0.7rem] tracking-wide text-dim uppercase">MCU</span>
    <div class="flex flex-1 flex-wrap gap-1.5">
      {#each mcuOptions as [value, count]}
        <button class="{chipBase} {selMcu.includes(value) ? chipOn : chipOff}" onclick={() => (selMcu = toggle(selMcu, value))}>
          {value} <span class="opacity-60">{count}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
    <span class="w-14 shrink-0 pt-1 text-[0.7rem] tracking-wide text-dim uppercase">Radio</span>
    <div class="flex flex-1 flex-wrap gap-1.5">
      {#each radioOptions as [value, count]}
        <button class="{chipBase} {selRadio.includes(value) ? chipOn : chipOff}" onclick={() => (selRadio = toggle(selRadio, value))}>
          <span class="uppercase">{value}</span> <span class="opacity-60">{count}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
    <span class="w-14 shrink-0 pt-1 text-[0.7rem] tracking-wide text-dim uppercase">Roles</span>
    <div class="flex flex-1 flex-wrap gap-1.5">
      {#each roleOptions as [value, count]}
        <button class="{chipBase} {selRoles.includes(value) ? chipOn : chipOff}" onclick={() => (selRoles = toggle(selRoles, value))}>
          {value} <span class="opacity-60">{count}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
    <span class="w-14 shrink-0 pt-1 text-[0.7rem] tracking-wide text-dim uppercase">Has</span>
    <div class="flex flex-1 flex-wrap gap-1.5">
      <button class="{chipBase} {gpsOnly ? chipOn : chipOff}" onclick={() => (gpsOnly = !gpsOnly)}>GPS</button>
      <button class="{chipBase} {displayOnly ? chipOn : chipOff}" onclick={() => (displayOnly = !displayOnly)}>Display</button>
      <button class="{chipBase} {batteryOnly ? chipOn : chipOff}" onclick={() => (batteryOnly = !batteryOnly)}>Battery</button>
      <button class="{chipBase} {solarPanelOnly ? chipOn : chipOff}" onclick={() => (solarPanelOnly = !solarPanelOnly)}>Solar Panel</button>
      <button class="{chipBase} {solarInputOnly ? chipOn : chipOff}" onclick={() => (solarInputOnly = !solarInputOnly)}>Solar Input</button>
    </div>
  </div>
</div>

<div class="my-3 flex items-center gap-3 text-[0.85rem] text-dim">
  <span>{filtered.length} device{filtered.length === 1 ? '' : 's'}</span>
  {#if activeCount}
    <button class="text-accent2 hover:underline" onclick={clearAll}>Clear filters ({activeCount})</button>
  {/if}
</div>

{#if filtered.length}
  <div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
    {#each filtered as d (d.id)}
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
            <span class="absolute top-2 right-2 rounded bg-accent2/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide text-accent2 uppercase">Community</span>
          {/if}
        </div>

        <div class="px-1">
          <h2 class="text-[1.02rem] leading-tight font-semibold">{d.name}</h2>
          {#if d.vendorName}<span class="text-[0.8rem] text-dim">{d.vendorName}</span>{/if}

          <div class="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[0.8rem] text-dim">
            <span class="text-ink">{deviceMcuLabel(d)}</span>
            {#if radioShort(d)}<span class="text-edge">·</span><span>{radioShort(d)}</span>{/if}
          </div>

          {#if featurePills(d).length}
            <div class="mt-2.5 flex flex-wrap gap-1">
              {#each featurePills(d) as pill}
                <span class="rounded-full border px-2 py-0.5 text-[0.7rem] {pill.accent ? 'border-accent/40 bg-accent/10 text-accent' : 'border-edge bg-elev2 text-dim'}">{pill.label}</span>
              {/each}
            </div>
          {/if}
        </div>

        <div class="mt-3 flex items-center justify-between border-t border-edge px-1 pt-2.5 text-[0.78rem] text-dim">
          <span>{d.firmwareCount} firmware{d.firmwareCount === 1 ? '' : 's'}</span>
          <span class="text-accent opacity-0 transition group-hover:opacity-100">View →</span>
        </div>
      </a>
    {/each}
  </div>
{:else}
  <p class="rounded-xl border border-edge bg-elev p-8 text-center text-dim">No devices match these filters.</p>
{/if}
