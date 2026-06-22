<script>
  import { Select } from 'bits-ui';
  import { Check, ChevronDown } from '@lucide/svelte';

  /**
   * Reusable single-select built on bits-ui, themed to the Atlas design tokens.
   *
   * @typedef {{ value: string, label: string, disabled?: boolean }} Item
   */
  let {
    /** @type {Item[]} */ items,
    /** @type {string} */ value = $bindable(),
    placeholder = 'Select…',
    /** Width of the trigger; pass a Tailwind/inline width as needed. */
    class: triggerClass = ''
  } = $props();

  const selectedLabel = $derived(items.find((i) => i.value === value)?.label ?? placeholder);
</script>

<Select.Root type="single" {items} bind:value>
  <Select.Trigger
    class={`flex items-center gap-2 rounded-lg border border-edge bg-elev px-2.5 py-1 text-ink outline-none transition-colors hover:border-dim focus:border-accent data-[state=open]:border-accent ${triggerClass}`}
    aria-label={placeholder}
  >
    <span class="truncate">{selectedLabel}</span>
    <ChevronDown class="ml-auto size-4 shrink-0 text-dim transition-transform data-[state=open]:rotate-180" />
  </Select.Trigger>

  <Select.Portal>
    <Select.Content
      class="z-50 max-h-72 overflow-y-auto rounded-lg border border-edge bg-elev2 p-1 text-ink shadow-lg shadow-black/30 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
      sideOffset={6}
    >
      <Select.Viewport>
        {#each items as item (item.value)}
          <Select.Item
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            class="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[0.85rem] outline-none data-[highlighted]:bg-accent/15 data-[highlighted]:text-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
          >
            {#snippet children({ selected })}
              <span class="flex size-4 shrink-0 items-center justify-center">
                {#if selected}
                  <Check class="size-4 text-accent" />
                {/if}
              </span>
              <span class="truncate">{item.label}</span>
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
