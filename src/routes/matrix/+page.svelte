<script>
  import { base } from '$app/paths';
  import { STATUS_META, TYPE_META } from '$lib/data.js';
  let { data } = $props();
</script>

<svelte:head><title>Compatibility Matrix — MeshCore Firmware Atlas</title></svelte:head>

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

<div class="overflow-x-auto rounded-xl border border-edge">
  <table class="w-full border-collapse">
    <thead>
      <tr>
        <th class="border-b border-edge px-3.5 py-2.5 text-left align-bottom text-[0.8rem] text-dim">Device</th>
        {#each data.firmwares as fw}
          <th class="border-b border-l border-edge px-3 py-2.5 text-center align-bottom whitespace-nowrap">
            <a class="block text-[0.9rem] font-semibold text-accent2 hover:underline" href="{base}/firmware/{fw.id}/">{fw.name}</a>
            <span class="mt-0.5 block text-[0.66rem] font-medium tracking-wide text-dim uppercase">{TYPE_META[fw.type]?.label ?? fw.type}</span>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each data.rows as row}
        <tr class="group">
          <th class="sticky left-0 border-b border-edge bg-elev px-3.5 py-1.5 text-left font-medium group-hover:bg-elev2">
            <a class="flex items-center gap-2.5 text-[0.88rem] hover:text-accent" href="{base}/device/{row.device.id}/">
              {#if row.device.imageUrl}<img src={row.device.imageUrl} alt="" class="h-[26px] w-[26px] shrink-0 rounded bg-elev2 object-contain p-0.5" />{/if}
              <span>{row.device.name}</span>
            </a>
          </th>
          {#each data.firmwares as fw}
            {@const cell = row.cells[fw.id]}
            {@const meta = cell ? STATUS_META[cell.status] : null}
            <td
              class="w-[110px] min-w-[90px] cursor-default border-b border-l border-edge text-center text-base {meta
                ? meta.cell
                : 'text-edge'}"
              title={cell ? `${meta?.label}${cell.notes ? ' — ' + cell.notes : ''}` : 'No data'}
            >
              {meta ? meta.symbol : '·'}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
