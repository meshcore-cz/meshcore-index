<script>
  import { base } from '$app/paths';
  import RecordFooter from '$lib/RecordFooter.svelte';
  import { deviceMcuLabel, deviceRadioLabel, resolveRefs } from '$lib/data.js';
  import { clampDescription, abs, absUrl, ogImageFor } from '$lib/seo.js';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();
  let v = $derived(data.vendor);

  let vendorDescription = $derived(
    clampDescription(
      v.description ||
        `${v.name}${v.country ? ` (${v.country})` : ''} — ${data.devices.length} MeshCore-compatible device${data.devices.length === 1 ? '' : 's'}.`
    )
  );
  let vendorJsonLd = $derived({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: v.name,
    ...(v.logoUrl ? { logo: abs(v.logoUrl) } : {}),
    url: v.url ?? absUrl(`/vendor/${v.id}/`)
  });
</script>

<Seo title={v.name} description={vendorDescription} image={ogImageFor('vendor', v.id)} jsonLd={vendorJsonLd} />

<a class="mb-4 inline-block text-[0.9rem] text-dim hover:underline" href="{base}/vendors/">← All vendors</a>

<header class="mb-7 flex flex-wrap items-center gap-6">
  <div class="flex h-[128px] w-[128px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white p-3.5">
    {#if v.logoUrl}
      <img src={v.logoUrl} alt={v.name} class="max-h-full max-w-full object-contain" />
    {:else}
      <svg class="h-16 w-16 text-slate-400" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="9" y="9" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.2" />
        <path d="M12 5v4M20 5v4M12 23v4M20 23v4M5 12h4M5 20h4M23 12h4M23 20h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2" />
        <circle cx="16" cy="16" r="2.8" fill="currentColor" opacity="0.45" />
      </svg>
    {/if}
  </div>
  <div class="min-w-[240px] flex-1">
    <h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">{v.name}</h1>
    {#if v.description}<p class="mb-1 max-w-[70ch] text-dim">{v.description}</p>{/if}
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[0.92rem]">
      {#if v.country}<span class="text-dim">{v.country}</span>{/if}
      {#if v.website}<a class="text-accent2 hover:underline" href={v.website} target="_blank" rel="noreferrer">{v.website} ↗</a>{/if}
      {#each resolveRefs(v.refs) as ref}
        <a class="text-accent2 hover:underline" href={ref.url} target="_blank" rel="noreferrer">{ref.name} ↗</a>
      {/each}
    </div>
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
            <span class="block font-mono text-[0.76rem] text-dim">{deviceMcuLabel(d)} · {deviceRadioLabel(d)}</span>
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <p class="mt-3 text-dim">No devices recorded for this vendor yet.</p>
  {/if}
</section>

<RecordFooter source={v.source} jsonPath="{base}/vendor/{v.id}.json" />
