<script>
  import { base } from '$app/paths';
  import {
    STATUS_META,
    TYPE_META,
    deviceMcuLabel,
    deviceRadioLabel,
    resolveMcuInfo,
    resolveRadio,
    resolveFrequency,
    resolveDisplay,
    resolveGnss
  } from '$lib/data.js';
  let { data } = $props();
  let d = $derived(data.device);

  // A value counts as "unknown" if it is missing, blank, or the literal "unknown".
  const known = (v) => v !== undefined && v !== null && v !== '' && v !== 'unknown';
  const titleCase = (s) =>
    String(s)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  function displayLabel(display) {
    if (display?.status === 'present') {
      return resolveDisplay(display.technology)?.name ?? titleCase(display.technology);
    }
    if (display?.status === 'none') return 'None';
    return 'Unknown';
  }

  function gnssLabel(gnss) {
    if (gnss?.status === 'present') {
      return resolveGnss(gnss.chip)?.name ?? gnss.chip ?? 'Yes';
    }
    if (gnss?.status === 'none') return 'None';
    return 'Unknown';
  }

  function batteryLabel(device) {
    const power = device.hardware?.power;
    if (power?.batteryCapacityMah) return `${power.batteryCapacityMah} mAh`;
    if (power?.batterySupported === true) {
      if (power.batteryBuiltIn === false) return 'External';
      return power.pmic ?? 'Supported';
    }
    if (power?.batterySupported === false) return 'None';
    return 'Unknown';
  }

  function interfaceLabel(device) {
    const out = [];
    if (device.interfaces?.usb) out.push('USB');
    if (device.interfaces?.bluetooth?.ble) out.push('BLE');
    if (device.interfaces?.wifi?.status === 'present') out.push('Wi-Fi');
    return out.join(', ');
  }

  // Keep only rows whose value is actually known, so cards never show "unknown".
  const rows = (entries) => entries.filter((r) => known(r.value));

  // --- Headline specs shown in the hero strip ---------------------------------
  let heroSpecs = $derived(
    [
      { label: 'MCU', value: mcuInfo?.model?.name ?? mcuInfo?.family?.name ?? deviceMcuLabel(d) },
      { label: 'Radio', value: deviceRadioLabel(d) },
      { label: 'Display', value: displayLabel(d.hardware?.display) },
      { label: 'GPS', value: gnssLabel(d.hardware?.gnss) },
      { label: 'Battery', value: batteryLabel(d) },
      { label: 'Connectivity', value: interfaceLabel(d) }
    ].filter((s) => known(s.value))
  );

  // --- Catalog (data/globals.yaml) lookups for outbound datasheet links -------
  // MCU family + architecture are derived from the model via the family tree.
  let mcuInfo = $derived(resolveMcuInfo(d));
  let displayPart = $derived(
    d.hardware?.display?.status === 'present' ? resolveDisplay(d.hardware.display.technology) : null
  );
  let gnssPart = $derived(
    d.hardware?.gnss?.status === 'present' ? resolveGnss(d.hardware.gnss.chip) : null
  );

  // --- Detailed, grouped hardware sections ------------------------------------
  // A row may carry a catalog `part`; when it has a url the page renders a link
  // to the datasheet using the part's canonical name instead of the raw value.
  let mcuRows = $derived(
    rows([
      { label: 'Family', value: mcuInfo?.family?.name, part: mcuInfo?.family },
      // Specific model only — when just the family is known the row is omitted.
      // Falls back to the raw string when the model isn't in the catalog.
      {
        label: 'Model',
        value: mcuInfo?.model?.name ?? (mcuInfo ? undefined : d.hardware?.mcu?.model),
        part: mcuInfo?.model
      },
      { label: 'Architecture', value: mcuInfo?.architecture?.name, part: mcuInfo?.architecture },
      { label: 'Flash', value: d.hardware?.mcu?.flashMb && `${d.hardware.mcu.flashMb} MB` },
      { label: 'PSRAM', value: d.hardware?.mcu?.psramMb && `${d.hardware.mcu.psramMb} MB` }
    ])
  );

  let displayRows = $derived(
    d.hardware?.display?.status === 'present'
      ? rows([
          {
            label: 'Type',
            value:
              displayPart?.name ??
              (d.hardware.display.technology && titleCase(d.hardware.display.technology)),
            part: displayPart
          },
          { label: 'Controller', value: d.hardware.display.controller },
          { label: 'Size', value: d.hardware.display.size && `${d.hardware.display.size}″` },
          {
            label: 'Resolution',
            value:
              d.hardware.display.resolution?.width &&
              `${d.hardware.display.resolution.width} × ${d.hardware.display.resolution.height}`
          },
          { label: 'Colors', value: d.hardware.display.colors && titleCase(d.hardware.display.colors) },
          {
            label: 'Touch',
            value:
              d.hardware.display.touch === true ? 'Yes' : d.hardware.display.touch === false ? 'No' : undefined
          }
        ])
      : []
  );

  let gnssRows = $derived(
    d.hardware?.gnss?.status === 'present'
      ? rows([{ label: 'Chip', value: d.hardware.gnss.chip, part: gnssPart }])
      : []
  );

  let powerRows = $derived(
    rows([
      {
        label: 'Battery',
        value:
          d.hardware?.power?.batterySupported === true
            ? d.hardware?.power?.batteryBuiltIn === false
              ? 'External connector'
              : 'Supported'
            : d.hardware?.power?.batterySupported === false
              ? 'None'
              : undefined
      },
      {
        label: 'Built-in capacity',
        value: d.hardware?.power?.batteryCapacityMah && `${d.hardware.power.batteryCapacityMah} mAh`
      },
      {
        label: 'Built-in',
        value:
          d.hardware?.power?.batteryBuiltIn === true
            ? 'Yes'
            : d.hardware?.power?.batteryBuiltIn === false
              ? 'No'
              : undefined
      },
      {
        label: 'Charging',
        value:
          d.hardware?.power?.charging === true ? 'Yes' : d.hardware?.power?.charging === false ? 'No' : undefined
      },
      {
        label: 'Solar panel',
        value:
          d.hardware?.power?.solarPanelBuiltIn === true
            ? d.hardware?.power?.solarPanelWatts
              ? `Built-in · ${d.hardware.power.solarPanelWatts} W`
              : 'Built-in'
            : undefined
      },
      {
        label: 'Solar charging',
        value:
          d.hardware?.power?.solarInput === true
            ? 'Supported'
            : d.hardware?.power?.solarInput === false
              ? 'No'
              : undefined
      },
      { label: 'PMIC', value: d.hardware?.power?.pmic },
      {
        label: 'Shell',
        value:
          d.hardware?.enclosure?.builtIn === true
            ? 'Included'
            : d.hardware?.enclosure?.builtIn === false
              ? 'None'
              : undefined
      }
    ])
  );

  let interfaceRows = $derived(
    rows([
      { label: 'USB', value: d.interfaces?.usb?.connector },
      {
        label: 'USB modes',
        value: d.interfaces?.usb?.capabilities?.length
          ? d.interfaces.usb.capabilities.map(titleCase).join(', ')
          : undefined
      },
      {
        label: 'Bluetooth',
        value:
          d.interfaces?.bluetooth?.ble || d.interfaces?.bluetooth?.version
            ? `${d.interfaces.bluetooth.ble ? 'BLE' : 'Yes'}${known(d.interfaces.bluetooth.version) ? ` ${d.interfaces.bluetooth.version}` : ''}`
            : undefined
      },
      {
        label: 'Wi-Fi',
        value:
          d.interfaces?.wifi?.status === 'present'
            ? 'Yes'
            : d.interfaces?.wifi?.status === 'none'
              ? 'None'
              : undefined
      }
    ])
  );

  let metaRows = $derived(
    rows([
      { label: 'Kind', value: d.kind && titleCase(d.kind) },
      { label: 'Lifecycle', value: d.lifecycle && titleCase(d.lifecycle) },
      { label: 'Revision', value: d.revision },
      { label: 'Family', value: d.familyId },
      { label: 'Also known as', value: d.aliases?.length ? d.aliases.join(', ') : undefined }
    ])
  );

  let radios = $derived(d.hardware?.radios ?? []);

  // Whole-card visibility — a card renders only when it has content.
  let specCards = $derived(
    [
      { title: 'Processor', icon: '🧠', rows: mcuRows },
      { title: 'Display', icon: '🖥️', rows: displayRows },
      { title: 'GNSS', icon: '📡', rows: gnssRows },
      { title: 'Power', icon: '🔋', rows: powerRows },
      { title: 'Connectivity', icon: '🔌', rows: interfaceRows },
      { title: 'Details', icon: 'ℹ️', rows: metaRows }
    ].filter((c) => c.rows.length)
  );

  const LIFECYCLE_TW = {
    active: 'bg-ok/15 text-ok',
    announced: 'bg-accent2/15 text-accent2',
    discontinued: 'bg-bad/15 text-bad',
    unknown: 'bg-muted/15 text-muted'
  };
