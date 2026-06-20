<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { searchAtlas } from '$lib/data.js';

  let { open = $bindable(false) } = $props();

  let query = $state('');
  let selected = $state(0);
  let inputEl = $state(null);

  let results = $derived(searchAtlas(query));

  // Keep the highlighted row valid as the result set changes.
  $effect(() => {
    void results;
    if (selected >= results.length) selected = 0;
  });

  // Focus the field and reset state whenever the palette opens.
  $effect(() => {
    if (open) {
      query = '';
      selected = 0;
      inputEl?.focus();
    }
  });

  const TYPE_TW = {
    Device: 'text-accent',
    Firmware: 'text-accent2',
    Vendor: 'text-warn'
  };

  function close() {
    open = false;
  }

  function go(item) {
    if (!item) return;
    close();
    goto(`${base}${item.href}`);
  }

  function onkeydown(e) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length) selected = (selected + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length) selected = (selected - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[selected]);
    }
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 px-4 pt-[12vh] backdrop-blur-sm"
    role="presentation"
    onclick={close}
  >
    <!-- Palette -->
    <div
      class="w-full max-w-[640px] overflow-hidden rounded-xl border border-edge bg-elev shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Search the atlas"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center gap-3 border-b border-edge px-4">
        <svg class="h-4 w-4 shrink-0 text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" stroke-linecap="round" />
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          type="text"
          placeholder="Search…"
          autocomplete="off"
          spellcheck="false"
          class="w-full bg-transparent py-3.5 text-[1rem] outline-none placeholder:text-dim"
        />
        <button class="rounded border border-edge px-1.5 py-0.5 text-[0.7rem] text-dim hover:text-ink" onclick={close}>esc</button>
      </div>

      {#if !query.trim()}
        <p class="px-4 py-8 text-center text-[0.9rem] text-dim">Search devices, firmwares, vendors…</p>
      {:else if results.length === 0}
        <p class="px-4 py-8 text-center text-[0.9rem] text-dim">No matches for “{query}”.</p>
      {:else}
        <ul class="max-h-[60vh] overflow-y-auto py-1.5">
          {#each results as item, i (item.type + item.href + item.title)}
            <li>
              <button
                class="flex w-full items-center gap-3 px-4 py-2.5 text-left {i === selected ? 'bg-elev2' : ''}"
                onmousemove={() => (selected = i)}
                onclick={() => go(item)}
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-edge bg-bg">
                  {#if item.image}
                    <img src={item.image} alt="" class="max-h-full max-w-full object-contain p-0.5" />
                  {:else}
                    <span class="text-[0.7rem] font-bold {TYPE_TW[item.type] ?? 'text-dim'}">{item.title.slice(0, 1).toUpperCase()}</span>
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[0.95rem] text-ink">{item.title}</span>
                  {#if item.subtitle}<span class="block truncate text-[0.8rem] text-dim">{item.subtitle}</span>{/if}
                </span>
                <span class="shrink-0 text-[0.68rem] font-semibold tracking-wide uppercase {TYPE_TW[item.type] ?? 'text-dim'}">{item.type}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
