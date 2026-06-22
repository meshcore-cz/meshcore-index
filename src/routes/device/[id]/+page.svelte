<script>
  import { base } from '$app/paths';
  import RecordFooter from '$lib/RecordFooter.svelte';
  import {
    STATUS_META,
    TYPE_META,
    deviceMcuLabel,
    deviceRadioLabel,
    resolveMcuInfo,
    resolveRadio,
    resolveFrequency,
    bandLabel,
    resolveDisplay,
    resolveGnss,
    resolveRefs,
    deviceDisplayLabel,
    devicePriceLabel,
    stripVendorLabel,
    deviceShortName
  } from '$lib/data.js';
  import { metricById } from '$lib/metrics.js';
  import { compareIds } from '$lib/compare.js';
  import { clampDescription, abs, absUrl, ogImageFor } from '$lib/seo.js';
  import Seo from '$lib/Seo.svelte';
  import Chip from '$lib/Chip.svelte';
  import { Toggle } from 'bits-ui';
  import { favoriteIds, toggleFavorite } from '$lib/favorites.js';
  // Lucide icons for the hardware spec cards (per-icon imports tree-shake).
  import Radio from '@lucide/svelte/icons/radio';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import SatelliteDish from '@lucide/svelte/icons/satellite-dish';
  import BatteryFull from '@lucide/svelte/icons/battery-full';
  import Zap from '@lucide/svelte/icons/zap';
  import Sun from '@lucide/svelte/icons/sun';
  import Puzzle from '@lucide/svelte/icons/puzzle';
  import Ruler from '@lucide/svelte/icons/ruler';
  import Cable from '@lucide/svelte/icons/cable';
  import Info from '@lucide/svelte/icons/info';
  import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
  let { data } = $props();
  let d = $derived(data.device);
  let selectedVariantRevision = $state('latest');

  // Meta description: prefer the authored blurb, else synthesise from specs.
  let metaDescription = $derived(
    clampDescription(
      d.description ||
        [d.vendorName, deviceMcuLabel(d), deviceRadioLabel(d)]
          .filter((s) => s && s !== 'Unknown')
          .join(' · ') + ` — runs ${data.firmwares.length} MeshCore firmware${data.firmwares.length === 1 ? '' : 's'}.`
    )
  );

  // Product structured data for rich search results.
  let productJsonLd = $derived({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: d.name,
    ...(d.description ? { description: clampDescription(d.description, 300) } : {}),
    ...(d.imageUrl ? { image: abs(d.imageUrl) } : {}),
    ...(d.vendorName ? { brand: { '@type': 'Brand', name: d.vendorName } } : {}),
    category: 'LoRa device',
    url: absUrl(`/device/${d.id}/`),
    ...(d.price?.amount != null
      ? {
          offers: {
            '@type': 'Offer',
            price: d.price.amount,
            priceCurrency: d.price.currency ?? 'USD'
          }
        }
      : {})
  });

  // A value counts as "unknown" if it is missing, blank, or the literal "unknown".
  const known = (v) => v !== undefined && v !== null && v !== '' && v !== 'unknown';
  const titleCase = (s) =>
    String(s)
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

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

  function formatDimensions(dimensions) {
    if (!dimensions?.width || !dimensions?.height || !dimensions?.depth) return undefined;
    return `${dimensions.width} × ${dimensions.height} × ${dimensions.depth} mm`;
  }

  function metricDisplay(metricId, device = d) {
    const metric = metricById(metricId);
    if (!metric) return undefined;
    const value = metric.get({ ...device, firmwareSupportCount: data.firmwares.length });
    if (value == null) return undefined;
    return `${metric.fmt(value)}${metric.unit ? ` ${metric.unit}` : ''}`;
  }

  function formatOperatingTemp(env) {
    const temp = env?.operatingTempC;
    if (temp?.min == null || temp?.max == null) return undefined;
    return `${temp.min} to ${temp.max} °C`;
  }

  function formatExpansion(port) {
    const label = titleCase(String(port.type ?? 'Port').replace(/[-_]/g, ' '));
    let out = port.count > 1 ? `${label} ×${port.count}` : label;
    if (port.pins) out += ` · ${port.pins} pins`;
    if (port.interfaces?.length) out += ` (${port.interfaces.join(', ')})`;
    return out;
  }

  function variantBandsLabel(variant) {
    return (variant.bands ?? []).map((band) => bandLabel(band) ?? band).join(' / ');
  }

  function variantBandsTitle(variant) {
    return (variant.bands ?? [])
      .map((band) => {
        const fp = resolveFrequency(band);
        return fp ? [fp.name, fp.range].filter(Boolean).join(' · ') : band;
      })
      .join(' · ');
  }

  function variantRevisionLabel(revision) {
    if (!known(revision)) return null;
    const value = String(revision);
    return value.toLowerCase().startsWith('v') ? value : `V${value}`;
  }

  function revisionParts(revision) {
    const matches = String(revision).match(/\d+|[a-z]+/gi) ?? [];
    return matches.map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
  }

  function compareRevision(a, b) {
    const aa = revisionParts(a);
    const bb = revisionParts(b);
    const length = Math.max(aa.length, bb.length);
    for (let i = 0; i < length; i += 1) {
      if (aa[i] === undefined) return -1;
      if (bb[i] === undefined) return 1;
      if (aa[i] === bb[i]) continue;
      if (typeof aa[i] === 'number' && typeof bb[i] === 'number') return aa[i] - bb[i];
      return String(aa[i]).localeCompare(String(bb[i]), undefined, { numeric: true });
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function variantDisplayName(variant, activeRevision) {
    const name = variant.name ?? 'Variant';
    const revision = variantRevisionLabel(variant.revision);
    if (!revision || !activeRevision) return name;
    return String(name)
      .replace(new RegExp(`\\s*/\\s*${escapeRegExp(revision)}\\s*$`, 'i'), '')
      .trim();
  }

  // Keep only rows whose value is actually known, so cards never show "unknown".
  const rows = (entries) => entries.filter((r) => known(r.value));

  // --- Headline specs shown in the hero strip ---------------------------------
  let heroMcuLabel = $derived.by(() => {
    const info = resolveMcuInfo(d);
    const fallback = info?.model?.name ?? info?.family?.name ?? deviceMcuLabel(d);
    if (info?.model) return stripVendorLabel(info.model, fallback);
    if (info?.family) return stripVendorLabel(info.family, fallback);
    return fallback;
  });

  let heroRadioLabel = $derived.by(() => {
    const radios = d.hardware?.radios ?? [];
    if (!radios.length) return deviceRadioLabel(d);
    const labels = radios
      .map((r) => (r.chip ? stripVendorLabel(resolveRadio(r.chip), r.chip) : r.technology))
      .filter(Boolean);
    return labels.length ? labels.join(', ') : deviceRadioLabel(d);
  });

  let heroSpecs = $derived(
    [
      { label: 'MCU', value: heroMcuLabel },
      { label: 'Radio', value: heroRadioLabel },
      { label: 'Display', value: deviceDisplayLabel(d.hardware?.display) },
      { label: 'GPS', value: gnssLabel(d.hardware?.gnss) },
      { label: 'Battery', value: batteryLabel(d) },
      { label: 'Connectivity', value: interfaceLabel(d) }
    ].filter((s) => known(s.value))
  );

  let variantRevisions = $derived.by(() => {
    const seen = new Set();
    const out = [];
    for (const variant of d.variants ?? []) {
      if (!known(variant.revision)) continue;
      const revision = String(variant.revision);
      if (seen.has(revision)) continue;
      seen.add(revision);
      out.push(revision);
    }
    return out.sort(compareRevision);
  });

  let showVariantRevisionFilter = $derived(variantRevisions.length > 1);
  let latestVariantRevision = $derived(variantRevisions.at(-1) ?? null);
  let activeVariantRevision = $derived(
    selectedVariantRevision === 'latest' ? latestVariantRevision : selectedVariantRevision
  );

  let visibleVariants = $derived.by(() => {
    const variants = d.variants ?? [];
    if (!showVariantRevisionFilter || activeVariantRevision === 'all' || !activeVariantRevision) return variants;
    return variants.filter((variant) => String(variant.revision) === activeVariantRevision);
  });

  let visibleVariantGroups = $derived.by(() => {
    if (!showVariantRevisionFilter) return [{ revision: null, variants: visibleVariants }];
    const revisions =
      activeVariantRevision === 'all'
        ? variantRevisions
        : activeVariantRevision
          ? [activeVariantRevision]
          : [];
    const groups = revisions
      .map((revision) => ({
        revision,
        variants: (d.variants ?? []).filter((variant) => String(variant.revision) === revision)
      }))
      .filter((group) => group.variants.length);
    const unrevised =
      activeVariantRevision === 'all'
        ? (d.variants ?? []).filter((variant) => !known(variant.revision))
        : [];
    return unrevised.length ? [...groups, { revision: null, variants: unrevised }] : groups;
  });

  $effect(() => {
    if (!showVariantRevisionFilter) {
      selectedVariantRevision = 'latest';
    } else if (
      selectedVariantRevision !== 'latest' &&
      selectedVariantRevision !== 'all' &&
      !variantRevisions.includes(selectedVariantRevision)
    ) {
      selectedVariantRevision = 'latest';
    }
  });

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
      { label: 'Flash', value: d.hardware?.mcu?.flashMb && `${d.hardware.mcu.flashMb} MB`, metric: 'flash' },
      { label: 'RAM', value: d.hardware?.mcu?.ramKb && `${d.hardware.mcu.ramKb} KB`, metric: 'ram' },
      { label: 'PSRAM', value: d.hardware?.mcu?.psramMb && `${d.hardware.mcu.psramMb} MB`, metric: 'psram' }
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
          {
            label: 'Size',
            value: d.hardware.display.size && `${d.hardware.display.size}″`,
            metric: 'display-size'
          },
          {
            label: 'Resolution',
            value:
              d.hardware.display.resolution?.width &&
              `${d.hardware.display.resolution.width} × ${d.hardware.display.resolution.height}`,
            metric: 'display-pixels'
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

  let batteryRows = $derived(
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
        value: d.hardware?.power?.batteryCapacityMah && `${d.hardware.power.batteryCapacityMah} mAh`,
        metric: 'battery'
      },
      { label: 'Chemistry', value: BATTERY_CHEMISTRY[d.hardware?.power?.batteryChemistry] },
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
      { label: 'Connector', value: d.hardware?.power?.batteryConnector }
    ])
  );

  let powerRows = $derived(
    rows([
      {
        label: 'Power draw (idle)',
        value:
          d.hardware?.power?.consumptionIdleMa != null
            ? `${d.hardware.power.consumptionIdleMa} mA`
            : undefined,
        metric: 'idle-draw'
      },
      {
        label: 'Idle runtime',
        value: metricDisplay('idle-runtime'),
        metric: 'idle-runtime'
      },
      {
        label: 'Power draw (TX)',
        value:
          d.hardware?.power?.consumptionTxMa != null
            ? `${d.hardware.power.consumptionTxMa} mA`
            : undefined,
        metric: 'tx-draw'
      },
      { label: 'PMIC', value: d.hardware?.power?.pmic }
    ])
  );

  // Solar card surfaces only positive capability — a built-in panel or the
  // ability to attach one. Explicit `false` flags stay hidden so the card never
  // shows up just to say "None".
  let solarRows = $derived(
    rows([
      {
        label: 'Solar panel',
        value: d.hardware?.power?.solarPanelBuiltIn === true ? 'Built-in' : undefined
      },
      {
        label: 'Panel power',
        value: d.hardware?.power?.solarPanelWatts && `${d.hardware.power.solarPanelWatts} W`,
        metric: 'solar'
      },
      {
        label: 'Solar charging',
        value: d.hardware?.power?.solarInput === true ? 'Supported' : undefined
      }
    ])
  );

  let expansionRows = $derived(
    rows((d.hardware?.expansion ?? []).map((port, i) => ({
      label: (d.hardware?.expansion?.length ?? 0) > 1 ? `Port ${i + 1}` : 'Connector',
      value: formatExpansion(port)
    })))
  );

  let inputRows = $derived(
    rows(
      (d.hardware?.input ?? []).map((item) => ({
        label: titleCase(item.type),
        value: item.description ?? 'Yes'
      }))
    )
  );

  let physicalRows = $derived(
    rows([
      {
        label: 'LEDs',
        value:
          d.hardware?.leds?.status === 'present'
            ? d.hardware.leds.description ?? 'Yes'
            : d.hardware?.leds?.status === 'none'
              ? 'None'
              : undefined
      },
      { label: 'Dimensions', value: formatDimensions(d.hardware?.physical?.dimensionsMm) },
      { label: 'Board area', value: metricDisplay('area'), metric: 'area' },
      { label: 'Board volume', value: metricDisplay('volume'), metric: 'volume' },
      { label: 'Weight', value: d.hardware?.physical?.weightG && `${d.hardware.physical.weightG} g`, metric: 'weight' },
      {
        label: 'Shell',
        value:
          d.hardware?.enclosure?.builtIn === true
            ? 'Included'
            : d.hardware?.enclosure?.builtIn === false
              ? 'None'
              : undefined
      },
      { label: 'IP rating', value: d.hardware?.enclosure?.ipRating },
      { label: 'Operating temp', value: formatOperatingTemp(d.hardware?.environmental) },
      {
        label: 'Certifications',
        value: d.hardware?.certifications?.length ? d.hardware.certifications.join(', ') : undefined
      }
    ])
  );

  let interfaceRows = $derived(
    rows([
      { label: 'USB', value: d.interfaces?.usb?.connector },
      { label: 'USB bridge', value: d.interfaces?.usb?.bridge },
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
            ? d.interfaces.wifi.standard ?? 'Yes'
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
      { label: 'Firmware support', value: `${data.firmwares.length}`, metric: 'firmware-support' },
      { label: 'Catalog completeness', value: metricDisplay('completeness'), metric: 'completeness' },
      { label: 'Also known as', value: d.aliases?.length ? d.aliases.join(', ') : undefined }
    ])
  );

  let radios = $derived(d.hardware?.radios ?? []);
  let refs = $derived(resolveRefs(d.refs));
  let favoriteCompareIds = $derived([d.id, ...$favoriteIds.filter((id) => id !== d.id)]);

  // Whole-card visibility — a card renders only when it has content.
  let specCards = $derived(
    [
      { title: 'Processor', icon: Cpu, rows: mcuRows },
      { title: 'Display', icon: Monitor, rows: displayRows },
      { title: 'Input', icon: Keyboard, rows: inputRows },
      { title: 'GNSS', icon: SatelliteDish, rows: gnssRows },
      { title: 'Battery', icon: BatteryFull, rows: batteryRows },
      { title: 'Power', icon: Zap, rows: powerRows },
      { title: 'Solar', icon: Sun, rows: solarRows },
      { title: 'Expansion', icon: Puzzle, rows: expansionRows },
      { title: 'Physical', icon: Ruler, rows: physicalRows },
      { title: 'Connectivity', icon: Cable, rows: interfaceRows },
      { title: 'Details', icon: Info, rows: metaRows }
    ].filter((c) => c.rows.length)
  );

  const BATTERY_CHEMISTRY = {
    'li-po': 'LiPo',
    'li-ion': 'Li-ion',
    lifepo4: 'LiFePO₄',
    lto: 'LTO',
    nimh: 'NiMH',
    alkaline: 'Alkaline',
    other: 'Other'
  };

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

