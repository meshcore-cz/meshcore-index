<script>
  import { base } from '$app/paths';
  import { SITE_NAME, REPO_URL, absUrl } from '$lib/seo.js';
  import { searchOpen } from '$lib/search.js';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absUrl('/'),
    description:
      'An open catalog of the MeshCore ecosystem — networks, devices and firmwares.'
  };

  // The primary collections, in headline order. `n` is read from the
  // build-time counts so the numbers track the dataset automatically.
  const sections = [
    {
      href: '/networks/',
      label: 'Networks',
      n: data.counts.networks,
      blurb: 'Regional & national meshes — radio settings, coverage and how to join.',
      icon: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z'
    },
    {
      href: '/devices/',
      label: 'Devices',
      n: data.counts.devices,
      blurb: 'LoRa hardware that runs MeshCore — specs, radios and node roles.',
      icon: 'M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v16h6V4H9Zm2 14h2v.5h-2V18Z'
    },
    {
      href: '/firmwares/',
      label: 'Firmwares',
      n: data.counts.firmwares,
      blurb: 'The official build plus community forks and custom variants.',
      icon: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3V5Zm0 5h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Zm3 3v2h2v-2H6Zm0 4v2h2v-2H6Z'
    }
  ];

  const tools = [
    { href: '/matrix/', label: 'Compatibility matrix' },
    { href: '/device-rank/', label: 'Device ranking' },
    { href: '/compare/', label: 'Compare devices' },
    { href: '/compare-firmwares/', label: 'Compare firmwares' },
    { href: '/releases/', label: 'All releases' },
    { href: '/vendors/', label: 'Vendors' },
    { href: '/bands/', label: 'Frequency bands' }
  ];
</script>

<Seo
  description="An open catalog of the MeshCore ecosystem — the regional networks people run, the LoRa devices that join them, and the firmwares that power them."
  jsonLd={homeJsonLd}
/>

<section class="mb-8">
  <h1 class="mb-2 text-[clamp(1.8rem,6vw,2.6rem)] font-bold tracking-tight">{SITE_NAME}</h1>
  <p class="max-w-[62ch] text-[1.05rem] text-dim">
    An open catalog of the MeshCore ecosystem — the regional
    <a class="text-accent2 hover:underline" href="{base}/networks/">networks</a> people run, the LoRa
    <a class="text-accent2 hover:underline" href="{base}/devices/">devices</a> that join them, and the
    <a class="text-accent2 hover:underline" href="{base}/firmwares/">firmwares</a> that power them.
  </p>

  <button
    type="button"
    onclick={() => ($searchOpen = true)}
    class="mt-5 flex w-full max-w-[460px] items-center gap-3 rounded-xl border border-edge bg-elev px-4 py-3 text-left text-dim transition hover:border-accent hover:text-ink"
  >
    <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" stroke-linecap="round" />
    </svg>
    <span class="flex-1 text-[0.95rem]">Search networks, devices, firmwares…</span>
    <span class="hidden rounded border border-edge px-1.5 py-0.5 font-mono text-[0.72rem] sm:inline">⌘K</span>
  </button>
</section>

<section class="mb-8 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
  {#each sections as s}
    <a
      class="group flex flex-col gap-2 rounded-xl border border-edge bg-elev p-5 transition hover:-translate-y-0.5 hover:border-accent"
      href="{base}{s.href}"
    >
      <div class="flex items-center justify-between">
        <svg class="h-6 w-6 text-accent" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d={s.icon} />
        </svg>
        <span class="font-mono text-[1.4rem] font-bold tabular-nums">{s.n}</span>
      </div>
      <h2 class="text-[1.1rem] font-semibold group-hover:text-accent">{s.label}</h2>
      <p class="text-[0.85rem] text-dim">{s.blurb}</p>
    </a>
  {/each}
</section>

<div class="mb-10 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4">
  <svg class="mt-0.5 h-5 w-5 shrink-0 text-warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
    <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <div class="text-[0.9rem]">
    <p class="font-semibold text-ink">Work in progress</p>
    <p class="mt-1 text-dim">
      This site is brand new and data is still being ingested, so entries may be incomplete or
      incorrect. We'd appreciate any corrections — please open an
      <a class="text-accent2 hover:underline" href="{REPO_URL}/issues" target="_blank" rel="noreferrer">issue</a>
      or
      <a class="text-accent2 hover:underline" href="{REPO_URL}/pulls" target="_blank" rel="noreferrer">pull request</a>
      on GitHub.
    </p>
  </div>
</div>

<section>
  <h2 class="mb-3 text-[1.1rem] font-semibold">Tools</h2>
  <div class="flex flex-wrap gap-2">
    {#each tools as t}
      <a
        class="rounded-lg border border-edge bg-elev px-3.5 py-2 text-[0.9rem] text-dim transition hover:border-accent hover:text-ink"
        href="{base}{t.href}"
      >
        {t.label}
      </a>
    {/each}
  </div>
</section>
