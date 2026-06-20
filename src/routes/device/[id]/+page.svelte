<script>
  import { base } from '$app/paths';
  import { STATUS_META, TYPE_META } from '$lib/data.js';
  let { data } = $props();
  let d = $derived(data.device);
</script>

<svelte:head><title>{d.name} — MeshCore Firmware Atlas</title></svelte:head>

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/devices/">← All devices</a>

<header class="mb-6 flex flex-wrap items-start gap-6">
  {#if d.imageUrl}
    <div class="flex h-40 w-40 shrink-0 items-center justify-center rounded-xl border border-edge bg-elev2 p-3">
      <img src={d.imageUrl} alt={d.name} class="max-h-full max-w-full object-contain" />
    </div>
  {/if}
  <div class="min-w-[240px] flex-1">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="text-[clamp(1.5rem,5vw,2rem)] font-bold">{d.name}</h1>
      {#if d.official === false}<span class="rounded-md bg-accent2/15 px-2 py-0.5 text-[0.72rem] font-bold tracking-wide text-accent2 uppercase">Community</span>{/if}
    </div>
    {#if d.vendor}
      <a class="mt-1.5 inline-flex items-center gap-1.5 text-[0.9rem] text-dim hover:text-accent" href="{base}/vendor/{d.vendor.id}/">
        {#if d.vendor.logoUrl}<img src={d.vendor.logoUrl} alt="" class="h-[22px] w-[22px] rounded object-contain" />{/if}
        {d.vendor.name}
      </a>
    {:else if d.vendorName}
      <p class="mt-1 text-dim">{d.vendorName}</p>
    {/if}
  {#if d.description}<p class="mt-1 max-w-[70ch] text-dim">{d.description}</p>{/if}
    {#if d.product_url}<a class="mt-2 inline-block text-[0.9rem] text-accent2 hover:underline" href={d.product_url} target="_blank" rel="noreferrer">Product page ↗</a>{/if}
  </div>
</header>

<dl class="mb-7 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4 rounded-xl border border-edge bg-elev p-[1.1rem]">
  <div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">MCU</dt><dd class="mt-1 text-[0.95rem]">{d.mcu ?? '—'}</dd></div>
  <div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Radio</dt><dd class="mt-1 text-[0.95rem]">{d.radio ?? '—'}</dd></div>
  {#if d.frequency_bands?.length}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Bands</dt><dd class="mt-1 text-[0.95rem]">{d.frequency_bands.join(', ')} MHz</dd></div>{/if}
  {#if d.form_factor}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Form factor</dt><dd class="mt-1 text-[0.95rem]">{d.form_factor}</dd></div>{/if}
  {#if d.display}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Display</dt><dd class="mt-1 text-[0.95rem]">{d.display}</dd></div>{/if}
  {#if d.battery}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Battery</dt><dd class="mt-1 text-[0.95rem]">{d.battery}</dd></div>{/if}
  <div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">GPS</dt><dd class="mt-1 text-[0.95rem]">{d.gps ? 'Yes' : 'No'}</dd></div>
  {#if d.connectivity?.length}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Connectivity</dt><dd class="mt-1 text-[0.95rem]">{d.connectivity.join(', ')}</dd></div>{/if}
  {#if d.flasher_roles?.length}<div><dt class="text-[0.72rem] tracking-wide text-dim uppercase">Flasher roles</dt><dd class="mt-1 text-[0.95rem]">{d.flasher_roles.join(', ')}</dd></div>{/if}
</dl>

<section class="mb-7">
  <h2 class="mb-3 border-b border-edge pb-1.5 text-[1.1rem] font-semibold">Firmware support</h2>
  {#if data.firmwares.length}
    <table class="w-full border-collapse text-[0.9rem]">
      <thead>
        <tr class="text-left text-[0.78rem] tracking-wide text-dim uppercase">
          <th class="border-b border-edge px-2.5 py-2">Firmware</th>
          <th class="border-b border-edge px-2.5 py-2">Type</th>
          <th class="border-b border-edge px-2.5 py-2">Target</th>
          <th class="border-b border-edge px-2.5 py-2">Status</th>
          <th class="border-b border-edge px-2.5 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {#each data.firmwares as f}
          {@const meta = STATUS_META[f.status] ?? { label: f.status, tw: '' }}
          <tr>
            <td class="border-b border-edge px-2.5 py-2"><a class="text-accent2 hover:underline" href="{base}/firmware/{f.firmware.id}/">{f.firmware.name}</a></td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{TYPE_META[f.firmware.type]?.label ?? f.firmware.type}</td>
            <td class="border-b border-edge px-2.5 py-2 font-mono text-[0.8rem] text-dim">{f.target ?? '—'}</td>
            <td class="border-b border-edge px-2.5 py-2">
              <span class="inline-block rounded-full px-2 py-0.5 text-[0.78rem] whitespace-nowrap {meta.tw}">{meta.symbol ?? ''} {meta.label}</span>
            </td>
            <td class="border-b border-edge px-2.5 py-2 text-dim">{f.notes ?? ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="text-dim">No firmware in the atlas lists this device yet.</p>
  {/if}
</section>
