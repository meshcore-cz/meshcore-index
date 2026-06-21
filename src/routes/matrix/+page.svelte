<script>
  import { base } from '$app/paths';
  import { STATUS_META, TYPE_META } from '$lib/data.js';
  import { favoriteIds } from '$lib/favorites.js';
  import Seo from '$lib/Seo.svelte';
  let { data } = $props();

  // Track the hovered cell so we can highlight its whole row + column for
  // orientation. -1 means nothing hovered.
  let hoverRow = $state(-1);
  let hoverCol = $state(-1);

  // Translucent overlay that tints a cell regardless of its own background
  // (status cells already carry a bg-*/15). Used for the hovered cross.
  const HL = 'shadow-[inset_0_0_0_999px_rgba(127,127,127,0.14)]';

  // Persistent, subtler amber tint marking favourite-device rows (ties to the ★).
  // Hover highlight takes precedence over it.
  const FAV_HL = 'shadow-[inset_0_0_0_999px_rgba(251,191,36,0.07)]';

  function clearHover() {
    hoverRow = -1;
    hoverCol = -1;
  }
</script>

<Seo
  title="Compatibility Matrix"
  description={`Device × firmware support across ${data.rows.length} devices and ${data.firmwares.length} MeshCore firmwares — at a glance.`}
/>

<h1 class="mb-1 text-[clamp(1.5rem,5vw,2rem)] font-bold">Compatibility matrix</h1>
<p class="mb-4 max-w-[60ch] text-dim">
  Device × firmware support across all {data.rows.length} devices. A dot means no
  firmware lists that board yet. Hover a cell for notes.
</p>

<div class="mb-5 flex flex-wrap gap-2">
  {#each Object.values(STATUS_META) as meta}
    <span class="rounded-full px-2.5 py-0.5 text-[0.78rem] {meta.tw}">{meta.symbol} {meta.label}</span>
  {/each}
</div>

<!-- Scrolls in both axes inside a capped height so the firmware header row can
     stick to the top (and the Device column to the left) while scrolling. -->
<!-- On wide screens, break out of the layout's max-w-[1100px] column so the
     matrix can use the full viewport width (centred via left-1/2 + translate). -->
<div
  class="max-h-[calc(100vh-180px)] overflow-auto rounded-xl border border-edge xl:relative xl:left-1/2 xl:w-[min(1600px,94vw)] xl:max-w-none xl:-translate-x-1/2"
  onmouseleave={clearHover}
  role="grid"
  tabindex="-1"
>
  <!-- Fixed layout so every firmware column is the same width regardless of name
       length. Firmware names are rotated vertical so columns stay tight; an
       instant CSS tooltip (no native-title delay) shows the full name + type on
       hover, so you don't have to tilt your head. Fills the container when it
       fits; grows past it (scrolling) only when there are enough firmwares. -->
  <table class="table-fixed border-collapse" style="width: max(100%, {180 + data.firmwares.length * 46}px);">
    <thead>
      <tr>
        <th class="sticky top-0 left-0 z-30 w-[180px] border-b border-edge bg-elev px-3.5 py-2.5 text-left align-bottom text-[0.8rem] text-dim">Device</th>
        {#each data.firmwares as fw, fi}
          <th
            class="group sticky top-0 z-20 h-[150px] w-[46px] border-b border-l border-edge bg-elev p-0 text-center align-bottom {fi === hoverCol ? HL : ''}"
            onmouseenter={() => { hoverCol = fi; hoverRow = -1; }}
          >
            <a
              class="mx-auto inline-block rotate-180 pb-2.5 text-[0.78rem] leading-[1.05] font-semibold text-accent2 [writing-mode:vertical-rl] hover:underline"
              href="{base}/firmware/{fw.id}/"
            >{fw.name}</a>
            <!-- Instant tooltip, anchored below the header so it isn't clipped
                 by the table's horizontal scroll container. -->
            <span
              class="pointer-events-none absolute top-full left-1/2 z-30 hidden -translate-x-1/2 translate-y-1 rounded-md border border-edge bg-elev2 px-2 py-1 text-[0.72rem] font-medium whitespace-nowrap text-ink shadow-lg group-hover:block"
            >
              {fw.name} · <span class="text-dim">{TYPE_META[fw.type]?.label ?? fw.type}</span>
            </span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each data.rows as row, ri}
        {@const isFav = $favoriteIds.includes(row.device.id)}
        <tr class="group">
          <th
            class="sticky left-0 z-10 border-b border-edge bg-elev px-3.5 py-1.5 text-left font-medium group-hover:bg-elev2 {ri === hoverRow ? HL : isFav ? FAV_HL : ''} {isFav ? 'border-l-2 border-l-accent' : ''}"
            onmouseenter={() => { hoverRow = ri; hoverCol = -1; }}
          >
            <a class="flex items-center gap-2.5 text-[0.88rem] hover:text-accent" href="{base}/device/{row.device.id}/">
              <span class="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded bg-elev2 p-0.5 text-muted">
                {#if row.device.imageUrl}
                  <img src={row.device.imageUrl} alt="" class="max-h-full max-w-full object-contain" />
                {:else}
                  <svg aria-hidden="true" viewBox="0 0 24 24" class="h-[17px] w-[17px]">
                    <rect x="7" y="4" width="10" height="16" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
                    <path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                  </svg>
                {/if}
              </span>
              <span class={isFav ? 'font-semibold text-accent' : ''}>{row.device.name}</span>
              {#if isFav}
                <span class="text-[0.85rem] text-amber-400" title="Favourite device" aria-label="Favourite">★</span>
              {/if}
            </a>
          </th>
          {#each data.firmwares as fw, fi}
            {@const cell = row.cells[fw.id]}
            {@const meta = cell ? STATUS_META[cell.status] : null}
            <td
              class="cursor-default border-b border-l border-edge text-center text-base {meta
                ? meta.cell
                : 'text-edge'} {ri === hoverRow || fi === hoverCol ? HL : isFav ? FAV_HL : ''}"
              title={cell ? `${meta?.label}${cell.target ? ' · ' + cell.target : ''}${cell.notes ? ' — ' + cell.notes : ''}` : 'No data'}
              onmouseenter={() => { hoverRow = ri; hoverCol = fi; }}
            >
              {meta ? meta.symbol : '·'}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
