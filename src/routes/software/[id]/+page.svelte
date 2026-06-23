<script>
  import { base } from '$app/paths';
  import RecordFooter from '$lib/RecordFooter.svelte';
  import BackLink from '$lib/BackLink.svelte';
  import { SOFTWARE_KIND_META, SOFTWARE_STATUS_META, LICENSE_TYPE_META, licenseType, groupReleases, descriptionToPlain } from '$lib/data.js';
  import { clampDescription } from '$lib/seo.js';
  import Seo from '$lib/Seo.svelte';
  import ReleaseGroupList from '$lib/ReleaseGroupList.svelte';
  import ScreenshotGallery from '$lib/ScreenshotGallery.svelte';
  import RichText from '$lib/RichText.svelte';
  import SoftwareIcon from '$lib/SoftwareIcon.svelte';
  let { data } = $props();
  let s = $derived(data.software);
  let meta = $derived(SOFTWARE_KIND_META[s.kind]);

  const PREVIEW = 3;
  let releaseGroups = $derived(groupReleases(s.releases));
  let previewGroups = $derived(releaseGroups.slice(0, PREVIEW));

  const MATURITY_META = {
    experimental: { label: 'Experimental', tw: 'bg-bad/15 text-bad' },
    alpha: { label: 'Alpha', tw: 'bg-warn/15 text-warn' },
    beta: { label: 'Beta', tw: 'bg-accent2/15 text-accent2' },
    stable: { label: 'Stable', tw: 'bg-ok/15 text-ok' }
  };
  const INTERFACE_LABELS = { gui: 'GUI', mobile: 'Mobile', web: 'Web', cli: 'CLI', tui: 'TUI', api: 'API', headless: 'Headless' };
  const CONNECTION_LABELS = { ble: 'BLE', serial: 'Serial', usb: 'USB', tcp: 'TCP', udp: 'UDP', websocket: 'WebSocket', mqtt: 'MQTT', http: 'HTTP', ipc: 'IPC' };
  const CAPABILITY_LABELS = {
    messaging: 'Messaging', contacts: 'Contacts', channels: 'Channels',
    'node-configuration': 'Node configuration', 'remote-administration': 'Remote administration',
    monitoring: 'Monitoring', telemetry: 'Telemetry', 'packet-analysis': 'Packet analysis',
    mapping: 'Mapping', flashing: 'Flashing', 'firmware-update': 'Firmware update',
    automation: 'Automation', notifications: 'Notifications', bridging: 'Bridging',
    proxying: 'Proxying', 'key-management': 'Key management', simulation: 'Simulation'
  };
  const INSTALL_LABELS = {
    'app-store': 'App Store', 'play-store': 'Play Store', zapstore: 'Zapstore', 'github-release': 'GitHub release',
    docker: 'Docker', 'docker-compose': 'Docker Compose', desktop: 'Desktop app', helm: 'Kubernetes / Helm',
    'proxmox-lxc': 'Proxmox LXC', nixos: 'NixOS Flake', 'bare-metal': 'Bare metal',
    aur: 'AUR', flatpak: 'Flatpak', homebrew: 'Homebrew', npm: 'npm', pypi: 'PyPI', cargo: 'Cargo',
    'go-install': 'go install', hacs: 'HACS', esphome: 'ESPHome', source: 'Source', web: 'Web', manual: 'Manual'
  };
  const POPULARITY_LABELS = {
    githubStars: 'GitHub stars', githubForks: 'Forks', githubWatchers: 'Watchers',
    githubOpenIssues: 'Open issues', githubContributors: 'Contributors',
    releaseDownloads: 'Release downloads', latestReleaseDownloads: 'Latest downloads'
  };
  const VERIFICATION_LABELS = {
    sourceAvailable: 'Source available', releasesAvailable: 'Releases available',
    signedReleases: 'Signed releases', ciBuilds: 'CI builds', hasDocumentation: 'Documentation'
  };
  const numberFmt = new Intl.NumberFormat('en');
  const formatNumber = (v) => numberFmt.format(v);
  const boolLabel = (v) => (v ? 'Yes' : 'No');
  const boolTone = (v) => (v ? 'border-accent/40 bg-accent/10 text-accent' : 'border-edge bg-elev2 text-dim');

  let links = $derived(
    [
      s.repository ? { label: 'Repository', url: s.repository } : null,
      s.website ? { label: 'Website', url: s.website } : null,
      s.documentation ? { label: 'Documentation', url: s.documentation } : null
    ].filter(Boolean)
  );

  let maintainers = $derived(s.maintainers ?? []);
  let licensing = $derived(licenseType(s));

  let specs = $derived(
    [
      meta ? { label: 'Kind', value: meta.label } : null,
      s.maturity ? { label: 'Maturity', value: MATURITY_META[s.maturity]?.label ?? s.maturity } : null,
      maintainers.length
        ? {
            label: maintainers.length > 1 ? 'Maintainers' : 'Maintainer',
            value: maintainers.map((m) => m.name).join(', '),
            url: maintainers.length === 1 ? maintainers[0].url ?? null : null
          }
        : null,
      s.languages?.length
        ? { label: s.languages.length > 1 ? 'Languages' : 'Language', value: s.languages.join(', ') }
        : null,
      licensing ? { label: 'Licensing', value: LICENSE_TYPE_META[licensing]?.label ?? licensing, tw: LICENSE_TYPE_META[licensing]?.tw } : null,
      s.license ? { label: 'License', value: s.license } : null,
      s.latest_version
        ? { label: 'Latest version', value: s.released ? `${s.latest_version} · ${s.released}` : s.latest_version }
        : null
    ].filter(Boolean)
  );

  let chipGroups = $derived(
    [
      s.platforms?.length ? { label: 'Platforms', items: s.platforms } : null,
      s.interfaces?.length ? { label: 'Interfaces', items: s.interfaces.map((i) => INTERFACE_LABELS[i] ?? i) } : null,
      s.connections?.length ? { label: 'Connections', items: s.connections.map((c) => CONNECTION_LABELS[c] ?? c) } : null,
      s.capabilities?.length ? { label: 'Capabilities', items: s.capabilities.map((c) => CAPABILITY_LABELS[c] ?? c) } : null,
      s.node_roles?.length ? { label: 'Node roles', items: s.node_roles } : null
    ].filter(Boolean)
  );

  let screenshots = $derived((s.screenshotUrls ?? []).filter((shot) => shot.url));

  let popularityEntries = $derived(
    Object.entries(POPULARITY_LABELS)
      .map(([key, label]) => ({ key, label, value: s.popularity?.[key] }))
      .filter((item) => Number.isFinite(item.value))
  );
  let verificationEntries = $derived(
    Object.entries(VERIFICATION_LABELS)
      .map(([key, label]) => ({ key, label, value: s.verification?.[key] }))
      .filter((item) => typeof item.value === 'boolean')
  );

  let description = $derived(
    clampDescription(descriptionToPlain(s.description) || `${s.name} — a MeshCore ${meta?.singular ?? 'software'}.`)
  );
