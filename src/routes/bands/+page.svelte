<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { getDevice, deviceMcuLabel, deviceRadioLabel } from '$lib/data.js';
  import Seo from '$lib/Seo.svelte';
  import Chip from '$lib/Chip.svelte';
  let { data } = $props();
  let selectedRevision = $state('latest');

  // Optional device context (?device=<id>): show whose bands we're highlighting.
  // Query params only exist client-side — this page is prerendered, where
  // accessing url.searchParams throws, so guard on `browser`.
  let device = $derived(browser ? getDevice($page.url.searchParams.get('device')) ?? null : null);

  const known = (v) => v !== undefined && v !== null && v !== '' && v !== 'unknown';

  function revisionLabel(revision) {
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

  let deviceVariantRevisions = $derived.by(() => {
    const seen = new Set();
    const out = [];
    for (const variant of device?.variants ?? []) {
      if (!known(variant.revision)) continue;
      const revision = String(variant.revision);
      if (seen.has(revision)) continue;
      seen.add(revision);
      out.push(revision);
    }
    return out.sort(compareRevision);
  });

  let showRevisionFilter = $derived(deviceVariantRevisions.length > 1);
  let latestRevision = $derived(deviceVariantRevisions.at(-1) ?? null);
  let activeRevision = $derived(selectedRevision === 'latest' ? latestRevision : selectedRevision);

  let activeVariants = $derived.by(() => {
    const variants = device?.variants ?? [];
    if (!variants.length) return [];
    if (!showRevisionFilter || activeRevision === 'all' || !activeRevision) return variants;
    return variants.filter((variant) => String(variant.revision) === activeRevision);
  });

  let deviceBands = $derived.by(() => {
    if (activeVariants.length) {
      return new Set(activeVariants.flatMap((variant) => (variant.bands ?? []).map(String)));
    }
    return new Set((device?.hardware?.radios ?? []).flatMap((r) => (r.bands ?? []).map(String)));
  });

  function variantsForBand(band) {
    const key = String(band);
    return activeVariants.filter((variant) => (variant.bands ?? []).map(String).includes(key));
  }

  $effect(() => {
    if (!showRevisionFilter) {
      selectedRevision = 'latest';
    } else if (
      selectedRevision !== 'latest' &&
      selectedRevision !== 'all' &&
      !deviceVariantRevisions.includes(selectedRevision)
    ) {
      selectedRevision = 'latest';
    }
  });

  // Make the whole row clickable, but stay out of the way of the explicit
  // links and of text selection (so copying a frequency range still works).
  function rowClick(event, key) {
    if (event.target.closest('a')) return;
    if (window.getSelection?.().toString()) return;
    goto(`${base}/devices/?band=${key}`);
  }
</script>

<Seo
  title="Frequency bands"
  description="The regional LoRa frequency bands MeshCore devices use, with their frequency ranges and how many catalogued boards support each."
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Frequency bands</h1>
<p class="mb-5 max-w-2xl text-dim">
  Regional LoRa bands a MeshCore device's radio can operate on. A network picks
  one band; only devices whose radio supports it can join. Pick a band to see
  every catalogued board that supports it.
</p>

{#if device}
  <div class="mb-5 flex items-center gap-3 rounded-xl border border-accent2/40 bg-accent2/5 p-3">
    <a
      class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-elev2 p-1 text-muted"
      href="{base}/device/{device.id}/"
    >
      {#if device.imageUrl}
        <img src={device.imageUrl} alt="" class="max-h-full max-w-full object-contain" />
      {:else}
        <span class="font-mono text-[0.6rem] text-dim">{deviceMcuLabel(device)}</span>
      {/if}
    </a>
    <div class="min-w-0 flex-1">
      <div class="text-[0.75rem] uppercase tracking-wide text-dim">Supported bands for</div>
      <a class="block truncate font-semibold hover:text-accent hover:underline" href="{base}/device/{device.id}/" title={device.name}>
        {device.name}
      </a>
      <div class="truncate font-mono text-[0.75rem] text-dim">
        {deviceMcuLabel(device)}{#if deviceRadioLabel(device) && deviceRadioLabel(device) !== 'Unknown'} · {deviceRadioLabel(device)}{/if}
      </div>
    </div>
    {#if showRevisionFilter}
      <div class="flex flex-wrap justify-end gap-1.5" aria-label="Filter bands by hardware revision">
        <Chip
          tone="accent2"
          pressed={selectedRevision === 'all'}
          onPressedChange={() => (selectedRevision = 'all')}
          class="text-[0.75rem] font-semibold"
        >
          All revisions
        </Chip>
        {#each deviceVariantRevisions as revision}
          <Chip
            tone="accent2"
            pressed={activeRevision === revision}
            onPressedChange={() => (selectedRevision = revision)}
            class="text-[0.75rem] font-semibold"
          >
            {revisionLabel(revision)}
          </Chip>
        {/each}
      </div>
    {/if}
    <a class="shrink-0 text-[0.8rem] text-dim hover:text-accent hover:underline" href="{base}/bands/">Clear</a>
  </div>
{/if}

<div class="overflow-hidden rounded-xl border border-edge">
  <table class="w-full border-collapse text-[0.92rem]">
    <thead>
      <tr class="border-b border-edge bg-elev2 text-left text-[0.8rem] uppercase tracking-wide text-dim">
        <th class="px-4 py-2.5 font-semibold">Region</th>
        <th class="px-4 py-2.5 font-semibold">Band</th>
        <th class="px-4 py-2.5 font-semibold">Frequency range</th>
        {#if device}<th class="px-4 py-2.5 font-semibold">Variants</th>{/if}
        <th class="px-4 py-2.5 text-right font-semibold">Devices</th>
      </tr>
    </thead>
    <tbody>
      {#each data.bands as b (b.key)}
        {@const supported = deviceBands.has(b.key)}
        {@const variants = device ? variantsForBand(b.key) : []}
        <tr
          class="group cursor-pointer border-b border-edge last:border-0 transition hover:bg-elev {supported ? 'bg-accent2/10' : device ? 'opacity-45' : ''}"
          onclick={(e) => rowClick(e, b.key)}
        >
          <td class="px-4 py-3 {supported ? 'border-l-2 border-accent2' : ''}">
            <a class="font-semibold text-accent2 group-hover:underline" href="{base}/devices/?band={b.key}">
              {b.region ?? b.name}
            </a>
          </td>
          <td class="px-4 py-3 font-medium">{b.name}</td>
          <td class="px-4 py-3 font-mono text-[0.85rem] text-dim">{b.range ?? '—'}</td>
          {#if device}
            <td class="px-4 py-3">
              {#if variants.length}
                <div class="flex flex-wrap gap-1.5">
                  {#each variants as variant}
                    <span
                      class="rounded-full bg-accent2/10 px-2 py-0.5 text-[0.72rem] font-semibold text-accent2"
                      title={[revisionLabel(variant.revision), variant.sku ? `SKU ${variant.sku}` : null].filter(Boolean).join(' · ')}
                    >
                      {variant.name}{#if variant.sku} · {variant.sku}{/if}
                    </span>
                  {/each}
                </div>
              {:else if supported}
                <span class="text-dim">Radio support</span>
              {:else}
                <span class="text-muted">—</span>
              {/if}
            </td>
          {/if}
          <td class="px-4 py-3 text-right tabular-nums">
            {#if b.deviceCount > 0}
              <a class="text-accent2 hover:underline" href="{base}/devices/?band={b.key}">
                {b.deviceCount}
              </a>
            {:else}
              <span class="text-muted">0</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
