<script>
  import { Pagination } from 'bits-ui';
  import { ChevronLeft, ChevronRight } from '@lucide/svelte';

  /**
   * Page navigation built on bits-ui Pagination. Renders Prev / numbered pages
   * (with ellipses for long ranges) / Next, themed to the Atlas tokens.
   */
  let {
    /** Total number of items across all pages. */
    count,
    /** Items shown per page. */
    perPage = 10,
    /** @type {number} */ page = $bindable(1),
    siblingCount = 1
  } = $props();

  const btn = 'rounded-md border border-edge bg-elev px-3 py-1.5 text-[0.85rem] text-dim transition-colors enabled:hover:text-ink disabled:opacity-40';
  const numBase = 'min-w-9 rounded-md border px-3 py-1.5 text-[0.85rem] transition-colors';
  const numOn = 'border-accent bg-accent font-semibold text-bg';
  const numOff = 'border-edge bg-elev text-dim hover:text-ink';
</script>

{#if count > perPage}
<Pagination.Root {count} {perPage} {siblingCount} bind:page>
  {#snippet children({ pages })}
    <nav class="mt-5 flex flex-wrap items-center justify-center gap-1.5">
      <Pagination.PrevButton class={`${btn} flex items-center gap-1`}>
        <ChevronLeft class="size-4" /> Prev
      </Pagination.PrevButton>

      {#each pages as p (p.key)}
        {#if p.type === 'ellipsis'}
          <span class="px-2 text-dim">…</span>
        {:else}
          <Pagination.Page
            page={p}
            class={`${numBase} ${p.value === page ? numOn : numOff}`}
          >
            {p.value}
          </Pagination.Page>
        {/if}
      {/each}

      <Pagination.NextButton class={`${btn} flex items-center gap-1`}>
        Next <ChevronRight class="size-4" />
      </Pagination.NextButton>
    </nav>
  {/snippet}
</Pagination.Root>
{/if}