</script>

<Seo title={s.name} description={description} />

<BackLink href="{base}/software/">All software</BackLink>

<header class="mb-6 flex flex-wrap items-start gap-5">
  <SoftwareIcon src={s.imageUrl} name={s.name} kind={s.kind} class="h-24 w-24 rounded-2xl" />
  <div class="min-w-[260px] flex-1">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{s.name}</h1>
      {#if meta}
        <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {meta.tw}">
          {meta.singular}
        </span>
      {/if}
      {#if s.maturity}
        <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {MATURITY_META[s.maturity]?.tw ?? 'bg-elev2 text-dim'}">
          {MATURITY_META[s.maturity]?.label ?? s.maturity}
        </span>
      {/if}
      {#if s.status && s.status !== 'active'}
        <span class="text-[0.85rem] font-medium {SOFTWARE_STATUS_META[s.status]?.tw ?? 'text-dim'}">
          {SOFTWARE_STATUS_META[s.status]?.label ?? s.status}
        </span>
      {/if}
    </div>
    {#if s.short_name && s.short_name !== s.name}
      <p class="font-mono text-[0.85rem] text-dim">{s.short_name}</p>
    {/if}
    {#if s.also_known_as?.length}
      <p class="mt-0.5 text-[0.9rem] text-dim">{s.also_known_as.join(' · ')}</p>
    {/if}
    {#if s.description}<RichText class="mt-1 max-w-[70ch] text-dim" text={s.description} />{/if}
    {#if links.length}
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.92rem]">
        {#each links as link (link.label)}
          <a class="text-accent2 hover:underline" href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>
        {/each}
      </div>
    {/if}
  </div>
</header>

{#if screenshots.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Screenshots</h2>
    <ScreenshotGallery shots={screenshots} alt={s.name} />
  </section>
{/if}

{#if specs.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Details</h2>
    <dl class="grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
      {#each specs as spec (spec.label)}
        <div>
          <dt class="text-[0.72rem] tracking-wide text-dim uppercase">{spec.label}</dt>
          <dd class="mt-0.5 text-[0.95rem]">
            {#if spec.url}
              <a class="text-accent2 hover:underline" href={spec.url} target="_blank" rel="noreferrer">{spec.value}</a>
            {:else if spec.tw}
              <span class="inline-block rounded px-1.5 py-0.5 text-[0.78rem] font-medium {spec.tw}">{spec.value}</span>
            {:else}{spec.value}{/if}
          </dd>
        </div>
      {/each}
    </dl>
  </section>
{/if}

{#if chipGroups.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Capabilities</h2>
    <div class="space-y-3">
      {#each chipGroups as grp (grp.label)}
        <div>
          <h3 class="mb-1.5 text-[0.72rem] tracking-wide text-dim uppercase">{grp.label}</h3>
          <div class="flex flex-wrap gap-1.5">
            {#each grp.items as item (item)}
              <span class="rounded-md bg-elev2 px-2 py-0.5 text-[0.8rem]">{item}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>
{/if}

{#if s.install?.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Install</h2>
    <ul class="space-y-2">
      {#each s.install as inst (inst.type + (inst.package ?? '') + (inst.url ?? ''))}
        <li class="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-elev px-3 py-2">
          <span class="rounded-md bg-elev2 px-2 py-0.5 text-[0.72rem] font-semibold">{INSTALL_LABELS[inst.type] ?? inst.type}</span>
          {#if inst.package}<code class="font-mono text-[0.82rem]">{inst.package}</code>{/if}
          {#if inst.command}<code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.78rem] text-dim">{inst.command}</code>{/if}
          {#if inst.url}
            <a class="ml-auto text-[0.85rem] text-accent2 hover:underline" href={inst.url} target="_blank" rel="noreferrer">Open ↗</a>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if releaseGroups.length}
  <section class="mb-7">
    <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-1.5">
      <h2 class="text-[1.1rem] font-semibold">Releases</h2>
      {#if s.changelogUpdatedAt}
        <span class="text-[0.72rem] text-dim">
          {s.changelogSource === 'github' ? 'from GitHub · ' : ''}updated {s.changelogUpdatedAt.slice(0, 10)}
        </span>
      {/if}
    </div>
    <ReleaseGroupList groups={previewGroups} openFirst={false} markFirstLatest={true} />
    {#if releaseGroups.length > PREVIEW}
      <a class="mt-3 inline-block text-[0.88rem] text-accent2 hover:underline" href="{base}/software/{s.id}/releases/">
        Show all {releaseGroups.length} releases →
      </a>
    {/if}
  </section>
{/if}

{#if popularityEntries.length || verificationEntries.length || s.verification?.notes?.length}
  <section class="mb-7 rounded-xl border border-edge bg-elev/60 px-3 py-2.5">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-[0.72rem] font-semibold tracking-wide text-dim uppercase">Project signals</h2>
      <div class="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-muted">
        {#if s.popularity?.lastChecked}<span>popularity {s.popularity.lastChecked}</span>{/if}
        {#if s.verification?.lastChecked}<span>verification {s.verification.lastChecked}</span>{/if}
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      {#if popularityEntries.length}
        <dl class="flex flex-wrap gap-x-4 gap-y-1.5">
          {#each popularityEntries as item (item.key)}
            <div class="inline-flex items-baseline gap-1.5">
              <dt class="text-[0.68rem] tracking-wide text-dim uppercase">{item.label}</dt>
              <dd class="text-[0.84rem] font-semibold">{formatNumber(item.value)}</dd>
            </div>
          {/each}
        </dl>
      {/if}

      {#if verificationEntries.length}
        <dl class="flex flex-wrap gap-1">
          {#each verificationEntries as item (item.key)}
            <div class="rounded-md border px-1.5 py-0.5 text-[0.68rem] {boolTone(item.value)}">
              <dt class="inline">{item.label}</dt>
              <dd class="ml-1 inline font-semibold">{boolLabel(item.value)}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>

    {#if s.verification?.notes?.length}
      <ul class="mt-2 space-y-1 border-t border-edge pt-2 text-[0.76rem] text-dim">
        {#each s.verification.notes as note (note)}
          <li>{note}</li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

{#if s.tags?.length}
  <section class="mb-7">
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Tags</h2>
    <div class="flex flex-wrap gap-2">
      {#each s.tags as t (t)}
        <a
          href="{base}/software/"
          class="rounded-full border border-edge bg-elev px-2.5 py-1 font-mono text-[0.8rem] text-dim hover:border-accent hover:text-ink"
        >#{t}</a>
      {/each}
    </div>
  </section>
{/if}

<RecordFooter source={s.source} jsonPath="{base}/software/{s.id}.json" />
