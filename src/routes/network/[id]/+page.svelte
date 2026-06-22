<script>
  import { base } from '$app/paths';
  import RecordFooter from '$lib/RecordFooter.svelte';
  import {
    NETWORK_SCOPE_META,
    NETWORK_STATUS_META,
    networkBandLabel,
    networkFlags,
    networkRadioLabel,
    bandLabel,
    networkRadioSettings,
    networkRegions,
    deviceMcuLabel,
    deviceRadioLabel,
    isAppPresetNetwork,
    resolveRefs
  } from '$lib/data.js';
  import AppPresetBadge from '$lib/AppPresetBadge.svelte';
  import { clampDescription, absUrl, ogImageFor } from '$lib/seo.js';
  import Seo from '$lib/Seo.svelte';
  import { onMount } from 'svelte';
  import { LIVE_ENABLED, poll, fmtRate, agoLabel } from '$lib/pulse.js';
  let { data } = $props();
  let n = $derived(data.network);

  // Live analyzer metrics for this network, polled from the optional API.
  let live = $state(null);
  onMount(() => poll(`/api/networks/${n.id}`, 5000, (res) => (live = res)));

  // Payload-type breakdown as a sorted [name, count] list.
  let payloadBreakdown = $derived(
    Object.entries(live?.payloadTypes ?? {}).sort((a, b) => b[1] - a[1])
  );

  // Live per-analyzer stats keyed by analyzer name (matches network.yaml).
  let liveAnalyzerByName = $derived(
    Object.fromEntries((live?.analyzers ?? []).map((a) => [a.name, a]))
  );

  function radioSpecs(radio) {
    const frequency = networkRadioLabel(radio);
    return [
      frequency ? { label: 'Frequency', value: frequency } : null,
      radio?.bandwidth_khz != null ? { label: 'Bandwidth', value: `${radio.bandwidth_khz} kHz` } : null,
      radio?.spreading_factor != null ? { label: 'Spreading factor', value: `SF${radio.spreading_factor}` } : null,
      radio?.coding_rate ? { label: 'Coding rate', value: radio.coding_rate } : null,
      radio?.tx_power_dbm != null ? { label: 'TX power', value: `${radio.tx_power_dbm} dBm` } : null,
      radio?.duty_cycle_pct != null ? { label: 'Duty cycle', value: `${radio.duty_cycle_pct}%` } : null,
      radio?.path_hash_mode ? { label: 'Path hash', value: radio.path_hash_mode } : null,
      radio?.region_code ? { label: 'Region', value: radio.region_code } : null,
      radio?.max_hops != null ? { label: 'Max hops', value: String(radio.max_hops) } : null,
      radio?.public_channel ? { label: 'Public channel', value: radio.public_channel } : null
    ].filter(Boolean);
  }

  let refs = $derived(resolveRefs(n.refs));
  let alternateNames = $derived(n.also_known_as ?? []);

  let radioSettings = $derived(networkRadioSettings(n));
  let joinPresets = $derived(
    radioSettings
      .map((radio, index) => ({
        radio,
        title: radio.name ?? (radioSettings.length > 1 ? `Radio preset ${index + 1}` : 'Radio preset'),
        description: radio.description,
        appPreset: radio.app_preset,
        specs: radioSpecs(radio)
      }))
      .filter((preset) => preset.specs.length || preset.description || preset.appPreset)
  );

  // Community links (label + url), present ones only. Matrix/contact may be a
  // handle rather than a URL, so they render as plain text when not a link.
  let communityLinks = $derived(
    [
      n.community?.website ? { label: 'Website', url: n.community.website } : null,
      n.community?.forum ? { label: 'Forum', url: n.community.forum } : null,
      n.community?.discord ? { label: 'Discord', url: n.community.discord } : null,
      n.community?.telegram ? { label: 'Telegram', url: n.community.telegram } : null,
      n.community?.matrix ? { label: 'Matrix', url: /^https?:\/\//.test(n.community.matrix) ? n.community.matrix : null, text: n.community.matrix } : null,
      n.community?.facebook ? { label: 'Facebook', url: n.community.facebook } : null,
      n.community?.reddit ? { label: 'Reddit', url: n.community.reddit } : null,
      n.community?.youtube ? { label: 'YouTube', url: n.community.youtube } : null,
      n.community?.peertube ? { label: 'PeerTube', url: n.community.peertube } : null,
      n.community?.contact ? { label: 'Contact', url: /^https?:\/\//.test(n.community.contact) ? n.community.contact : `mailto:${n.community.contact}`, text: n.community.contact } : null
    ].filter(Boolean)
  );

  let maps = $derived(n.maps ?? []);
  let analyzers = $derived(n.analyzers ?? []);

  const RESOURCE_LABELS = {
    getting_started: 'Getting started',
    repeater_list: 'Repeater list',
    status_page: 'Status page'
  };
  let resourceLinks = $derived(
    [
      ...Object.entries(RESOURCE_LABELS)
        .map(([key, label]) => ({ label, url: n.resources?.[key] }))
        .filter((r) => r.url),
      ...(n.resources?.links ?? [])
    ]
  );

  let regions = $derived(networkRegions(n));

  let networkDescription = $derived(
    clampDescription(
      n.description ||
        `${n.name} — ${NETWORK_SCOPE_META[n.scope]?.label ?? n.scope ?? ''} MeshCore network${
          networkBandLabel(n) ? ` on ${networkBandLabel(n)}` : ''
        }.`
    )
  );
  let networkJsonLd = $derived({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: n.name,
    ...(n.description ? { description: clampDescription(n.description, 300) } : {}),
    ...(n.community?.website ? { url: n.community.website } : { url: absUrl(`/network/${n.id}/`) })
  });
</script>

<Seo
  title={n.name}
  description={networkDescription}
  image={ogImageFor('network', n.id)}
  jsonLd={networkJsonLd}
/>

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/networks/">← All networks</a>

<header class="mb-6">
  <div class="flex flex-wrap items-center gap-3">
    {#each networkFlags(n) as flag (flag.code)}
      <span
        class="inline-flex h-6 w-9 shrink-0 overflow-hidden rounded-[4px] ring-1 ring-edge [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover"
        title={flag.code}
        aria-hidden="true"
      >
        {@html flag.svg}
      </span>
    {/each}
    <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{n.name}</h1>
    {#if n.scope}
      <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {NETWORK_SCOPE_META[n.scope]?.tw ?? 'bg-elev2 text-dim'}">
        {NETWORK_SCOPE_META[n.scope]?.label ?? n.scope}
      </span>
    {/if}
    {#if n.status}
      <span class="text-[0.85rem] font-medium {NETWORK_STATUS_META[n.status]?.tw ?? 'text-dim'}">
        {NETWORK_STATUS_META[n.status]?.label ?? n.status}
      </span>
    {/if}
    {#if isAppPresetNetwork(n)}
      <AppPresetBadge label title="This network uses an official MeshCore app radio preset — selectable by name in the app" />
    {/if}
  </div>
  {#if n.short_name && n.short_name !== n.name}
    <p class="font-mono text-[0.85rem] text-dim">{n.short_name}</p>
  {/if}
  {#if alternateNames.length}
    <p class="mt-0.5 text-[0.9rem] text-dim">{alternateNames.join(' · ')}</p>
  {/if}
  {#if n.areaKm2 != null}
    <p class="mt-1 text-[0.85rem] text-dim">
      Coverage area <span class="font-mono text-ink">≈ {n.areaKm2.toLocaleString()} km²</span>
    </p>
  {/if}
  {#if n.description}<p class="mt-1 max-w-[70ch] text-dim">{n.description}</p>{/if}
  {#if communityLinks.length || refs.length}
    <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.92rem]">
      {#each communityLinks as link}
        {#if link.url}
          <a class="text-accent2 hover:underline" href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>
        {:else}
          <span class="text-dim">{link.label}: {link.text}</span>
        {/if}
      {/each}
      {#each refs as ref}
        <a class="text-accent2 hover:underline" href={ref.url} target="_blank" rel="noreferrer">{ref.name} ↗</a>
      {/each}
    </div>
  {/if}
</header>

{#if joinPresets.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">How to join</h2>
    <div class="grid gap-3 {joinPresets.length > 1 ? '[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]' : ''}">
      {#each joinPresets as preset}
        <div class="rounded-xl border border-edge bg-elev p-[1.1rem]">
          {#if joinPresets.length > 1 || preset.radio.name || preset.description || preset.appPreset}
            <div class="mb-3">
              <h3 class="font-semibold">{preset.title}</h3>
              {#if preset.appPreset}
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[0.82rem]">
                  <span class="text-dim">App preset:</span>
                  <span class="rounded-md border border-accent2/30 bg-accent2/10 px-2 py-0.5 font-mono text-[0.8rem] font-medium text-accent2">{preset.appPreset}</span>
                  <span class="text-dim">— select this by name in the MeshCore app</span>
                </p>
              {/if}
              {#if preset.description}<p class="mt-0.5 text-[0.85rem] text-dim">{preset.description}</p>{/if}
            </div>
          {/if}
          <dl class="grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(120px,1fr))]">
            {#each preset.specs as spec}
              <div>
                <dt class="text-[0.72rem] tracking-wide text-dim uppercase">{spec.label}</dt>
                <dd class="mt-0.5 font-mono text-[0.95rem]">{spec.value}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {/each}
    </div>
  </section>
{/if}

{#if regions.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Regions</h2>
    <div class="flex flex-wrap gap-2">
      {#each regions as r}
        <span
          class="inline-flex items-center gap-2 rounded-md border border-edge bg-elev px-2.5 py-1 text-[0.85rem] {r.parent
            ? ''
            : 'font-semibold'}"
          title={r.parent ? `Subdivision of ${r.parent}` : 'National region'}
        >
          {r.name}
          <span class="font-mono text-[0.72rem] text-dim">{r.code}</span>
        </span>
      {/each}
    </div>
  </section>
{/if}

{#snippet linkButtons(items)}
  <div class="flex flex-wrap gap-2">
    {#each items as r}
      <a class="rounded-lg border border-edge bg-elev px-3 py-1.5 text-[0.9rem] text-accent2 hover:border-accent" href={r.url} target="_blank" rel="noreferrer">{r.name ?? r.label} ↗</a>
    {/each}
  </div>
{/snippet}

{#if maps.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Maps</h2>
    {@render linkButtons(maps)}
  </section>
{/if}

{#if analyzers.length}
  <section class="mb-7">
    <h2 class="mb-3 flex items-center gap-2 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">
      Analyzers
      {#if LIVE_ENABLED && live}
        <span class="inline-flex items-center gap-1.5 text-[0.72rem] font-normal text-dim">
          <span class="h-1.5 w-1.5 rounded-full {live.analyzersConnected ? 'bg-accent' : 'bg-dim'}"></span>
          live
        </span>
      {/if}
    </h2>

    {#if LIVE_ENABLED && live}
      <!-- Network-wide live rollup (deduplicated across all analyzers). -->
      <div class="mb-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
        {#each [
          { label: 'pkt/m', value: fmtRate(live.pktPerMin) },
          { label: 'Unique packets', value: live.uniquePackets.toLocaleString() },
          { label: 'Observations', value: live.observations.toLocaleString() },
          { label: 'Observers', value: live.observers.toLocaleString() },
          { label: 'Analyzers', value: `${live.analyzersConnected}/${live.analyzersTotal}` }
        ] as stat}
          <div class="rounded-xl border border-edge bg-elev px-3 py-2">
            <div class="text-[0.68rem] tracking-wide text-dim uppercase">{stat.label}</div>
            <div class="mt-0.5 font-mono text-[1.05rem] tabular-nums">{stat.value}</div>
          </div>
        {/each}
      </div>

      {#if payloadBreakdown.length}
        <div class="mb-4 flex flex-wrap gap-1.5">
          {#each payloadBreakdown as [name, count]}
            <span class="rounded-md border border-edge bg-elev px-2 py-0.5 font-mono text-[0.72rem]">
              {name} <span class="text-dim">{count.toLocaleString()}</span>
            </span>
          {/each}
        </div>
      {/if}

      <!-- Per-analyzer detail. -->
      <div class="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {#each analyzers as a}
          {@const la = liveAnalyzerByName[a.name]}
          <div class="rounded-xl border border-edge bg-elev p-3">
            <div class="flex items-center justify-between gap-2">
              <a class="truncate font-medium text-accent2 hover:underline" href={a.url} target="_blank" rel="noreferrer" title={a.url}>{a.name} ↗</a>
              <span
                class="inline-flex shrink-0 items-center gap-1.5 text-[0.72rem] {la?.connected ? 'text-accent' : 'text-dim'}"
                title={la?.connected ? 'Connected' : la?.lastError || 'Not connected'}
              >
                <span class="h-1.5 w-1.5 rounded-full {la?.connected ? 'bg-accent' : 'bg-bad'}"></span>
                {la?.connected ? 'online' : 'offline'}
              </span>
            </div>
            {#if la?.connected || la?.observations}
              <dl class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.8rem]">
                <div><dt class="text-[0.66rem] tracking-wide text-dim uppercase">pkt/m</dt><dd class="font-mono tabular-nums">{fmtRate(la.pktPerMin)}</dd></div>
                <div><dt class="text-[0.66rem] tracking-wide text-dim uppercase">Observers</dt><dd class="font-mono tabular-nums">{la.observers.toLocaleString()}</dd></div>
                <div><dt class="text-[0.66rem] tracking-wide text-dim uppercase">Unique</dt><dd class="font-mono tabular-nums">{la.uniquePackets.toLocaleString()}</dd></div>
                <div><dt class="text-[0.66rem] tracking-wide text-dim uppercase">Observations</dt><dd class="font-mono tabular-nums">{la.observations.toLocaleString()}</dd></div>
              </dl>
              {#if agoLabel(la.lastPacketAt)}
                <p class="mt-2 text-[0.72rem] text-dim">last packet {agoLabel(la.lastPacketAt)}</p>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      {@render linkButtons(analyzers)}
    {/if}
  </section>
{/if}

{#if resourceLinks.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Resources</h2>
    {@render linkButtons(resourceLinks)}
  </section>
{/if}

<section class="mb-7">
  <h2 class="border-b border-edge pb-1.5 text-[1.1rem] font-semibold">
    Compatible devices ({data.devices.length})
  </h2>
  {#if data.devices.length}
    <p class="mt-2 text-[0.85rem] text-dim">
      Devices whose radios support {networkBandLabel(n) ?? 'this network'} band(s). Pick one, flash a
      MeshCore firmware, then apply the radio preset above.
    </p>
    <div class="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {#each data.devices as d (d.id)}
        <a class="flex items-center gap-3 rounded-xl border border-edge bg-elev px-3.5 py-2.5 hover:border-accent" href="{base}/device/{d.id}/">
          <div class="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elev2">
            {#if d.imageUrl}<img src={d.imageUrl} alt={d.name} loading="lazy" class="max-h-full max-w-full object-contain" />{/if}
          </div>
          <div>
            <span class="block text-[0.9rem]">{d.name}</span>
            <span class="block font-mono text-[0.76rem] text-dim">{deviceMcuLabel(d)} · {deviceRadioLabel(d)}</span>
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <p class="mt-3 text-dim">
      {#if networkBandLabel(n)}
        No catalogued devices match this network's band yet.
      {:else}
        Add a <code>radio.frequency</code> or <code>radios[].frequency</code> band to list compatible devices.
      {/if}
    </p>
  {/if}
</section>

{#if data.incompatibleDevices.length}
  <section class="mb-7">
    <details>
      <summary class="cursor-pointer list-none border-b border-edge pb-1.5 text-[1.1rem] font-semibold marker:content-none">
        <span class="inline-flex items-center gap-2">
          Incompatible devices ({data.incompatibleDevices.length})
          <span class="text-[0.8rem] font-normal text-dim">— show</span>
        </span>
      </summary>
      <p class="mt-2 text-[0.85rem] text-dim">
        These devices' radios don't cover {networkBandLabel(n) ?? 'this network'} band(s), so they
        can't join this network — their supported bands are shown below.
      </p>
      <div class="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {#each data.incompatibleDevices as d (d.id)}
          <a class="flex items-center gap-3 rounded-xl border border-edge bg-elev px-3.5 py-2.5 opacity-70 hover:border-bad hover:opacity-100" href="{base}/device/{d.id}/">
            <div class="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elev2 grayscale">
              {#if d.imageUrl}<img src={d.imageUrl} alt={d.name} loading="lazy" class="max-h-full max-w-full object-contain" />{/if}
            </div>
            <div>
              <span class="block text-[0.9rem]">{d.name}</span>
              <span class="block font-mono text-[0.76rem] text-dim">
                {[...new Set((d.hardware?.radios ?? []).flatMap((r) => r.bands ?? []))].map((b) => bandLabel(b) ?? b).join(', ') || 'No LoRa band'}
              </span>
            </div>
          </a>
        {/each}
      </div>
    </details>
  </section>
{/if}

<RecordFooter source={n.source} jsonPath="{base}/network/{n.id}.json" />
