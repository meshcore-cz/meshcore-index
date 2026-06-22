<script>
  import { base } from '$app/paths';
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { Command, Dialog } from 'bits-ui';
  import { Search } from '@lucide/svelte';
  import Avatar from '$lib/Avatar.svelte';
  import { searchAtlas } from '$lib/data.js';

  let { open = $bindable(false) } = $props();

  let query = $state('');

  // Filtering is done by Fuse via searchAtlas, so bits-ui's internal
  // filtering stays off — we render exactly the results it returns.
  let results = $derived(searchAtlas(query));

  // Reset the query each time the palette opens.
  $effect(() => {
    if (open) query = '';
  });

  const TYPE_TW = {
    Device: 'text-accent',
    Firmware: 'text-accent2',
    Vendor: 'text-warn'
  };

  async function go(item) {
    if (!item) return;
    // Close (and let the dialog tear down its scroll-lock) before navigating,
    // otherwise the teardown races with goto and leaves the body inert.
    open = false;
    await tick();
    goto(`${base}${item.href}`);
  }
</script>

<Dialog.Root {open} onOpenChange={(v) => (open = v)}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm" />
    <Dialog.Content
      class="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-edge bg-elev shadow-2xl outline-none"
      onOpenAutoFocus={(e) => {
        // Let the Command input grab focus instead of the dialog container.
        e.preventDefault();
      }}
    >
      <Dialog.Title class="sr-only">Search the atlas</Dialog.Title>

      <Command.Root shouldFilter={false} loop label="Search the atlas">
        <div class="flex items-center gap-3 border-b border-edge px-4">
          <Search class="size-4 shrink-0 text-dim" />
          <Command.Input
            bind:value={query}
            placeholder="Search devices, firmwares, vendors…"
            autofocus
            class="w-full bg-transparent py-3.5 text-[1rem] outline-none placeholder:text-dim"
          />
          <Dialog.Close
            class="rounded border border-edge px-1.5 py-0.5 text-[0.7rem] text-dim hover:text-ink"
          >
            esc
          </Dialog.Close>
        </div>

        <Command.List class="max-h-[60vh] overflow-y-auto">
          <Command.Viewport>
            {#if !query.trim()}
              <p class="px-4 py-8 text-center text-[0.9rem] text-dim">
                Search devices, firmwares, vendors…
              </p>
            {:else}
              <Command.Empty class="px-4 py-8 text-center text-[0.9rem] text-dim">
                No matches for “{query}”.
              </Command.Empty>
            {/if}

            <div class="py-1.5">
              {#each results as item (item.type + item.href + item.title)}
                <Command.Item
                  value={item.type + item.href + item.title}
                  onSelect={() => go(item)}
                  class="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none data-[selected]:bg-elev2"
                >
                  <Avatar
                    src={item.image}
                    alt=""
                    class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-edge bg-bg"
                    imgClass="max-h-full max-w-full object-contain p-1"
                  >
                    {#if item.type === 'Device'}
                      <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 text-muted">
                        <rect x="7" y="4" width="10" height="16" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8" />
                        <path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.4" />
                      </svg>
                    {:else}
                      <span class="text-[0.7rem] font-bold {TYPE_TW[item.type] ?? 'text-dim'}">{item.title.slice(0, 1).toUpperCase()}</span>
                    {/if}
                  </Avatar>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[0.95rem] text-ink">{item.title}</span>
                    {#if item.subtitle}<span class="block truncate text-[0.8rem] text-dim opacity-60">{item.subtitle}</span>{/if}
                  </span>
                  <span class="shrink-0 text-[0.68rem] font-semibold tracking-wide uppercase {TYPE_TW[item.type] ?? 'text-dim'}">{item.type}</span>
                </Command.Item>
              {/each}
            </div>
          </Command.Viewport>
        </Command.List>
      </Command.Root>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