</script>

<!-- Renders a spec value: a datasheet link (catalog part with a url), a plain
     canonical name (catalog part without a url), or the raw fallback string. -->
{#snippet specValue(part, fallback)}
  {#if part?.url}
    <a class="text-accent2 hover:underline" href={part.url} target="_blank" rel="noreferrer" title="{part.vendor ? `${part.vendor} · ` : ''}datasheet">{part.name} ↗</a>
  {:else if part}
    {part.name}
  {:else}
    {fallback}
  {/if}
{/snippet}

<svelte:head><title>{d.name} — MeshCore Firmware Atlas</title></svelte:head>

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/devices/">← All devices</a>

<header class="mb-7 flex flex-wrap items-start gap-6">
  {#if d.imageUrl}
    <div class="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-edge bg-elev2 p-3">
      <img src={d.imageUrl} alt={d.name} class="max-h-full max-w-full object-contain" />
    </div>
  {/if}
  <div class="min-w-[240px] flex-1">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{d.name}</h1>
      {#if d.official}<span class="rounded-md bg-accent/15 px-2 py-0.5 text-[0.72rem] font-bold tracking-wide text-accent uppercase">Official</span>
      {:else}<span class="rounded-md bg-accent2/15 px-2 py-0.5 text-[0.72rem] font-bold tracking-wide text-accent2 uppercase">Community</span>{/if}
      {#if known(d.lifecycle)}<span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {LIFECYCLE_TW[d.lifecycle] ?? LIFECYCLE_TW.unknown}">{titleCase(d.lifecycle)}</span>{/if}
    </div>
    {#if d.vendor}
      <a class="mt-2 inline-flex items-center gap-1.5 text-[0.9rem] text-dim hover:text-accent" href="{base}/vendor/{d.vendor.id}/">
        {#if d.vendor.logoUrl}<img src={d.vendor.logoUrl} alt="" class="h-[22px] w-[22px] rounded object-contain" />{/if}
        {d.vendor.name}
      </a>
    {:else if d.vendorName}
      <p class="mt-1 text-dim">{d.vendorName}</p>
    {/if}
    {#if d.description}<p class="mt-2 max-w-[70ch] text-dim">{d.description}</p>{/if}
    {#if d.product_url}<a class="mt-3 inline-block text-[0.9rem] text-accent2 hover:underline" href={d.product_url} target="_blank" rel="noreferrer">Product page ↗</a>{/if}
  </div>
</header>

<!-- Headline specs at a glance -->
<dl class="mb-7 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-px overflow-hidden rounded-xl border border-edge bg-edge">
  {#each heroSpecs as s}
    <div class="bg-elev p-4">
      <dt class="text-[0.7rem] tracking-wide text-dim uppercase">{s.label}</dt>
      <dd class="mt-1 text-[0.95rem] font-medium">{s.value}</dd>
    </div>
  {/each}
</dl>

<!-- Roles & transports as chips -->
{#if d.roles?.length || d.transports?.length}
  <div class="mb-7 flex flex-wrap gap-x-8 gap-y-3">
    {#if d.roles?.length}
      <div>
        <span class="mb-1.5 block text-[0.7rem] tracking-wide text-dim uppercase">Roles</span>
        <div class="flex flex-wrap gap-1.5">
          {#each d.roles as r}<span class="rounded-full border border-edge bg-elev px-2.5 py-1 text-[0.8rem]">{titleCase(r)}</span>{/each}
        </div>
      </div>
    {/if}
    {#if d.transports?.length}
      <div>
        <span class="mb-1.5 block text-[0.7rem] tracking-wide text-dim uppercase">Transports</span>
        <div class="flex flex-wrap gap-1.5">
          {#each d.transports as t}<span class="rounded-full border border-edge bg-elev px-2.5 py-1 text-[0.8rem] uppercase">{t}</span>{/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<!-- Detailed hardware spec cards -->
<section class="mb-8">
  <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Hardware</h2>
  <div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
    <!-- Radio card(s) -->
    {#each radios as radio}
      <div class="rounded-xl border border-edge bg-elev p-5">
        <h3 class="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold">
          <span aria-hidden="true">📻</span> Radio{radios.length > 1 ? ` · ${(radio.technology ?? '').toUpperCase()}` : ''}
        </h3>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.9rem]">
          {#if known(radio.technology)}<dt class="text-dim">Technology</dt><dd class="text-right font-medium">{radio.technology.toUpperCase()}</dd>{/if}
          {#if known(radio.chip)}<dt class="text-dim">Chip</dt><dd class="text-right font-medium">{@render specValue(resolveRadio(radio.chip), radio.chip)}</dd>{/if}
          {#if radio.frequencyVariants?.length}
            <dt class="text-dim">Frequency</dt>
            <dd class="text-right font-medium">
              {#each radio.frequencyVariants as band, i}{@const fp = resolveFrequency(band)}{#if i > 0}, {/if}{#if fp}<span title={[fp.region, fp.range].filter(Boolean).join(' · ')} class="cursor-help underline decoration-dotted decoration-edge underline-offset-2">{fp.name}</span>{:else}{band}{/if}{/each}
            </dd>
          {/if}
        </dl>
      </div>
    {/each}

    {#each specCards as card}
      <div class="rounded-xl border border-edge bg-elev p-5">
        <h3 class="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold">
          <span aria-hidden="true">{card.icon}</span> {card.title}
        </h3>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.9rem]">
          {#each card.rows as row}
            <dt class="text-dim">{row.label}</dt>
            <dd class="text-right font-medium">{@render specValue(row.part, row.value)}</dd>
          {/each}
        </dl>
      </div>
    {/each}
  </div>
</section>

<section class="mb-7">
  <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Firmware support</h2>
  {#if data.firmwares.length}
    <table class="w-full border-collapse text-[0.9rem]">
      <thead>
        <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
          <th class="border-b border-edge px-2.5 py-2">Firmware</th>
          <th class="border-b border-edge px-2.5 py-2">Type</th>
          <th class="border-b border-edge px-2.5 py-2">Target</th>
          <th class="border-b border-edge px-2.5 py-2">Status</th>
          <th class="border-b border-edge px-2.5 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {#each data.firmwares as f}
          {@const meta = STATUS_META[f.status] ?? { label: f.status, tw: '' }}
          <tr>
            <td class="border-b border-edge px-2.5 py-2"><a class="text-accent2 hover:underline" href="{base}/firmware/{f.firmware.id}/">{f.firmware.name}</a></td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{TYPE_META[f.firmware.type]?.label ?? f.firmware.type}</td>
            <td class="border-b border-edge px-2.5 py-2 font-mono text-[0.8rem] text-dim">{f.target ?? '—'}</td>
            <td class="border-b border-edge px-2.5 py-2">
              <span class="inline-block rounded-full px-2 py-0.5 text-[0.78rem] whitespace-nowrap {meta.tw}">{meta.symbol ?? ''} {meta.label}</span>
            </td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{f.notes ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="text-dim">No firmware in the atlas lists this device yet.</p>
  {/if}
</section>
