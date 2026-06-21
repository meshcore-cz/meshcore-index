<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { deviceRadioLabel, devicePriceLabel, resolveMcuInfo, resolveGnss } from '$lib/data.js';
  import { compareIds } from '$lib/compare.js';
  import Seo from '$lib/Seo.svelte';

  let { data } = $props();
  let byId = $derived(new Map(data.devices.map((d) => [d.id, d])));

  // Selected ids come from the URL (sharable); the store is kept in sync.
  // searchParams isn't available during static prerender, so only read it in the
  // browser (the page hydrates with the real query on the client).
  let ids = $derived(
    browser ? ($page.url.searchParams.get('ids') ?? '').split(',').filter(Boolean) : []
  );
  let selected = $derived(ids.map((id) => byId.get(id)).filter(Boolean));

  let onlyDiff = $state(false);

  $effect(() => {
    compareIds.set(ids);
  });

  function setIds(next) {
    const qs = next.length ? `?ids=${next.join(',')}` : '';
    goto(`${base}/compare/${qs}`, { replaceState: true, keepFocus: true, noScroll: true });
  }
  const remove = (id) => setIds(ids.filter((x) => x !== id));

  // --- Value helpers ---------------------------------------------------------
  const DASH = '—';
  const txt = (v) => (v === undefined || v === null || v === '' || v === 'unknown' ? DASH : String(v));
  const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : DASH);

  function displayText(d) {
    const dp = d.hardware?.display;
    if (dp?.status !== 'present') return dp?.status === 'none' ? 'None' : DASH;
    const parts = [];
    if (dp.technology && dp.technology !== 'unknown') parts.push(dp.technology.toUpperCase());
    if (dp.size) parts.push(`${dp.size}″`);
    if (dp.resolution?.width) parts.push(`${dp.resolution.width}×${dp.resolution.height}`);
    return parts.join(' · ') || 'Yes';
  }

  function batteryText(d) {
    const pw = d.hardware?.power;
    if (pw?.batteryCapacityMah) return `${pw.batteryCapacityMah} mAh`;
    if (pw?.batterySupported === true) return 'Supported';
    if (pw?.batterySupported === false) return 'None';
    return DASH;
  }

  function solarPanelText(d) {
    const pw = d.hardware?.power;
    if (pw?.solarPanelBuiltIn !== true) return DASH;
    return pw.solarPanelWatts ? `Built-in · ${pw.solarPanelWatts} W` : 'Built-in';
  }

  const ROWS = [
    { label: 'Price', get: (d) => devicePriceLabel(d) ?? DASH },
    { label: 'Vendor', get: (d) => txt(d.vendorName) },
    { label: 'MCU family', get: (d) => txt(resolveMcuInfo(d)?.family?.name) },
    { label: 'MCU model', get: (d) => txt(resolveMcuInfo(d)?.model?.name ?? d.hardware?.mcu?.model) },
    { label: 'Architecture', get: (d) => txt(resolveMcuInfo(d)?.architecture?.name) },
    { label: 'Flash', get: (d) => (d.hardware?.mcu?.flashMb ? `${d.hardware.mcu.flashMb} MB` : DASH) },
    { label: 'PSRAM', get: (d) => (d.hardware?.mcu?.psramMb ? `${d.hardware.mcu.psramMb} MB` : DASH) },
    { label: 'Radio', get: (d) => txt(deviceRadioLabel(d)) },
    {
      label: 'Frequency',
      get: (d) => (d.hardware?.radios ?? []).flatMap((r) => r.frequencyVariants ?? []).join(', ') || DASH
    },
    { label: 'Display', get: displayText },
    {
      label: 'GPS',
      get: (d) =>
        d.hardware?.gnss?.status === 'present'
          ? resolveGnss(d.hardware.gnss.chip)?.name ?? d.hardware.gnss.chip ?? 'Yes'
          : d.hardware?.gnss?.status === 'none'
            ? 'No'
            : DASH
    },
    { label: 'Battery', get: batteryText },
    { label: 'Built-in battery', get: (d) => yn(d.hardware?.power?.batteryBuiltIn) },
    { label: 'Charging', get: (d) => yn(d.hardware?.power?.charging) },
    { label: 'Solar panel', get: solarPanelText },
    { label: 'Solar input', get: (d) => yn(d.hardware?.power?.solarInput) },
    { label: 'USB', get: (d) => txt(d.interfaces?.usb?.connector) },
    {
      label: 'Bluetooth',
      get: (d) =>
        d.interfaces?.bluetooth?.ble
          ? `BLE${d.interfaces.bluetooth.version && d.interfaces.bluetooth.version !== 'unknown' ? ` ${d.interfaces.bluetooth.version}` : ''}`
          : DASH
    },
    {
      label: 'Wi-Fi',
      get: (d) =>
        d.interfaces?.wifi?.status === 'present' ? 'Yes' : d.interfaces?.wifi?.status === 'none' ? 'No' : DASH
    },
    { label: 'Roles', get: (d) => (d.roles ?? []).join(', ') || DASH },
    { label: 'Transports', get: (d) => (d.transports ?? []).map((t) => t.toUpperCase()).join(', ') || DASH },
    { label: 'Firmwares', get: (d) => String(d.firmwareCount) }
  ];

  // Precompute each row's values + whether they differ across the selection.
  let rows = $derived(
    ROWS.map((r) => {
      const values = selected.map((d) => r.get(d));
      const differs = new Set(values).size > 1;
      return { label: r.label, values, differs };
    }).filter((r) => !onlyDiff || r.differs)
  );