<!-- A spec value plus a "rank this spec" link → /device-rank, sorted by this metric
     with this device highlighted. The icon sits left of the value so values
     stay aligned at the right edge. Falls back to a plain value when the row
     carries no comparable metric. -->
{#snippet rankableValue(row)}
  {#if row.metric}
    <span class="inline-flex items-center justify-end gap-1.5">
      <a
        class="shrink-0 text-edge transition hover:text-accent"
        href="{base}/device-rank/{row.metric}/?from={d.id}"
        title="Compare this spec across all devices"
        aria-label="Rank all devices by this spec"
      >
        <ChartNoAxesColumn class="h-[0.95em] w-[0.95em]" aria-hidden="true" />
      </a>
      {@render specValue(row.part, row.value)}
    </span>
  {:else}
    {@render specValue(row.part, row.value)}
  {/if}
{/snippet}

{#snippet variantTable(variants, revision)}
  <div class="overflow-hidden rounded-xl border border-edge bg-elev">
    {#if revision}
      <div class="border-b border-edge bg-elev2/55 px-4 py-2.5">
        <h3 class="text-[0.86rem] font-bold tracking-wide text-ink uppercase">{variantRevisionLabel(revision)}</h3>
      </div>
    {/if}
    <div class="overflow-x-auto">
      <table class="w-full min-w-[520px] border-collapse text-[0.88rem]">
        <thead class="bg-elev2/35 text-left text-[0.7rem] tracking-wide text-dim uppercase">
          <tr>
            <th class="px-4 py-2.5 font-semibold">Revision</th>
            <th class="px-4 py-2.5 font-semibold">Variant</th>
            <th class="px-4 py-2.5 font-semibold">Band</th>
            <th class="px-4 py-2.5 font-semibold">SKU</th>
          </tr>
        </thead>
        <tbody>
          {#each variants as variant}
            <tr class="border-t border-edge/70">
              <td class="px-4 py-3 font-semibold text-dim">{variantRevisionLabel(variant.revision) ?? '—'}</td>
              <td class="px-4 py-3 font-semibold text-ink">{variantDisplayName(variant, activeVariantRevision)}</td>
              <td class="px-4 py-3">
                {#if variant.bands?.length}
                  <span class="inline-flex flex-wrap gap-1.5">
                    {#each variant.bands as band}
                      {@const fp = resolveFrequency(band)}
                      <a
                        href="{base}/bands/?device={d.id}"
                        title={[fp ? [fp.name, fp.range].filter(Boolean).join(' · ') : null, 'See all bands for this device'].filter(Boolean).join(' · ')}
                        class="rounded-full bg-accent2/10 px-2.5 py-1 text-[0.76rem] font-semibold leading-tight text-accent2 transition hover:bg-accent2/15 hover:underline"
                      >
                        {fp?.region ?? fp?.name ?? band}
                      </a>
                    {/each}
                  </span>
                {:else}
                  <span class="text-dim">—</span>
                {/if}
              </td>
              <td class="px-4 py-3 font-mono text-[0.8rem] text-dim">{variant.sku ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/snippet}

<Seo title={d.name} description={metaDescription} type="article" image={ogImageFor('device', d.id)} jsonLd={productJsonLd} />

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/devices/">← All devices</a>

<header class="mb-7 flex flex-wrap items-start gap-6">
  <div class="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-edge bg-elev2 p-3 text-muted">
    {#if d.imageUrl}
      <img src={d.imageUrl} alt={d.name} class="max-h-full max-w-full object-contain" />
    {:else}
      <svg aria-hidden="true" viewBox="0 0 24 24" class="h-20 w-20">
        <rect x="7" y="4" width="10" height="16" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
      </svg>
    {/if}
  </div>
  <div class="min-w-[240px] flex-1">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{d.name}</h1>
      {#if d.official}<span class="rounded-md bg-accent/15 px-2 py-0.5 text-[0.72rem] font-bold tracking-wide text-accent uppercase">Official</span>
      {:else}<span class="rounded-md bg-accent2/15 px-2 py-0.5 text-[0.72rem] font-bold tracking-wide text-accent2 uppercase">Community</span>{/if}
      {#if known(d.lifecycle)}<span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {LIFECYCLE_TW[d.lifecycle] ?? LIFECYCLE_TW.unknown}">{titleCase(d.lifecycle)}</span>{/if}
    </div>
    {#if d.vendor}
      <a class="mt-2 inline-flex items-center gap-1.5 text-[0.9rem] text-dim hover:text-accent" href="{base}/vendor/{d.vendor.id}/">
        {#if d.vendor.logoUrl}<img src={d.vendor.logoUrl} alt="" class="h-7 w-7 rounded bg-white p-0.5 object-contain" />{/if}
        {d.vendor.name}
      </a>
    {:else if d.vendorName}
      <p class="mt-1 text-dim">{d.vendorName}</p>
    {/if}
    {#if d.description}<p class="mt-2 max-w-[70ch] text-dim">{d.description}</p>{/if}
    {#if devicePriceLabel(d)}
      <p class="mt-3 flex items-baseline gap-2">
        <span class="text-[1.25rem] font-bold">{devicePriceLabel(d)}</span>
        <span class="text-[0.78rem] text-dim">approx {#if d.price?.asOf} ({d.price.asOf}){/if}</span>
      </p>
    {/if}
    {#if d.product_url || d.datasheetUrl}
      <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.9rem]">
        {#if d.product_url}<a class="text-accent2 hover:underline" href={d.product_url} target="_blank" rel="noreferrer">Product page ↗</a>{/if}
        {#if d.datasheetUrl}<a class="text-accent2 hover:underline" href={d.datasheetUrl} target="_blank" rel="noreferrer">Datasheet ↗</a>{/if}
      </div>
    {/if}
    <div class="mt-3 flex flex-wrap gap-2">
      <Toggle.Root
        pressed={$favoriteIds.includes(d.id)}
        onPressedChange={() => toggleFavorite(d.id)}
        class="rounded-full border px-3 py-1.5 text-[0.85rem] font-medium outline-none transition {$favoriteIds.includes(d.id)
          ? 'border-accent bg-accent text-bg'
          : 'border-edge bg-elev text-dim hover:border-accent/60 hover:text-ink'}"
      >
        {$favoriteIds.includes(d.id) ? '★ Favourite' : '☆ Add to favourites'}
      </Toggle.Root>
      {#if favoriteCompareIds.length > 1}
        <a
          class="rounded-full border border-edge bg-elev px-3 py-1.5 text-[0.85rem] font-medium text-dim transition hover:border-accent/60 hover:text-ink"
          href="{base}/compare/?ids={favoriteCompareIds.join(',')}"
          onclick={() => compareIds.set(favoriteCompareIds)}
        >
          Compare with favourites
        </a>
      {/if}
    </div>
    {#if refs.length}
      <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.85rem] text-dim">
        <span>References:</span>
        {#each refs as ref}
          <a class="text-accent2 hover:underline" href={ref.url} target="_blank" rel="noreferrer">{ref.name} ↗</a>
        {/each}
      </div>
    {/if}
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

<!-- Other models in the same family (e.g. Wio Tracker L1 / L1 Pro / L1 e-ink) -->
{#if data.family?.length}
  <section class="mb-8">
    <div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-edge pb-1.5">
      <h2 class="text-[1.1rem] font-semibold">Other models</h2>
      <a
        class="text-[0.8rem] text-dim transition hover:text-accent hover:underline"
        href="{base}/compare/?ids={[d.id, ...data.family.map((v) => v.id)].join(',')}"
        onclick={() => compareIds.set([d.id, ...data.family.map((v) => v.id)])}
      >
        Compare all {data.family.length + 1} →
      </a>
    </div>
    <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.family as v (v.id)}
        <a
          class="group flex items-center gap-3 rounded-xl border border-edge bg-elev p-3 transition hover:-translate-y-0.5 hover:border-accent"
          href="{base}/device/{v.id}/"
        >
          <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-elev2 p-1 text-muted">
            {#if v.imageUrl}
              <img src={v.imageUrl} alt="" loading="lazy" class="max-h-full max-w-full object-contain" />
            {:else}
              <span class="font-mono text-[0.6rem] text-dim">{deviceMcuLabel(v)}</span>
            {/if}
          </span>
          <span class="min-w-0">
            <span class="block text-[0.9rem] leading-tight font-medium group-hover:text-accent" title={v.name}>{deviceShortName(v)}</span>
            <span class="mt-0.5 block truncate font-mono text-[0.75rem] text-dim">{deviceMcuLabel(v)}{#if deviceRadioLabel(v) && deviceRadioLabel(v) !== 'Unknown'} · {deviceRadioLabel(v)}{/if}</span>
          </span>
        </a>
      {/each}
    </div>
  </section>
{/if}

<!-- Purchasable variants of the same model (e.g. frequency-specific SKUs). -->
{#if d.variants?.length}
  <section class="mb-8">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-edge pb-1.5">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-[1.1rem] font-semibold">Variants</h2>
        <span class="text-[0.8rem] text-dim">Purchasable options for this device</span>
      </div>
      {#if showVariantRevisionFilter}
        <div class="flex flex-wrap justify-end gap-1.5" aria-label="Filter variants by revision">
          <Chip
            tone="accent2"
            pressed={selectedVariantRevision === 'all'}
            onPressedChange={() => (selectedVariantRevision = 'all')}
            class="text-[0.75rem] font-semibold"
          >
            All revisions
          </Chip>
          {#each variantRevisions as revision}
            <Chip
              tone="accent2"
              pressed={activeVariantRevision === revision}
              onPressedChange={() => (selectedVariantRevision = revision)}
              class="text-[0.75rem] font-semibold"
            >
              {variantRevisionLabel(revision)}
            </Chip>
          {/each}
        </div>
      {/if}
    </div>
    <div class="space-y-4">
      {#each visibleVariantGroups as group}
        {@render variantTable(group.variants, selectedVariantRevision === 'all' ? group.revision : null)}
      {/each}
    </div>
  </section>
{/if}

<!-- Detailed hardware spec cards -->
<section class="mb-8">
  <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Hardware</h2>
  <!-- Masonry flow: cards pack vertically per column, so a tall card (e.g. Power)
       no longer leaves its row-mates with empty space. -->
  <div class="gap-4 [columns:280px]">
    <!-- Radio card(s) -->
    {#each radios as radio, ri}
      <div class="mb-4 break-inside-avoid rounded-xl border border-edge bg-elev p-5">
        <h3 class="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold">
          <Radio class="h-[1.05em] w-[1.05em] text-accent2" aria-hidden="true" /> Radio{radios.length > 1 ? ` · ${(radio.technology ?? '').toUpperCase()}` : ''}
        </h3>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[0.9rem]">
          {#if known(radio.technology)}<dt class="text-dim">Technology</dt><dd class="min-w-0 break-words text-right font-medium">{radio.technology.toUpperCase()}</dd>{/if}
          {#if known(radio.chip)}<dt class="text-dim">Chip</dt><dd class="min-w-0 break-words text-right font-medium">{@render specValue(resolveRadio(radio.chip), radio.chip)}</dd>{/if}
          {#if radio.bands?.length}
            <dt class="text-dim"><a class="transition hover:text-accent hover:underline" href="{base}/bands/" title="About frequency bands">Bands</a></dt>
            <dd class="min-w-0 text-right font-medium">
              <span class="inline-flex flex-wrap justify-end gap-1.5">
                {#each radio.bands as band}{@const fp = resolveFrequency(band)}
                  <a
                    href="{base}/bands/?device={d.id}"
                    title={[fp ? [fp.name, fp.range].filter(Boolean).join(' · ') : null, 'See all bands for this device'].filter(Boolean).join(' · ')}
                    class="rounded-full border border-edge bg-elev2 px-2 py-0.5 text-[0.78rem] leading-tight transition hover:border-accent/60 hover:text-accent"
                  >
                    {fp?.region ?? fp?.name ?? band}
                  </a>
                {/each}
              </span>
            </dd>
          {/if}
          {#if known(radio.txPowerDbm)}<dt class="text-dim">TX power</dt><dd class="min-w-0 break-words text-right font-medium">{@render rankableValue({ value: `${radio.txPowerDbm} dBm`, metric: 'tx-power' })}</dd>{/if}
          {#if known(radio.txPowerDbm) && known(d.hardware?.power?.consumptionTxMa)}
            <dt class="text-dim">TX efficiency</dt>
            <dd class="min-w-0 break-words text-right font-medium">{@render rankableValue({ value: metricDisplay('tx-efficiency'), metric: 'tx-efficiency' })}</dd>
          {/if}
          {#if known(radio.antenna)}<dt class="text-dim">Antenna</dt><dd class="min-w-0 break-words text-right font-medium">{radio.antenna}</dd>{/if}
        </dl>
      </div>
    {/each}

    {#each specCards as card}
      <div class="mb-4 break-inside-avoid rounded-xl border border-edge bg-elev p-5">
        <h3 class="mb-3 flex items-center gap-2 text-[0.95rem] font-semibold">
          <card.icon class="h-[1.05em] w-[1.05em] text-accent2" aria-hidden="true" /> {card.title}
        </h3>
        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[0.9rem]">
          {#each card.rows as row}
            <dt class="text-dim">{row.label}</dt>
            <dd class="min-w-0 break-words text-right font-medium">{@render rankableValue(row)}</dd>
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

<RecordFooter source={d.source} jsonPath="{base}/device/{d.id}.json" />
