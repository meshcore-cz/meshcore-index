<script>
  // Shared software catalogue: search box, kind-filter chips and the grouped
  // card grid. `activeKind` comes from the route (/software/ or /software/<kind>/)
  // so each filtered view is its own prerendered page — no post-hydration flicker.
  // The free-text query stays client-side and is mirrored to `?q=`.
  import { base } from '$app/paths';
  import { SOFTWARE_KIND_META, softwareKindsInUse, LICENSE_TYPE_META, licenseType, descriptionToPlain } from '$lib/data.js';
  import { displayVersion, relativeTime, fullDateTime, releaseFreshnessTone } from '$lib/format.js';
  import PageHeader from '$lib/PageHeader.svelte';
  import Card from '$lib/Card.svelte';
  import SoftwareIcon from '$lib/SoftwareIcon.svelte';
  import PlatformIcon from '$lib/PlatformIcon.svelte';
  import ProgrammingLanguageIcon from '$lib/ProgrammingLanguageIcon.svelte';
  import { uniquePlatformsForIcons, platformMeta } from '$lib/platforms.js';
  import { programmingLanguageLabel } from '$lib/programming-languages.js';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let { software, activeKind = 'all' } = $props();

  const kinds = softwareKindsInUse();

  // Free-text query is mirrored to `?q=`. It starts empty so the first client
  // render matches the prerendered HTML; the URL is read in onMount, after
  // hydration — reading it at init would diverge and corrupt hydration.
  let query = $state('');
  let hydrated = $state(false);

  onMount(() => {
    query = new URLSearchParams(location.search).get('q') ?? '';
    hydrated = true;
  });

  $effect(() => {
    if (!browser || !hydrated) return;
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  });

  // Compact star count: 1240 → "1.2k", 980 → "980".
  function fmtStars(n) {
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  // Lowercased searchable blob per item; matches name, aliases, description,
  // tags, languages, platforms and maintainers — same fields as the Cmd+K index.
  function searchText(s) {
    return [
      s.name,
      s.short_name,
      ...(s.also_known_as ?? []),
      descriptionToPlain(s.description),
      ...(s.tags ?? []),
      ...(s.languages ?? []),
      ...(s.platforms ?? []),
      ...(s.maintainers ?? []).map((m) => m.name)
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function softwareStars(s) {
    return s.popularity?.githubStars ?? -1;
  }

  let filtered = $derived(
    software.filter((s) => {
      if (activeKind !== 'all' && s.kind !== activeKind) return false;
      const q = query.trim().toLowerCase();
      return !q || searchText(s).includes(q);
    })
  );

  let groups = $derived(
    kinds
      .map((k) => ({
        kind: k,
        meta: SOFTWARE_KIND_META[k],
        items: filtered.filter((s) => s.kind === k).sort((a, b) => softwareStars(b) - softwareStars(a))
      }))
      .filter((g) => g.items.length)
  );
</script>

<PageHeader collection="software" subtitleClass="max-w-[75ch]">
  MeshCore-related software — clients, integrations, gateways &amp; bridges, monitoring &amp;
  management, utilities, bots and libraries. Filter by kind or search.
</PageHeader>

<!-- Search -->
<input
  type="search"
  placeholder="Search software, tags, languages, maintainers…"
  bind:value={query}
  class="mb-3 w-full rounded-lg border border-edge bg-bg px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
/>

<!-- Kind filter — links so each view is its own prerendered route. -->
<div class="mb-7 flex flex-wrap gap-1.5">
  <a
    href="{base}/software/"
    class="rounded-md border px-2.5 py-1 text-[0.78rem] font-medium transition {activeKind === 'all'
      ? 'border-accent bg-accent/15 text-accent'
      : 'border-edge text-dim hover:text-ink'}"
  >All <span class="text-dim">({software.length})</span></a>
  {#each kinds as k (k)}
    <a
      href="{base}/software/{k}/"
      class="rounded-md border px-2.5 py-1 text-[0.78rem] font-medium transition {activeKind === k
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-edge text-dim hover:text-ink'}"
    >{SOFTWARE_KIND_META[k].label}</a>
  {/each}
</div>

{#if groups.length}
  {#each groups as g (g.kind)}
    <section class="mb-9">
      <h2 class="mb-3 flex items-baseline gap-2 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">
        {g.meta.label}
        <span class="text-[0.85rem] font-normal text-dim">{g.items.length}</span>
      </h2>
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
        {#each g.items as s (s.id)}
          {@const licensing = licenseType(s)}
          {@const isLibrary = s.kind === 'library'}
          <Card href="{base}/software/{s.id}/" class="flex flex-col p-4">
            <div class="flex items-start justify-between gap-2">
              <span class="flex min-w-0 gap-2">
                <SoftwareIcon
                  src={s.imageUrl}
                  name={s.name}
                  kind={s.kind}
                  class="h-10 w-10 rounded-md"
                />
                <span class="min-w-0">
                  <span class="font-semibold group-hover:text-accent">{s.name}</span>
                  {#if s.short_name && s.short_name !== s.name}
                    <span class="block font-mono text-[0.74rem] text-dim">{s.short_name}</span>
                  {/if}
                </span>
              </span>
              <span class="flex shrink-0 flex-col items-end gap-1">
                <!-- Libraries & SDKs are an exception: they surface the concrete
                     license and the programming languages, where other kinds show
                     the licensing class and the platforms. -->
                {#if isLibrary && s.license}
                  <span class="rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium whitespace-nowrap {LICENSE_TYPE_META[licensing]?.tw ?? 'bg-elev2 text-dim'}" title={LICENSE_TYPE_META[licensing]?.label ?? ''}>
                    {s.license}
                  </span>
                {:else if licensing}
                  <span class="rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium whitespace-nowrap {LICENSE_TYPE_META[licensing]?.tw ?? ''}">
                    {LICENSE_TYPE_META[licensing]?.label ?? licensing}
                  </span>
                {/if}
                {#if isLibrary}
                  {#if s.languages?.length}
                    <span class="flex flex-wrap justify-end gap-1.5">
                      {#each s.languages.slice(0, 3) as l (l)}
                        <ProgrammingLanguageIcon language={l} size={16} />
                      {/each}
                      {#if s.languages.length > 3}
                        <span class="self-center font-mono text-[0.6rem] text-dim" title={s.languages.map((l) => programmingLanguageLabel(l)).join(', ')}>+{s.languages.length - 3}</span>
                      {/if}
                    </span>
                  {/if}
                {:else if s.platforms?.length}
                  {@const iconPlatforms = uniquePlatformsForIcons(s.platforms)}
                  <span class="flex flex-wrap justify-end gap-1.5">
                    {#each iconPlatforms.slice(0, 3) as p (p)}
                      <PlatformIcon platform={p} class="opacity-75" />
                    {/each}
                    {#if iconPlatforms.length > 3}
                      <span class="self-center font-mono text-[0.6rem] text-dim" title={s.platforms.map((p) => platformMeta(p).label).join(', ')}>+{iconPlatforms.length - 3}</span>
                    {/if}
                  </span>
                {/if}
              </span>
            </div>
            {#if s.description}
              <p class="mt-1.5 line-clamp-3 text-[0.85rem] text-dim">{descriptionToPlain(s.description)}</p>
            {/if}
            {#if s.tags?.length}
              <div class="my-2.5 flex flex-wrap gap-1">
                {#each s.tags as t (t)}
                  <span class="rounded-full bg-elev2 px-1.5 py-0.5 font-mono text-[0.66rem] text-dim">#{t}</span>
                {/each}
              </div>
            {/if}

            <!-- Popularity / freshness footer: stars, latest version + when, and
                 the lead maintainer. Each piece is optional, so the row hides
                 entirely when a record has none of them. -->
            {@const stars = s.popularity?.githubStars}
            {@const author = s.maintainers?.[0]?.name}
            {#if stars != null || s.latest_version || author}
              <div class="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge/60 pt-2.5 text-[0.72rem] text-dim">
                {#if stars != null}
                  <span class="inline-flex items-center gap-1" title="{stars.toLocaleString()} GitHub stars">
                    <svg class="h-3.5 w-3.5 text-warn" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="m12 2 2.9 6.3 6.8.7-5 4.6 1.4 6.7L12 17.8 5.9 20.3l1.4-6.7-5-4.6 6.8-.7L12 2Z" />
                    </svg>
                    <span class="tabular-nums">{fmtStars(stars)}</span>
                  </span>
                {/if}
                {#if s.latest_version}
                  <span class="inline-flex items-center gap-1" title={s.released ? `Released ${fullDateTime(s.released)}` : ''}>
                    <span class="font-mono text-ink/80">{displayVersion(s.latest_version)}</span>
                    {#if s.released}<span class="text-dim/80">· <span class={releaseFreshnessTone(s.released)}>{relativeTime(s.released)}</span></span>{/if}
                  </span>
                {/if}
                {#if author}
                  <span class="inline-flex min-w-0 items-center gap-1">
                    <svg class="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <circle cx="12" cy="8" r="3.2" /><path d="M5 20a7 7 0 0 1 14 0" stroke-linecap="round" />
                    </svg>
                    <span class="truncate">{author}{s.maintainers.length > 1 ? ` +${s.maintainers.length - 1}` : ''}</span>
                  </span>
                {/if}
              </div>
            {/if}
          </Card>
        {/each}
      </div>
    </section>
  {/each}
{:else}
  <p class="text-dim">No software matches these filters.</p>
{/if}
