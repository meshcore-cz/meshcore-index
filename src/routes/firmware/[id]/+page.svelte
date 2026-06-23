<script>
  import { base } from '$app/paths';
  import RecordFooter from '$lib/RecordFooter.svelte';
  import BackLink from '$lib/BackLink.svelte';
  import { pluralize } from '$lib/format.js';
  import { STATUS_META, TYPE_META, FW_STATUS_TW, LICENSE_TYPE_META, licenseType, groupReleases, getFirmware, deviceMcuLabel, deviceRadioLabel, resolveRefs, descriptionToPlain } from '$lib/data.js';
  import { clampDescription, absUrl, ogImageFor } from '$lib/seo.js';
  import Seo from '$lib/Seo.svelte';
  import RichText from '$lib/RichText.svelte';
  import ReleaseGroupList from '$lib/ReleaseGroupList.svelte';
  import CapabilityMatrix from '$lib/CapabilityMatrix.svelte';
  let { data } = $props();
  let fw = $derived(data.firmware);

  const PREVIEW = 3;
  let releaseGroups = $derived(groupReleases(fw.releases));
  let refs = $derived(resolveRefs(fw.refs));
  let previewGroups = $derived(releaseGroups.slice(0, PREVIEW));
  let licensing = $derived(licenseType(fw));

  const FRAMEWORK_LABELS = { arduino: 'Arduino', zephyr: 'Zephyr', 'esp-idf': 'ESP-IDF', other: 'Other' };
  const LANGUAGE_LABELS = { cpp: 'C++', c: 'C', rust: 'Rust' };
  const POPULARITY_LABELS = {
    githubStars: 'GitHub stars',
    githubForks: 'Forks',
    githubWatchers: 'Watchers',
    githubOpenIssues: 'Open issues',
    githubContributors: 'Contributors',
    releaseDownloads: 'Release downloads',
    latestReleaseDownloads: 'Latest downloads'
  };
  const VERIFICATION_LABELS = {
    sourceAvailable: 'Source available',
    releasesAvailable: 'Releases available',
    signedReleases: 'Signed releases',
    reproducibleBuilds: 'Reproducible builds',
    ciBuilds: 'CI builds',
    officialFlasher: 'Official flasher',
    hasDocumentation: 'Documentation'
  };
  const numberFmt = new Intl.NumberFormat('en');
  const formatNumber = (value) => numberFmt.format(value);
  const boolLabel = (value) => (value ? 'Yes' : 'No');
  const boolTone = (value) => (value ? 'border-accent/40 bg-accent/10 text-accent' : 'border-edge bg-elev2 text-dim');
  const runtimeLabel = $derived(
    [FRAMEWORK_LABELS[fw.runtime?.framework] ?? fw.runtime?.framework,
     LANGUAGE_LABELS[fw.runtime?.language] ?? fw.runtime?.language]
      .filter(Boolean)
      .join(' · ')
  );
  let popularityEntries = $derived(
    Object.entries(POPULARITY_LABELS)
      .map(([key, label]) => ({ key, label, value: fw.popularity?.[key] }))
      .filter((item) => Number.isFinite(item.value))
  );
  let verificationEntries = $derived(
    Object.entries(VERIFICATION_LABELS)
      .map(([key, label]) => ({ key, label, value: fw.verification?.[key] }))
      .filter((item) => typeof item.value === 'boolean')
  );

  // Lineage: resolve the upstream firmware to a catalog entry (so we can link)
  // when it's one we know, falling back to a bare repository link.
  const LINEAGE_VERB = { fork: 'Fork of', reimplementation: 'Reimplementation of', upstream: null };
  let upstream = $derived(
    fw.lineage?.upstreamFirmwareId ? getFirmware(fw.lineage.upstreamFirmwareId) : null
  );
  let lineageVerb = $derived(fw.lineage ? LINEAGE_VERB[fw.lineage.kind] : null);

  // Maintainers: prefer the structured `maintainers` list; otherwise fall back
  // to the single `maintainer` string, linked to an explicit maintainerUrl or
  // the GitHub owner derived from the repository (github.com/<owner>).
  const githubOwner = (url) => {
    const m = /^https?:\/\/github\.com\/([^/]+)/i.exec(url ?? '');
    return m ? `https://github.com/${m[1]}` : null;
  };
  let maintainers = $derived(fw.maintainers ?? []);
  let maintainerUrl = $derived(fw.maintainerUrl ?? githubOwner(fw.repository));

  // Link the latest-version chip to its release card when one matches.
  let latestReleaseId = $derived(
    fw.latest_version && releaseGroups.some((g) => g.version === fw.latest_version)
      ? `release-${fw.latest_version}`
      : null
  );

  // Device-compatibility table: per-status counts + an optional build-target view.
  let statusCounts = $derived(
    data.devices.reduce((m, d) => ((m[d.status] = (m[d.status] ?? 0) + 1), m), {})
  );
  let showTargets = $state(false);

  let fwDescription = $derived(
    clampDescription(
      descriptionToPlain(fw.description) ||
        `${fw.name} — ${TYPE_META[fw.type]?.label ?? fw.type} MeshCore firmware${fw.maintainer ? ` by ${fw.maintainer}` : ''}, supporting ${pluralize(data.devices.length, 'device')}.`
    )
  );
  let fwJsonLd = $derived({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: fw.name,
    applicationCategory: 'Firmware',
    operatingSystem: 'MeshCore',
    ...(fw.description ? { description: clampDescription(descriptionToPlain(fw.description), 300) } : {}),
    ...(fw.maintainer ? { author: { '@type': 'Person', name: fw.maintainer } } : {}),
    ...(fw.latest_version ? { softwareVersion: fw.latest_version } : {}),
    url: absUrl(`/firmware/${fw.id}/`),
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' }
  });