</script>

<Seo
  title="Compare devices"
  description="Compare MeshCore LoRa devices side by side — MCU, radio, display, power and more."
  noindex
/>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">Compare devices</h1>
    <p class="text-dim">{selected.length} device{selected.length === 1 ? '' : 's'} selected.</p>
  </div>
  <a class="text-[0.9rem] text-accent2 hover:underline" href="{base}/devices/">+ Add devices</a>
</div>

{#if selected.length === 0}
  <p class="rounded-xl border border-edge bg-elev p-10 text-center text-dim">
    No devices selected. Go to <a class="text-accent2 hover:underline" href="{base}/devices/">Devices</a> and tick the
    compare boxes to line boards up side by side.
  </p>
{:else}
  <label class="mb-3 inline-flex cursor-pointer items-center gap-2 text-[0.85rem] text-dim select-none">
    <input type="checkbox" bind:checked={onlyDiff} class="accent-accent" />
    Show only differences
  </label>

  <div class="overflow-x-auto rounded-xl border border-edge">
    <table class="w-full border-collapse text-[0.88rem]">
      <thead>
        <tr>
          <th class="sticky left-0 z-10 w-40 min-w-40 border-b border-edge bg-elev p-3 text-left align-bottom"></th>
          {#each selected as d (d.id)}
            <th class="min-w-[180px] border-b border-l border-edge bg-elev p-3 text-left align-top">
              <div class="flex items-start justify-between gap-2">
                <a href="{base}/device/{d.id}/" class="group block">
                  <span class="mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-elev2">
                    {#if d.imageUrl}<img src={d.imageUrl} alt={d.name} class="max-h-full max-w-full object-contain p-1" />{/if}
                  </span>
                  <span class="block text-[0.95rem] font-semibold group-hover:text-accent">{d.name}</span>
                  {#if d.vendorName}<span class="block text-[0.78rem] font-normal text-dim">{d.vendorName}</span>{/if}
                </a>
                <button
                  class="shrink-0 rounded p-1 text-dim hover:bg-elev2 hover:text-bad"
                  aria-label="Remove {d.name}"
                  onclick={() => remove(d.id)}>✕</button>
              </div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.label)}
          <tr class={row.differs ? 'bg-accent/5' : ''}>
            <th class="sticky left-0 z-10 border-b border-edge bg-elev p-3 text-left text-[0.78rem] font-medium tracking-wide text-dim uppercase">
              {row.label}
            </th>
            {#each row.values as v}
              <td class="border-b border-l border-edge p-3 align-top {v === DASH ? 'text-dim' : ''}">{v}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
