<script>
  import { base } from '$app/paths';
  import ReleaseGroupList from '$lib/ReleaseGroupList.svelte';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  let fw = $derived(data.firmware);
</script>

<Seo title={`${fw.name} releases`} description={`Full release history for ${fw.name}, a MeshCore firmware.`} />

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/firmware/{fw.id}/">← {fw.name}</a>

<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-1.5">
  <h1 class="text-[clamp(1.4rem,5vw,1.9rem)] font-bold">{fw.name} · Releases</h1>
  {#if fw.changelogUpdatedAt}
    <span class="text-[0.72rem] text-dim">
      {fw.changelogSource === 'github' ? 'from GitHub · ' : ''}updated {fw.changelogUpdatedAt.slice(0, 10)}
    </span>
  {/if}
</div>

<p class="mb-4 text-[0.85rem] text-dim">{data.groups.length} releases</p>

<ReleaseGroupList groups={data.groups} openFirst={false} />
