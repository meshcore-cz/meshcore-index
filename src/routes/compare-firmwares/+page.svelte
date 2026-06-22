<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { TYPE_META, getFirmware } from '$lib/data.js';
  import { fwCompareIds } from '$lib/fwCompare.js';
  import { CAPABILITY_GROUPS } from '$lib/CapabilityMatrix.svelte';
  import Seo from '$lib/Seo.svelte';
  import Button from '$lib/Button.svelte';

  let { data } = $props();
  let byId = $derived(new Map(data.firmwares.map((f) => [f.id, f])));

  // Selection comes from the URL (sharable); the store is kept in sync. Read
  // searchParams in the browser only — they're absent during static prerender.
  let ids = $derived(
    browser ? ($page.url.searchParams.get('ids') ?? '').split(',').filter(Boolean) : []
  );
  let selected = $derived(ids.map((id) => byId.get(id)).filter(Boolean));

  let onlyDiff = $state(false);

  $effect(() => {
    fwCompareIds.set(ids);
  });

  function setIds(next) {
    const qs = next.length ? `?ids=${next.join(',')}` : '';
    goto(`${base}/compare-firmwares/${qs}`, { replaceState: true, keepFocus: true, noScroll: true });
  }
  const remove = (id) => setIds(ids.filter((x) => x !== id));

  const DASH = '—';
  const txt = (v) => (v == null || v === '' || v === 'unknown' ? DASH : String(v));
  const numberFmt = new Intl.NumberFormat('en');
  const num = (v) => (Number.isFinite(v) ? numberFmt.format(v) : DASH);
  const yesNo = (v) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : DASH);

  const FRAMEWORK_LABELS = { arduino: 'Arduino', zephyr: 'Zephyr', 'esp-idf': 'ESP-IDF', other: 'Other' };
  const LANGUAGE_LABELS = { cpp: 'C++', c: 'C', rust: 'Rust' };
  const runtimeText = (f) =>
    [FRAMEWORK_LABELS[f.runtime?.framework] ?? f.runtime?.framework, LANGUAGE_LABELS[f.runtime?.language] ?? f.runtime?.language]
      .filter(Boolean)
      .join(' · ') || DASH;

  const LINEAGE_VERB = { fork: 'Fork of', reimplementation: 'Reimplementation of', upstream: 'Upstream' };
  function lineageText(f) {
    if (!f.lineage) return DASH;
    const verb = LINEAGE_VERB[f.lineage.kind] ?? '';
    const up = f.lineage.upstreamFirmwareId;
    if (f.lineage.kind === 'upstream') return 'Upstream';
    const upName = up ? getFirmware(up)?.name ?? up : '';
    return [verb, upName].filter(Boolean).join(' ') || DASH;
  }

  const SCALAR_ROWS = [
    { label: 'Type', get: (f) => TYPE_META[f.type]?.label ?? f.type },
    { label: 'Distribution', get: (f) => txt(f.distribution) },
    { label: 'Maintainer', get: (f) => txt(f.maintainer) },
    { label: 'Based on', get: lineageText },
    { label: 'Status', get: (f) => txt(f.status) },
    { label: 'Maturity', get: (f) => txt(f.maturity) },
    { label: 'Lifecycle', get: (f) => txt(f.lifecycle) },
    { label: 'Runtime', get: runtimeText },
    { label: 'License', get: (f) => txt(f.license) },
    { label: 'Latest version', get: (f) => txt(f.latest_version) },
    { label: 'Released', get: (f) => txt(f.released) },
    { label: 'Node roles', get: (f) => (f.roles ?? []).join(', ') || DASH },
    { label: 'Devices', get: (f) => String(f.deviceCount) },
    { label: 'GitHub stars', get: (f) => num(f.popularity?.githubStars) },
    { label: 'Forks', get: (f) => num(f.popularity?.githubForks) },
    { label: 'Watchers', get: (f) => num(f.popularity?.githubWatchers) },
    { label: 'Open issues', get: (f) => num(f.popularity?.githubOpenIssues) },
    { label: 'Contributors', get: (f) => num(f.popularity?.githubContributors) },
    { label: 'Release downloads', get: (f) => num(f.popularity?.releaseDownloads) },
    { label: 'Latest downloads', get: (f) => num(f.popularity?.latestReleaseDownloads) },
    { label: 'Popularity checked', get: (f) => txt(f.popularity?.lastChecked) },
    { label: 'Source available', get: (f) => yesNo(f.verification?.sourceAvailable) },
    { label: 'Releases available', get: (f) => yesNo(f.verification?.releasesAvailable) },
    { label: 'Signed releases', get: (f) => yesNo(f.verification?.signedReleases) },
    { label: 'Reproducible builds', get: (f) => yesNo(f.verification?.reproducibleBuilds) },
    { label: 'CI builds', get: (f) => yesNo(f.verification?.ciBuilds) },
    { label: 'Official flasher', get: (f) => yesNo(f.verification?.officialFlasher) },
    { label: 'Documentation', get: (f) => yesNo(f.verification?.hasDocumentation) },
    { label: 'Verification checked', get: (f) => txt(f.verification?.lastChecked) }
  ];

  let scalarRows = $derived(
    SCALAR_ROWS.map((r) => {
      const values = selected.map(r.get);
      return { label: r.label, values, differs: new Set(values).size > 1 };
    }).filter((r) => !onlyDiff || r.differs)
  );

  // Capability sections: per group, one row per documented item with a tri-state
  // value (true / false / undefined) for each firmware.
  const triKey = (v) => (v === true ? 'y' : v === false ? 'n' : 'u');
  let capSections = $derived(
    CAPABILITY_GROUPS.map((g) => {
      const items = g.items
        .map(([k, label]) => {
          const values = selected.map((f) => f.capabilities?.[g.key]?.[k]);
          return { label, values, differs: new Set(values.map(triKey)).size > 1 };
        })
        // drop items no selected firmware documents, and (when filtering) equal rows
        .filter((it) => it.values.some((v) => v !== undefined) && (!onlyDiff || it.differs));
      return { label: g.label, items };
    }).filter((g) => g.items.length)
  );

  let hasAny = $derived(scalarRows.length || capSections.length);
