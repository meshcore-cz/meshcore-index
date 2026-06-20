<script>
  import { base } from '$app/paths';
  import { STATUS_META, TYPE_META, FW_STATUS_TW, groupReleases, deviceMcuLabel, deviceRadioLabel } from '$lib/data.js';
  import ReleaseGroupList from '$lib/ReleaseGroupList.svelte';
  let { data } = $props();
  let fw = $derived(data.firmware);

  const PREVIEW = 3;
  let releaseGroups = $derived(groupReleases(fw.releases));
  let previewGroups = $derived(releaseGroups.slice(0, PREVIEW));
</script>

<svelte:head><title>{fw.name} — MeshCore Firmware Atlas</title></svelte:head>

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/">← All firmwares</a>

<header class="mb-6">
  <div class="flex flex-wrap items-center gap-3">
    <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{fw.name}</h1>
    <span class="rounded-md px-2 py-0.5 text-[0.72rem] font-bold tracking-wide uppercase {TYPE_META[fw.type]?.tw}">
      {TYPE_META[fw.type]?.label ?? fw.type}
    </span>
  </div>
  <p class="max-w-[70ch] text-dim">{fw.description}</p>
  <div class="mt-1.5 flex gap-4">
    {#if fw.repository}<a class="text-accent2 hover:underline" href={fw.repository} target="_blank" rel="noreferrer">Repository ↗</a>{/if}
    {#if fw.website}<a class="text-accent2 hover:underline" href={fw.website} target="_blank" rel="noreferrer">Website ↗</a>{/if}
  </div>
</header>

<dl class="mb-7 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 rounded-xl border border-edge bg-elev p-[1.1rem]">
  <div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Maintainer</dt><dd class="mt-1 text-[0.95rem]">{fw.maintainer}</dd></div>
  <div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Status</dt><dd class="mt-1 text-[0.95rem] {FW_STATUS_TW[fw.status] ?? ''}">{fw.status}</dd></div>
  {#if fw.latest_version}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Latest version</dt><dd class="mt-1 text-[0.95rem]">{fw.latest_version}</dd></div>{/if}
  {#if fw.lifecycle}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Lifecycle</dt><dd class="mt-1 text-[0.95rem]">{fw.lifecycle}</dd></div>{/if}
  {#if fw.maturity}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Maturity</dt><dd class="mt-1 text-[0.95rem]">{fw.maturity}</dd></div>{/if}
  {#if fw.released}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Released</dt><dd class="mt-1 text-[0.95rem]">{fw.released}</dd></div>{/if}
  {#if fw.license}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">License</dt><dd class="mt-1 text-[0.95rem]">{fw.license}</dd></div>{/if}
</dl>

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
    <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Device compatibility</h2>
    <table class="w-full border-collapse text-[0.9rem]">
      <thead>
        <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
          <th class="border-b border-edge px-2.5 py-2">Device</th>
          <th class="border-b border-edge px-2.5 py-2">MCU</th>
          <th class="border-b border-edge px-2.5 py-2">Radio</th>
          <th class="border-b border-edge px-2.5 py-2">Target</th>
          <th class="border-b border-edge px-2.5 py-2">Status</th>
          <th class="border-b border-edge px-2.5 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {#each data.devices as d}
          {@const meta = STATUS_META[d.status] ?? { label: d.status, tw: '' }}
          <tr>
            <td class="border-b border-edge px-2.5 py-2"><a class="text-accent2 hover:underline" href="{base}/device/{d.device.id}/">{d.device.name}</a></td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{deviceMcuLabel(d.device)}</td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{deviceRadioLabel(d.device)}</td>
            <td class="border-b border-edge px-2.5 py-2 font-mono text-[0.8rem] text-dim">{d.target ?? '—'}</td>
            <td class="border-b border-edge px-2.5 py-2">
              <span class="inline-block rounded-full px-2 py-0.5 text-[0.78rem] whitespace-nowrap {meta.tw}">{meta.symbol ?? ''} {meta.label}</span>
            </td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{d.notes ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
