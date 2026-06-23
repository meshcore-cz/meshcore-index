<script>
  // Renders maintainer-authored description text: inline markdown plus
  // Obsidian-style wikilinks ([[type:id]] / [[type:id|Label]]) that resolve to
  // internal SvelteKit routes against the live dataset.
  import { base } from '$app/paths';
  import { resolveWikilink } from '$lib/data.js';
  import { parseRichText } from '$lib/richtext.js';

  let { text = '', class: klass = '' } = $props();

  function resolve(target, label) {
    const w = resolveWikilink(target, label);
    return w.missing ? w : { ...w, href: `${base}/${w.type}/${w.id}/` };
  }

  let blocks = $derived(parseRichText(text));
</script>

{#snippet inline(nodes)}{#each nodes as n}{#if n.type === 'text'}{n.value}{:else if n.type === 'br'}<br />{:else if n.type === 'strong'}<strong class="font-semibold text-ink">{@render inline(n.children)}</strong>{:else if n.type === 'em'}<em>{@render inline(n.children)}</em>{:else if n.type === 'code'}<code class="rounded bg-elev2 px-1 py-0.5 text-[0.85em]">{n.value}</code>{:else if n.type === 'link'}<a class="text-accent2 hover:underline" href={n.href} target="_blank" rel="noreferrer">{@render inline(n.children)}</a>{:else if n.type === 'wikilink'}{@const w = resolve(n.target, n.label)}{#if w.missing}<span class="rounded bg-warn/10 px-1 text-warn" title="Unresolved link: {n.target}">{w.text}</span>{:else}<a class="text-accent hover:underline" href={w.href}>{w.text}</a>{/if}{/if}{/each}{/snippet}

<div class="rich-text {klass}">
  {#each blocks as b}
    {#if b.type === 'ul'}
      <ul class="my-2 list-disc space-y-1 pl-5">
        {#each b.items as item}<li>{@render inline(item)}</li>{/each}
      </ul>
    {:else}
      <p class="my-2 first:mt-0 last:mb-0">{@render inline(b.children)}</p>
    {/if}
  {/each}
</div>
