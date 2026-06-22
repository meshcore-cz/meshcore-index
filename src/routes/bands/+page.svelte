<script>
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { getDevice, deviceMcuLabel, deviceRadioLabel, deviceShortName } from '$lib/data.js';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();

  // Optional device context (?device=<id>): show whose bands we're highlighting.
  // Query params only exist client-side — this page is prerendered, where
  // accessing url.searchParams throws, so guard on `browser`.
  let device = $derived(browser ? getDevice($page.url.searchParams.get('device')) ?? null : null);
  let deviceBands = $derived(
    new Set((device?.hardware?.radios ?? []).flatMap((r) => (r.bands ?? []).map(String)))
  );

  // Make the whole row clickable, but stay out of the way of the explicit
  // links and of text selection (so copying a frequency range still works).
  function rowClick(event, key) {
    if (event.target.closest('a')) return;
    if (window.getSelection?.().toString()) return;
    goto(`${base}/devices/?band=${key}`);
  }
</script>

<Seo
  title="Frequency bands"
  description="The regional LoRa frequency bands MeshCore devices use, with their frequency ranges and how many catalogued boards support each."
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Frequency bands</h1>
<p class="mb-5 max-w-2xl text-dim">
  Regional LoRa bands a MeshCore device's radio can operate on. A network picks
  one band; only devices whose radio supports it can join. Pick a band to see
  every catalogued board that supports it.
</p>

{#if device}
  <div class="mb-5 flex items-center gap-3 rounded-xl border border-accent2/40 bg-accent2/5 p-3">
    <a
      class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-elev2 p-1 text-muted"
      href="{base}/device/{device.id}/"
    >
      {#if device.imageUrl}
        <img src={device.imageUrl} alt="" class="max-h-full max-w-full object-contain" />
      {:else}
        <span class="font-mono text-[0.6rem] text-dim">{deviceMcuLabel(device)}</span>
      {/if}
    </a>
    <div class="min-w-0 flex-1">
      <div class="text-[0.75rem] uppercase tracking-wide text-dim">Supported bands for</div>
      <a class="block truncate font-semibold hover:text-accent hover:underline" href="{base}/device/{device.id}/" title={device.name}>
        {deviceShortName(device)}
      </a>
      <div class="truncate font-mono text-[0.75rem] text-dim">
        {deviceMcuLabel(device)}{#if deviceRadioLabel(device) && deviceRadioLabel(device) !== 'Unknown'} · {deviceRadioLabel(device)}{/if}
      </div>
    </div>
    <a class="shrink-0 text-[0.8rem] text-dim hover:text-accent hover:underline" href="{base}/bands/">Clear</a>
  </div>
{/if}

<div class="overflow-hidden rounded-xl border border-edge">
  <table class="w-full border-collapse text-[0.92rem]">
    <thead>
      <tr class="border-b border-edge bg-elev2 text-left text-[0.8rem] uppercase tracking-wide text-dim">
        <th class="px-4 py-2.5 font-semibold">Region</th>
        <th class="px-4 py-2.5 font-semibold">Band</th>
        <th class="px-4 py-2.5 font-semibold">Frequency range</th>
        <th class="px-4 py-2.5 text-right font-semibold">Devices</th>
      </tr>
    </thead>
    <tbody>
      {#each data.bands as b (b.key)}
        {@const supported = deviceBands.has(b.key)}
        <tr
          class="group cursor-pointer border-b border-edge last:border-0 transition hover:bg-elev {supported ? 'bg-accent2/10' : device ? 'opacity-45' : ''}"
          onclick={(e) => rowClick(e, b.key)}
        >
          <td class="px-4 py-3 {supported ? 'border-l-2 border-accent2' : ''}">
            <a class="font-semibold text-accent2 group-hover:underline" href="{base}/devices/?band={b.key}">
              {b.region ?? b.name}
            </a>
          </td>
          <td class="px-4 py-3 font-medium">{b.name}</td>
          <td class="px-4 py-3 font-mono text-[0.85rem] text-dim">{b.range ?? '—'}</td>
          <td class="px-4 py-3 text-right tabular-nums">
            {#if b.deviceCount > 0}
              <a class="text-accent2 hover:underline" href="{base}/devices/?band={b.key}">
                {b.deviceCount}
              </a>
            {:else}
              <span class="text-muted">0</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