</script>

<Seo title={fw.name} description={fwDescription} type="article" image={ogImageFor('firmware', fw.id)} jsonLd={fwJsonLd} />

<BackLink href="{base}/firmwares/">All firmwares</BackLink>

<header class="mb-6">
  <div class="flex flex-wrap items-center gap-3">
    <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{fw.name}</h1>
    <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {TYPE_META[fw.type]?.tw}">
      {TYPE_META[fw.type]?.label ?? fw.type}
    </span>
  </div>
  {#if fw.description}<RichText class="max-w-[70ch] text-dim" text={fw.description} />{/if}
  {#if lineageVerb}
    <p class="mt-1.5 text-[0.9rem] text-dim">
      {lineageVerb}
      {#if upstream}
        <a class="text-accent2 hover:underline" href="{base}/firmware/{upstream.id}/">{upstream.name}</a>
      {:else if fw.lineage?.upstreamRepository}
        <a class="text-accent2 hover:underline" href={fw.lineage.upstreamRepository} target="_blank" rel="noreferrer">{fw.lineage.upstreamFirmwareId ?? 'upstream'} ↗</a>
      {:else}
        {fw.lineage?.upstreamFirmwareId ?? 'MeshCore'}
      {/if}
    </p>
  {/if}
  <div class="mt-1.5 flex flex-wrap gap-4">
    {#if fw.repository}<a class="text-accent2 hover:underline" href={fw.repository} target="_blank" rel="noreferrer">Repository ↗</a>{/if}
    {#if fw.website}<a class="text-accent2 hover:underline" href={fw.website} target="_blank" rel="noreferrer">Website ↗</a>{/if}
    {#each refs as ref}
      <a class="text-accent2 hover:underline" href={ref.url} target="_blank" rel="noreferrer">{ref.name} ↗</a>
    {/each}
  </div>
</header>

<dl class="mb-7 rounded-xl border border-edge bg-elev p-[1.1rem]">
  <!-- Maintainer can be a long sentence, so it gets its own row above the
       compact metadata grid instead of distorting the columns. -->
  <div class="mb-3 border-b border-edge pb-3">
    <dt class="text-[0.72rem] tracking-wide text-dim uppercase">{maintainers.length > 1 ? 'Maintainers' : 'Maintainer'}</dt>
    <dd class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.95rem]">
      {#if maintainers.length}
        {#each maintainers as m, i}
          {#if i > 0}<span class="text-muted">·</span>{/if}
          {#if m.url}
            <a class="text-accent2 hover:underline" href={m.url} target="_blank" rel="noreferrer">{m.name} ↗</a>
          {:else}
            <span>{m.name}</span>
          {/if}
        {/each}
      {:else if maintainerUrl}
        <a class="text-accent2 hover:underline" href={maintainerUrl} target="_blank" rel="noreferrer">{fw.maintainer} ↗</a>
      {:else}
        {fw.maintainer}
      {/if}
    </dd>
  </div>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-4 gap-y-3">
    <div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Status</dt><dd class="mt-1 text-[0.95rem] {FW_STATUS_TW[fw.status] ?? ''}">{fw.status}</dd></div>
    {#if fw.maturity}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Maturity</dt><dd class="mt-1 text-[0.95rem]">{fw.maturity}</dd></div>{/if}
    {#if fw.lifecycle}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Lifecycle</dt><dd class="mt-1 text-[0.95rem]">{fw.lifecycle}</dd></div>{/if}
    {#if fw.latest_version}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Latest version</dt><dd class="mt-1 text-[0.95rem]">{#if latestReleaseId}<a class="text-accent2 hover:underline" href="#{latestReleaseId}">{fw.latest_version}</a>{:else}{fw.latest_version}{/if}</dd></div>{/if}
    {#if fw.released}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Released</dt><dd class="mt-1 text-[0.95rem]">{fw.released}</dd></div>{/if}
    {#if runtimeLabel}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Runtime</dt><dd class="mt-1 text-[0.95rem]">{runtimeLabel}</dd></div>{/if}
    {#if fw.distribution}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Distribution</dt><dd class="mt-1 text-[0.95rem] capitalize">{fw.distribution}</dd></div>{/if}
    {#if licensing}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Licensing</dt><dd class="mt-1"><span class="inline-block rounded px-1.5 py-0.5 text-[0.78rem] font-medium {LICENSE_TYPE_META[licensing]?.tw ?? ''}">{LICENSE_TYPE_META[licensing]?.label ?? licensing}</span></dd></div>{/if}
    {#if fw.license}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">License</dt><dd class="mt-1 text-[0.95rem]">{fw.license}</dd></div>{/if}
  </div>
</dl>

{#if fw.capabilities}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Capabilities</h2>
    <CapabilityMatrix capabilities={fw.capabilities} />
  </section>
{/if}

{#if fw.roles?.length}
  <section class="mb-7">
    <h2 class="border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Node roles</h2>
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each fw.roles as r}<span class="rounded-md bg-elev2 px-2.5 py-1 text-[0.85rem]">{r}</span>{/each}
    </div>
  </section>
{/if}

{#if fw.features?.length}
  <section class="mb-7">
    <h2 class="border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Features</h2>
    <ul class="mt-3 flex flex-wrap gap-1.5">
      {#each fw.features as f}<li class="rounded-md bg-elev2 px-2.5 py-1 text-[0.85rem]">{f}</li>{/each}
    </ul>
  </section>
{/if}

{#if popularityEntries.length || verificationEntries.length || fw.verification?.notes?.length}
  <section class="mb-7 rounded-xl border border-edge bg-elev/60 px-3 py-2.5">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-[0.72rem] font-semibold tracking-wide text-dim uppercase">Project signals</h2>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted">
        {#if fw.popularity?.lastChecked}<span>popularity {fw.popularity.lastChecked}</span>{/if}
        {#if fw.verification?.lastChecked}<span>verification {fw.verification.lastChecked}</span>{/if}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      {#if popularityEntries.length}
        <dl class="flex flex-wrap gap-x-4 gap-y-1.5">
          {#each popularityEntries as item}
            <div class="inline-flex items-baseline gap-1.5">
              <dt class="text-[0.68rem] tracking-wide text-dim uppercase">{item.label}</dt>
              <dd class="text-[0.84rem] font-semibold">{formatNumber(item.value)}</dd>
            </div>
          {/each}
        </dl>
      {/if}

      {#if verificationEntries.length}
        <dl class="flex flex-wrap gap-1">
          {#each verificationEntries as item}
            <div class="rounded-md border px-1.5 py-0.5 text-[0.68rem] {boolTone(item.value)}">
              <dt class="inline">{item.label}</dt>
              <dd class="ml-1 inline font-semibold">{boolLabel(item.value)}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>

    {#if fw.verification?.notes?.length}
      <ul class="mt-2 space-y-1 border-t border-edge pt-2 text-[0.76rem] text-dim">
        {#each fw.verification.notes as note}
          <li>{note}</li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if fw.releases?.length}
  <section class="mb-7">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-1.5">
      <h2 class="text-[1.1rem] font-semibold">Releases</h2>
      {#if fw.changelogUpdatedAt}
        <span class="text-[0.72rem] text-dim">
          {fw.changelogSource === 'github' ? 'from GitHub · ' : ''}updated {fw.changelogUpdatedAt.slice(0, 10)}
        </span>
      {/if}
    </div>
    <ReleaseGroupList groups={previewGroups} openFirst={false} markFirstLatest={true} />
    {#if releaseGroups.length > PREVIEW}
      <a class="mt-3 inline-block text-[0.88rem] text-accent2 hover:underline" href="{base}/firmware/{fw.id}/releases/">
        Show all {releaseGroups.length} releases →
      </a>
    {/if}
  </section>
{/if}

{#if data.devices.length}
  <section class="mb-7">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-1.5">
      <h2 class="text-[1.1rem] font-semibold">
        Device compatibility
        <span class="ml-1 font-normal text-dim">({data.devices.length})</span>
      </h2>
      <label class="flex cursor-pointer items-center gap-1.5 text-[0.8rem] text-dim select-none">
        <input type="checkbox" bind:checked={showTargets} class="accent-accent" />
        Show build targets
      </label>
    </div>

    <!-- Per-status summary -->
    <div class="mb-3 flex flex-wrap gap-1.5">
      {#each Object.entries(statusCounts) as [status, count]}
        {@const meta = STATUS_META[status] ?? { label: status, tw: '' }}
        <span class="rounded-full px-2.5 py-0.5 text-[0.78rem] {meta.tw}">{meta.symbol ?? ''} {count} {meta.label}</span>
      {/each}
    </div>

    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-[0.9rem]">
        <thead>
          <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
            <th class="border-b border-edge px-2.5 py-2">Device</th>
            <th class="border-b border-edge px-2.5 py-2">MCU</th>
            <th class="border-b border-edge px-2.5 py-2">Radio</th>
            <th class="border-b border-edge px-2.5 py-2">Status</th>
            {#if showTargets}
              <th class="border-b border-edge px-2.5 py-2">Target</th>
              <th class="border-b border-edge px-2.5 py-2">PlatformIO board</th>
            {/if}
            <th class="border-b border-edge px-2.5 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {#each data.devices as d}
            {@const meta = STATUS_META[d.status] ?? { label: d.status, tw: '' }}
            <tr>
              <td class="border-b border-edge px-2.5 py-2 whitespace-nowrap"><a class="text-accent2 hover:underline" href="{base}/device/{d.device.id}/">{d.device.name}</a></td>
              <td class="border-b border-edge px-2.5 py-2 text-dim">{deviceMcuLabel(d.device)}</td>
              <td class="border-b border-edge px-2.5 py-2 text-dim">{deviceRadioLabel(d.device)}</td>
              <td class="border-b border-edge px-2.5 py-2">
                <span class="inline-block rounded-full px-2 py-0.5 text-[0.78rem] whitespace-nowrap {meta.tw}">{meta.symbol ?? ''} {meta.label}</span>
              </td>
              {#if showTargets}
                <td class="border-b border-edge px-2.5 py-2 font-mono text-[0.8rem] text-dim">{d.target ?? '—'}</td>
                <td class="border-b border-edge px-2.5 py-2 font-mono text-[0.8rem] text-dim">{d.platformio_board ?? '—'}</td>
              {/if}
              <td class="border-b border-edge px-2.5 py-2 text-dim">{d.notes ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}

<RecordFooter source={fw.source} jsonPath="{base}/firmware/{fw.id}.json" />
