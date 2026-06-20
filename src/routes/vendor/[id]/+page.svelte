<script>
  import { base } from '$app/paths';
  let { data } = $props();
  let v = $derived(data.vendor);
</script>

<svelte:head><title>{v.name} — MeshCore Firmware Atlas</title></svelte:head>

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/vendors/">← All vendors</a>

<header class="mb-7 flex flex-wrap items-center gap-5">
  <div class="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elev2">
    {#if v.logoUrl}<img src={v.logoUrl} alt={v.name} class="h-full w-full object-contain" />{/if}
  </div>
  <div class="min-w-[240px] flex-1">
    <h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">{v.name}</h1>
    {#if v.description}<p class="mb-1 max-w-[70ch] text-dim">{v.description}</p>{/if}
    {#if v.website}<a class="text-accent2 hover:underline" href={v.website} target="_blank" rel="noreferrer">{v.website} ↗</a>{/if}
  </div>
</header>

<section class="mb-7">
  <h2 class="border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Devices ({data.devices.length})</h2>
  {#if data.devices.length}
    <div class="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {#each data.devices as d (d.id)}
        <a class="flex items-center gap-3 rounded-xl border border-edge bg-elev px-3.5 py-2.5 hover:border-accent" href="{base}/device/{d.id}/">
          <div class="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elev2">
            {#if d.imageUrl}<img src={d.imageUrl} alt={d.name} loading="lazy" class="max-h-full max-w-full object-contain" />{/if}
          </div>
          <div>
            <span class="block text-[0.9rem]">{d.name}</span>
            <span class="block font-mono text-[0.76rem] text-dim">{d.mcu}{d.radio ? ' · ' + d.radio : ''}</span>
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <p class="mt-3 text-dim">No devices recorded for this vendor yet.</p>
  {/if}
</section>
