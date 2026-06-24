<script>
  import { base } from '$app/paths';
  import { SITE_NAME, REPO_URL, absUrl } from '$lib/seo.js';
  import { searchOpen } from '$lib/search.js';
  import Seo from '$lib/Seo.svelte';
  import Button from '$lib/Button.svelte';
  import Card from '$lib/Card.svelte';
  import ShortcutHint from '$lib/ShortcutHint.svelte';
  import { COLLECTIONS, HOME_COLLECTIONS } from '$lib/collections.js';
  import { HOME_TOOL_IDS, TOOLS, toolHomeLabel } from '$lib/tools.js';
  let { data } = $props();

  const homeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absUrl('/'),
    description:
      'An open catalog of the MeshCore ecosystem — networks, software, devices and firmwares.'
  };

  // The primary collections, in headline order. `n` is read from the
  // build-time counts so the numbers track the dataset automatically.
  let sections = $derived(
    HOME_COLLECTIONS.map((c) => ({
      ...c,
      n: data.counts[c.id]
    }))
  );

  const tools = [
    ...HOME_TOOL_IDS.map((id) => ({
      href: TOOLS[id].href,
      label: toolHomeLabel(id),
      icon: TOOLS[id].icon
    })),
    {
      href: COLLECTIONS.vendors.href,
      label: COLLECTIONS.vendors.label,
      icon: COLLECTIONS.vendors.icon
    }
  ];
</script>

<Seo
  description="An open catalog of the MeshCore ecosystem — the regional networks people run, the LoRa devices that join them, the firmwares that power them, and the software that connects it all."
  jsonLd={homeJsonLd}
/>

<section class="mb-8">
  <h1 class="mb-2 text-[clamp(1.8rem,6vw,2.6rem)] font-bold tracking-tight">{SITE_NAME}</h1>
  <p class="max-w-[62ch] text-[1.05rem] text-dim">
    An open catalog of the MeshCore ecosystem — the regional
    <a class="text-accent2 hover:underline" href="{base}/networks/">networks</a> people run, the LoRa
    <a class="text-accent2 hover:underline" href="{base}/devices/">devices</a> that join them, the
    <a class="text-accent2 hover:underline" href="{base}/firmwares/">firmwares</a> that power them, and the
    <a class="text-accent2 hover:underline" href="{base}/software/">software</a> that connects it all.
  </p>

  <Button
    variant=""
    size="none"
    onclick={() => ($searchOpen = true)}
    class="mt-5 w-full max-w-[460px] gap-3 rounded-xl border border-edge bg-bg px-4 py-3 text-left text-dim hover:border-accent hover:text-ink"
  >
    <svg class="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" stroke-linecap="round" />
    </svg>
    <span class="flex-1 text-[0.95rem]">Search networks, software, devices, firmwares…</span>
    <span class="hidden rounded border border-edge px-1.5 py-0.5 text-[0.72rem] sm:inline"><ShortcutHint /></span>
  </Button>
</section>

<section class="mb-8 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
  {#each sections as s}
    {@const Icon = s.icon}
    <Card href="{base}{s.href}" class="flex flex-col gap-2 p-5">
      <div class="flex items-center justify-between">
        <Icon class="h-6 w-6 text-accent" aria-hidden="true" />
        <span class="font-mono text-[1.4rem] font-bold tabular-nums">{s.n}</span>
      </div>
      <h2 class="text-[1.1rem] font-semibold group-hover:text-accent">{s.label}</h2>
      <p class="text-[0.85rem] text-dim">{s.blurb}</p>
    </Card>
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
      {@const Icon = t.icon}
      <a
        class="inline-flex items-center gap-2 rounded-lg border border-edge bg-elev px-3.5 py-2 text-[0.9rem] text-dim transition hover:border-accent hover:text-ink"
        href="{base}{t.href}"
      >
        <Icon class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        {t.label}
      </a>
    {/each}
  </div>
</section>
