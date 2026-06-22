<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { deviceRadioLabel, devicePriceLabel, resolveMcuInfo, resolveRadio, resolveGnss, stripVendorLabel, bandLabel } from '$lib/data.js';
  import { compareIds } from '$lib/compare.js';
  import Seo from '$lib/Seo.svelte';
  import Button from '$lib/Button.svelte';

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

  // --- Column reordering (drag a header) -------------------------------------
  // The first column is the reference all differences are measured against, so
  // dragging a board to the front re-bases the comparison.
  let dragIndex = $state(null);
  function reorder(from, to) {
    if (from == null || from === to) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setIds(next);
  }

  // --- Value helpers ---------------------------------------------------------
  const DASH = '—';
  const txt = (v) => (v === undefined || v === null || v === '' || v === 'unknown' ? DASH : String(v));
  const yn = (v) => (v === true ? 'Yes' : v === false ? 'No' : DASH);

  const BATTERY_CHEMISTRY = {
    'li-po': 'LiPo',
    'li-ion': 'Li-ion',
    lifepo4: 'LiFePO₄',
    lto: 'LTO',
    nimh: 'NiMH',
    alkaline: 'Alkaline',
    other: 'Other'
  };

  function ledsText(d) {
    const l = d.hardware?.leds;
    if (l?.status === 'present') return l.description || 'Yes';
    if (l?.status === 'none') return 'No';
    return DASH;
  }

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
    {
      label: 'MCU family',
      get: (d) => txt(resolveMcuInfo(d)?.family?.name),
      href: (d) => resolveMcuInfo(d)?.family?.url ?? null
    },
    {
      label: 'MCU model',
      get: (d) => {
        const m = resolveMcuInfo(d)?.model;
        return txt(m ? stripVendorLabel(m, m.name) : d.hardware?.mcu?.model);
      },
      href: (d) => resolveMcuInfo(d)?.model?.url ?? null
    },
    {
      label: 'Architecture',
      get: (d) => txt(resolveMcuInfo(d)?.architecture?.name),
      href: (d) => resolveMcuInfo(d)?.architecture?.url ?? null
    },
    {
      label: 'Flash',
      get: (d) => (d.hardware?.mcu?.flashMb ? `${d.hardware.mcu.flashMb} MB` : DASH),
      num: (d) => d.hardware?.mcu?.flashMb ?? null,
      unit: ' MB'
    },
    {
      label: 'RAM',
      get: (d) => (d.hardware?.mcu?.ramKb ? `${d.hardware.mcu.ramKb} KB` : DASH),
      num: (d) => d.hardware?.mcu?.ramKb ?? null,
      unit: ' KB'
    },
    {
      label: 'PSRAM',
      get: (d) => (d.hardware?.mcu?.psramMb ? `${d.hardware.mcu.psramMb} MB` : DASH),
      num: (d) => d.hardware?.mcu?.psramMb ?? null,
      unit: ' MB'
    },
    {
      label: 'Radio',
      get: (d) => txt(deviceRadioLabel(d)),
      href: (d) => resolveRadio(d.hardware?.radios?.[0]?.chip)?.url ?? null
    },
    {
      label: 'Frequency',
      get: (d) => [...new Set((d.hardware?.radios ?? []).flatMap((r) => r.bands ?? []))].map((b) => bandLabel(b) ?? b).join(', ') || DASH
    },
    {
      label: 'Display',
      get: displayText,
      num: (d) => (d.hardware?.display?.status === 'present' ? d.hardware.display.size ?? null : null),
      unit: '″'
    },
    { label: 'LEDs', get: ledsText },
    {
      label: 'GPS',
      get: (d) =>
        d.hardware?.gnss?.status === 'present'
          ? resolveGnss(d.hardware.gnss.chip)?.name ?? d.hardware.gnss.chip ?? 'Yes'
          : d.hardware?.gnss?.status === 'none'
            ? 'No'
            : DASH,
      href: (d) =>
        d.hardware?.gnss?.status === 'present' ? resolveGnss(d.hardware.gnss.chip)?.url ?? null : null
    },
    {
      label: 'Battery',
      get: batteryText,
      num: (d) => d.hardware?.power?.batteryCapacityMah ?? null,
      unit: ' mAh'
    },
    { label: 'Chemistry', get: (d) => BATTERY_CHEMISTRY[d.hardware?.power?.batteryChemistry] ?? DASH },
    { label: 'Built-in battery', get: (d) => yn(d.hardware?.power?.batteryBuiltIn) },
    { label: 'Charging', get: (d) => yn(d.hardware?.power?.charging) },
    { label: 'Solar panel', get: solarPanelText },
    { label: 'Solar input', get: (d) => yn(d.hardware?.power?.solarInput) },
    {
      label: 'Power draw (idle)',
      get: (d) => (d.hardware?.power?.consumptionIdleMa != null ? `${d.hardware.power.consumptionIdleMa} mA` : DASH),
      num: (d) => d.hardware?.power?.consumptionIdleMa ?? null,
      unit: ' mA'
    },
    {
      label: 'Power draw (TX)',
      get: (d) => (d.hardware?.power?.consumptionTxMa != null ? `${d.hardware.power.consumptionTxMa} mA` : DASH),
      num: (d) => d.hardware?.power?.consumptionTxMa ?? null,
      unit: ' mA'
    },
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
  // Numeric rows (those with `num`) also carry a per-cell delta vs the smallest
  // value, so bigger specs read as "+N" against the baseline.
  let rows = $derived(
    ROWS.map((r) => {
      const values = selected.map((d) => r.get(d));
      const differs = new Set(values).size > 1;
      // Outbound catalog links (globals.yaml urls), per cell, when the row's
      // value resolves to a part with a datasheet/vendor page.
      const hrefs = r.href ? selected.map((d) => r.href(d)) : null;
      // Differences are shown as a percentage relative to the first column
      // (the reference).
      let deltas = null;
      if (r.num) {
        const nums = selected.map((d) => r.num(d));
        const ref = nums[0];
        if (typeof ref === 'number' && ref !== 0) {
          deltas = nums.map((n, i) =>
            i > 0 && typeof n === 'number' && n !== ref
              ? { pct: Math.round(((n - ref) / ref) * 100) }
              : null
          );
        }
      }
      return { label: r.label, values, differs, deltas, unit: r.unit, hrefs };
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
    <table class="w-full table-fixed border-collapse text-[0.88rem]" style="min-width: {160 + selected.length * 200}px">
      <thead>
        <tr>
          <th class="sticky left-0 z-10 w-40 min-w-40 border-b border-edge bg-elev p-3 text-left align-bottom"></th>
          {#each selected as d, i (d.id)}
            <th
              class="border-b border-l border-edge bg-elev p-3 text-left align-top transition-opacity {dragIndex === i ? 'opacity-40' : ''}"
              draggable="true"
              ondragstart={() => (dragIndex = i)}
              ondragend={() => (dragIndex = null)}
              ondragover={(e) => e.preventDefault()}
              ondrop={(e) => { e.preventDefault(); reorder(dragIndex, i); dragIndex = null; }}
            >
              <div class="flex items-start justify-between gap-2">
                <span class="mt-0.5 shrink-0 cursor-grab text-dim active:cursor-grabbing" title="Drag to reorder" aria-hidden="true">⠿</span>
                <a href="{base}/device/{d.id}/" draggable="false" class="group block min-w-0 flex-1">
                  <span class="mb-2 flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-elev2 text-muted">
                    {#if d.imageUrl}
                      <img src={d.imageUrl} alt={d.name} draggable="false" class="max-h-full max-w-full object-contain p-1" />
                    {:else}
                      <svg aria-hidden="true" viewBox="0 0 24 24" class="h-7 w-7">
                        <rect x="7" y="4" width="10" height="16" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
                        <path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                      </svg>
                    {/if}
                  </span>
                  <span class="block text-[0.95rem] font-semibold group-hover:text-accent">{d.name}</span>
                  {#if d.vendorName}<span class="block text-[0.78rem] font-normal text-dim">{d.vendorName}</span>{/if}
                  {#if i === 0}<span class="mt-1 inline-block rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide text-accent uppercase">Reference</span>{/if}
                </a>
                <Button
                  variant=""
                  size="none"
                  class="shrink-0 rounded p-1 text-dim hover:bg-elev2 hover:text-bad"
                  aria-label="Remove {d.name}"
                  onclick={() => remove(d.id)}>✕</Button>
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
            {#each row.values as v, i}
              <td class="border-b border-l border-edge p-3 align-top transition-opacity {v === DASH ? 'text-dim' : ''} {dragIndex === i ? 'opacity-40' : ''}">
                {#if v === 'Yes'}
                  <span class="inline-flex items-center gap-1.5 text-ok">
                    <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>Yes
                  </span>
                {:else if v === 'No'}
                  <span class="inline-flex items-center gap-1.5 text-bad">
                    <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                      <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>No
                  </span>
                {:else if row.hrefs?.[i] && v !== DASH}
                  <a href={row.hrefs[i]} target="_blank" rel="noreferrer" class="underline decoration-dotted decoration-edge underline-offset-2 hover:decoration-dim">{v}<span class="ml-0.5 no-underline opacity-50">↗</span></a>
                {:else}
                  {v}{#if row.deltas?.[i] && row.deltas[i].pct !== 0}<span class="ml-1.5 text-[0.78rem] opacity-60">({row.deltas[i].pct > 0 ? '+' : '−'}{Math.abs(row.deltas[i].pct)}%)</span>{/if}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
