<script>
  import { base } from '$app/paths';
  import { SOFTWARE_KIND_META, softwareKindsInUse, LICENSE_TYPE_META, licenseType, descriptionToPlain } from '$lib/data.js';
  import Seo from '$lib/Seo.svelte';
  import PageHeader from '$lib/PageHeader.svelte';
  import Card from '$lib/Card.svelte';
  import SoftwareIcon from '$lib/SoftwareIcon.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  let { data } = $props();

  const kinds = softwareKindsInUse();
  const allTags = [...new Set(data.software.flatMap((s) => s.tags ?? []))].sort();

  // Filter state is synced to / from the URL so a filtered view is shareable and
  // bookmarkable (matching Devices/Firmwares/Networks). It starts at its defaults
  // so the first client render matches the prerendered (unfiltered) HTML; the URL
  // is read in onMount, after hydration — reading it at init would diverge from
  // the prerendered list and corrupt hydration.
  let query = $state('');
  let activeKind = $state('all');
  let activeTags = $state([]);
  let hydrated = $state(false);

  onMount(() => {
    const p = new URLSearchParams(location.search);
    query = p.get('q') ?? '';
    const kind = p.get('kind');
    if (kind && kinds.includes(kind)) activeKind = kind;
    activeTags = (p.get('tags') ?? '').split(',').filter((t) => allTags.includes(t));
    hydrated = true;
  });

  $effect(() => {
    // Wait until onMount has applied the URL → state, or the first run would
    // immediately overwrite the incoming query string with empty defaults.
    if (!browser || !hydrated) return;
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (activeKind !== 'all') p.set('kind', activeKind);
    if (activeTags.length) p.set('tags', activeTags.join(','));
    const qs = p.toString();
    history.replaceState(history.state, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  });

  function toggleTag(t) {
    activeTags = activeTags.includes(t) ? activeTags.filter((x) => x !== t) : [...activeTags, t];
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

  let filtered = $derived(
    data.software.filter((s) => {
      if (activeKind !== 'all' && s.kind !== activeKind) return false;
      if (!activeTags.every((t) => (s.tags ?? []).includes(t))) return false;
      const q = query.trim().toLowerCase();
      return !q || searchText(s).includes(q);
    })
  );

  let groups = $derived(
    kinds
      .map((k) => ({ kind: k, meta: SOFTWARE_KIND_META[k], items: filtered.filter((s) => s.kind === k) }))
      .filter((g) => g.items.length)
  );
</script>

<Seo
  title="Software"
  description={`${data.software.length} MeshCore clients, integrations, gateways, tools, libraries and network apps.`}
/>

<PageHeader title="Software" subtitleClass="max-w-[75ch]">
  MeshCore-related software — clients, integrations, gateways &amp; bridges, tools, libraries and
  apps that run on the network. Filter by kind or tag.
</PageHeader>

<!-- Search -->
<input
  type="search"
  placeholder="Search software, tags, languages, maintainers…"
  bind:value={query}
  class="mb-3 w-full rounded-lg border border-edge bg-bg px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
/>

<!-- Kind filter -->
<div class="mb-2 flex flex-wrap gap-1.5">
  <button
    type="button"
    onclick={() => (activeKind = 'all')}
    class="rounded-md border px-2.5 py-1 text-[0.78rem] font-medium transition {activeKind === 'all'
      ? 'border-accent bg-accent/15 text-accent'
      : 'border-edge text-dim hover:text-ink'}"
  >All <span class="text-dim">({data.software.length})</span></button>
  {#each kinds as k (k)}
    <button
      type="button"
      onclick={() => (activeKind = k)}
      class="rounded-md border px-2.5 py-1 text-[0.78rem] font-medium transition {activeKind === k
        ? 'border-accent bg-accent/15 text-accent'
        : 'border-edge text-dim hover:text-ink'}"
    >{SOFTWARE_KIND_META[k].label}</button>
  {/each}
</div>

<!-- Tag filter -->
{#if allTags.length}
  <div class="mb-7 flex flex-wrap gap-1.5">
    {#each allTags as t (t)}
      <button
        type="button"
        onclick={() => toggleTag(t)}
        class="rounded-full border px-2 py-0.5 font-mono text-[0.72rem] transition {activeTags.includes(t)
          ? 'border-accent2 bg-accent2/15 text-accent2'
          : 'border-edge text-dim hover:text-ink'}"
      >#{t}</button>
    {/each}
  </div>
{/if}

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
                <span class="rounded-md px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wide uppercase {g.meta.tw}">
                  {g.meta.singular}
                </span>
                {#if licensing}
                  <span class="rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium whitespace-nowrap {LICENSE_TYPE_META[licensing]?.tw ?? ''}">
                    {LICENSE_TYPE_META[licensing]?.label ?? licensing}
                  </span>
                {/if}
              </span>
            </div>
            {#if s.description}
              <p class="mt-1.5 line-clamp-3 text-[0.85rem] text-dim">{descriptionToPlain(s.description)}</p>
            {/if}
            {#if s.tags?.length}
              <div class="mt-2.5 flex flex-wrap gap-1">
                {#each s.tags as t (t)}
                  <span class="rounded-full bg-elev2 px-1.5 py-0.5 font-mono text-[0.66rem] text-dim">#{t}</span>
                {/each}
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