</script>

<Seo
  title="Compare firmwares"
  description="Compare MeshCore firmwares side by side — capabilities, transports, networking, runtime and more."
  noindex
/>

<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div>
    <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">Compare firmwares</h1>
    <p class="text-dim">{selected.length} firmware{selected.length === 1 ? '' : 's'} selected.</p>
  </div>
  <a class="text-[0.9rem] text-accent2 hover:underline" href="{base}/firmwares/">+ Add firmwares</a>
</div>

{#if selected.length === 0}
  <p class="rounded-xl border border-edge bg-elev p-10 text-center text-dim">
    No firmwares selected. Go to <a class="text-accent2 hover:underline" href="{base}/firmwares/">Firmwares</a> and tick the
    compare boxes to line them up side by side.
  </p>
{:else}
  <label class="mb-3 inline-flex cursor-pointer items-center gap-2 text-[0.85rem] text-dim select-none">
    <input type="checkbox" bind:checked={onlyDiff} class="accent-accent" />
    Show only differences
  </label>

  <div class="overflow-x-auto rounded-xl border border-edge">
    <table class="w-full min-w-[600px] table-fixed border-collapse text-[0.88rem]">
      <thead>
        <tr>
          <th class="sticky left-0 z-10 w-40 min-w-40 border-b border-edge bg-elev p-3 text-left align-bottom"></th>
          {#each selected as f (f.id)}
            <th class="border-b border-l border-edge bg-elev p-3 text-left align-top">
              <div class="flex items-start justify-between gap-2">
                <a href="{base}/firmware/{f.id}/" class="group block">
                  <span class="mb-1.5 inline-block rounded-md px-2 py-0.5 text-[0.62rem] font-bold tracking-wide uppercase {TYPE_META[f.type]?.tw}">
                    {TYPE_META[f.type]?.label ?? f.type}
                  </span>
                  <span class="block text-[0.95rem] font-semibold group-hover:text-accent">{f.name}</span>
                  {#if f.maintainer}<span class="block text-[0.78rem] font-normal text-dim">{f.maintainer}</span>{/if}
                </a>
                <Button
                  variant=""
                  size="none"
                  class="shrink-0 rounded p-1 text-dim hover:bg-elev2 hover:text-bad"
                  aria-label="Remove {f.name}"
                  onclick={() => remove(f.id)}>✕</Button>
              </div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each scalarRows as row (row.label)}
          <tr class={row.differs ? 'bg-accent/5' : ''}>
            <th class="sticky left-0 z-10 border-b border-edge bg-elev p-3 text-left text-[0.78rem] font-medium tracking-wide text-dim uppercase">
              {row.label}
            </th>
            {#each row.values as v}
              <td class="border-b border-l border-edge p-3 align-top {v === DASH ? 'text-dim' : ''}">{v}</td>
            {/each}
          </tr>
        {/each}

        {#each capSections as section (section.label)}
          <tr>
            <th
              colspan={selected.length + 1}
              class="sticky left-0 border-y border-edge bg-elev2 px-3 py-1.5 text-left text-[0.7rem] font-semibold tracking-wide text-dim uppercase"
            >
              {section.label}
            </th>
          </tr>
          {#each section.items as item (item.label)}
            <tr class={item.differs ? 'bg-accent/5' : ''}>
              <th class="sticky left-0 z-10 border-b border-edge bg-elev p-3 text-left text-[0.82rem] font-normal text-dim">
                {item.label}
              </th>
              {#each item.values as v}
                <td class="border-b border-l border-edge p-3 text-center align-top">
                  {#if v === true}
                    <span class="text-ok">✓</span>
                  {:else if v === false}
                    <span class="text-muted">✕</span>
                  {:else}
                    <span class="text-dim">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>

  {#if !hasAny}
    <p class="mt-3 text-center text-[0.85rem] text-dim">No differences across the selected firmwares.</p>
  {/if}
{/if}
