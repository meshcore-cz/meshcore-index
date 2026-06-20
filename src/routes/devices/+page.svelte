<script>
  import { base } from '$app/paths';
  let { data } = $props();

  let query = $state('');

  let filtered = $derived(
    data.devices.filter((d) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        (d.vendorName ?? '').toLowerCase().includes(q) ||
        (d.mcu ?? '').toLowerCase().includes(q) ||
        (d.radio ?? '').toLowerCase().includes(q)
      );
    })
  );
</script>

<svelte:head><title>Devices — MeshCore Firmware Atlas</title></svelte:head>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Devices</h1>
<p class="mb-4 text-dim">Hardware known to run one or more MeshCore firmwares.</p>

<input
  type="search"
  placeholder="Search devices, vendor, MCU, radio…"
  bind:value={query}
  class="w-full rounded-lg border border-edge bg-elev px-3 py-2.5 text-[0.95rem] outline-none focus:border-transparent focus:ring-2 focus:ring-accent"
/>
<p class="my-3 text-[0.85rem] text-dim">{filtered.length} device{filtered.length === 1 ? '' : 's'}</p>

<div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
  {#each filtered as d (d.id)}
    <a
      class="flex flex-col gap-2 rounded-xl border border-edge bg-elev p-[1.1rem] transition hover:-translate-y-0.5 hover:border-accent"
      href="{base}/device/{d.id}/"
    >
      <div class="mb-0.5 flex h-[110px] items-center justify-center overflow-hidden rounded-lg bg-elev2">
        {#if d.imageUrl}
          <img src={d.imageUrl} alt={d.name} loading="lazy" class="max-h-full max-w-full object-contain p-2" />
        {:else}
          <span class="font-mono text-[0.8rem] text-dim">{d.mcu}</span>
        {/if}
      </div>
      <h2 class="text-[1.05rem] font-semibold">{d.name}</h2>
      {#if d.vendorName}<span class="text-[0.82rem] text-dim">{d.vendorName}</span>{/if}
      <dl class="mt-1 flex flex-wrap gap-5">
        <div><dt class="text-[0.68rem] tracking-wide text-dim uppercase">MCU</dt><dd class="mt-0.5 font-mono text-[0.85rem]">{d.mcu ?? '—'}</dd></div>
        <div><dt class="text-[0.68rem] tracking-wide text-dim uppercase">Radio</dt><dd class="mt-0.5 font-mono text-[0.85rem]">{d.radio ?? '—'}</dd></div>
        {#if d.gps}<div><dt class="text-[0.68rem] tracking-wide text-dim uppercase">GPS</dt><dd class="mt-0.5 font-mono text-[0.85rem]">Yes</dd></div>{/if}
      </dl>
      <div class="mt-auto border-t border-edge pt-2.5 text-[0.8rem] text-dim">
        {d.firmwareCount} firmware{d.firmwareCount === 1 ? '' : 's'}
      </div>
    </a>
  {/each}
</div>
