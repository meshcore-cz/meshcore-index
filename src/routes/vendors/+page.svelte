<script>
  import { base } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
  import Avatar from '$lib/Avatar.svelte';
  let { data } = $props();
</script>

<Seo
  title="Vendors"
  description={`${data.vendors.length} hardware makers whose boards run MeshCore firmware.`}
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Vendors</h1>
<p class="mb-5 text-dim">Hardware makers whose boards run MeshCore firmware.</p>

<div class="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
  {#each data.vendors as v (v.id)}
    <a
      class="flex items-center gap-5 rounded-xl border border-edge bg-elev p-5 transition hover:-translate-y-0.5 hover:border-accent"
      href="{base}/vendor/{v.id}/"
    >
      <Avatar
        src={v.logoUrl}
        alt={v.name}
        class="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white p-2"
        imgClass="max-h-full max-w-full object-contain"
      >
        <svg class="h-10 w-10 text-slate-400" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="9" y="9" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.2" />
          <path d="M12 5v4M20 5v4M12 23v4M20 23v4M5 12h4M5 20h4M23 12h4M23 20h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.2" />
          <circle cx="16" cy="16" r="2.8" fill="currentColor" opacity="0.45" />
        </svg>
      </Avatar>
      <div class="flex flex-col">
        <h2 class="text-[1.15rem] font-semibold">{v.name}</h2>
        <span class="text-[0.9rem] text-dim">
          {v.country ? `${v.country} · ` : ''}{v.deviceCount} device{v.deviceCount === 1 ? '' : 's'}
        </span>
      </div>
    </a>
  {/each}
</div>
