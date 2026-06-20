<script>
  import { base } from '$app/paths';
  let { data } = $props();
</script>

<svelte:head><title>Vendors — MeshCore Firmware Atlas</title></svelte:head>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Vendors</h1>
<p class="mb-5 text-dim">Hardware makers whose boards run MeshCore firmware.</p>

<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
  {#each data.vendors as v (v.id)}
    <a
      class="flex items-center gap-3.5 rounded-xl border border-edge bg-elev p-4 transition hover:-translate-y-0.5 hover:border-accent"
      href="{base}/vendor/{v.id}/"
    >
      <div class="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-elev2">
        {#if v.logoUrl}<img src={v.logoUrl} alt={v.name} class="h-full w-full object-contain" />{/if}
      </div>
      <div class="flex flex-col">
        <h2 class="text-[1.05rem] font-semibold">{v.name}</h2>
        <span class="text-[0.82rem] text-dim">{v.deviceCount} device{v.deviceCount === 1 ? '' : 's'}</span>
      </div>
    </a>
  {/each}
</div>
