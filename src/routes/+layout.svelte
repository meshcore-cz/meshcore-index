<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { generatedAt } from '$lib/data.js';
  import { REPO_URL } from '$lib/seo.js';
  import CommandPalette from '$lib/CommandPalette.svelte';
  let { children } = $props();

  let searchOpen = $state(false);

  // Theme is bootstrapped before paint in app.html; mirror it into state and
  // let the user flip it (persisted to localStorage).
  let theme = $state('dark');
  onMount(() => {
    theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      // ignore storage failures (private mode, etc.)
    }
  }

  const updatedLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null;

  function onkeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchOpen = !searchOpen;
    }
  }

  const nav = [
    { href: '/', label: 'Firmwares' },
    { href: '/devices/', label: 'Devices' },
    { href: '/vendors/', label: 'Vendors' },
    { href: '/matrix/', label: 'Compatibility' },
    { href: '/about/', label: 'About' }
  ];

  function isActive(href) {
    const path = $page.url.pathname.replace(base, '') || '/';
    if (href === '/') return path === '/';
    return path.startsWith(href);
  }
</script>

<svelte:window {onkeydown} />

<div class="flex min-h-screen flex-col">
  <header
    class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-edge bg-elev px-[clamp(1rem,4vw,2rem)] py-[0.9rem]"
  >
    <a class="flex items-center gap-2 text-[1.05rem] font-bold" href="{base}/">
      <span class="text-[1.3rem] text-accent">◇</span>
      <span>MeshCore Index</span>
    </a>
    <nav class="flex items-center gap-1">
      {#each nav as item}
        <a
          href="{base}{item.href}"
          class="rounded-md px-3 py-1.5 text-[0.92rem] hover:bg-elev2 hover:text-ink {isActive(
            item.href
          )
            ? 'bg-elev2 text-ink'
            : 'text-dim'}"
        >
          {item.label}
        </a>
      {/each}
      <button
        type="button"
        onclick={() => (searchOpen = true)}
        aria-label="Search"
        class="ml-1 flex items-center gap-2 rounded-md border border-edge px-2.5 py-1.5 text-[0.85rem] text-dim hover:border-accent hover:text-ink"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" stroke-linecap="round" />
        </svg>
        <span class="hidden font-mono text-[0.72rem] sm:inline">⌘K</span>
      </button>
      <button
        type="button"
        onclick={toggleTheme}
        aria-label="Toggle {theme === 'dark' ? 'light' : 'dark'} mode"
        title="Toggle theme"
        class="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-edge text-dim hover:border-accent hover:text-ink"
      >
        {#if theme === 'dark'}
          <!-- show sun: clicking switches to light -->
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" stroke-linecap="round" />
          </svg>
        {:else}
          <!-- show moon: clicking switches to dark -->
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        {/if}
      </button>
    </nav>
  </header>

  <CommandPalette bind:open={searchOpen} />

  <main class="mx-auto w-full max-w-[1100px] flex-1 px-[clamp(1rem,4vw,2rem)] py-[clamp(1.2rem,4vw,2.5rem)]">
    {@render children()}
  </main>

  <footer
    class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-t border-edge px-[clamp(1rem,4vw,2rem)] py-5 text-center text-sm text-dim"
  >
    <span>Built from human-readable YAML — edit the <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono">data/</code> folder to contribute.</span>
    <span class="text-edge">·</span>
    <a class="text-accent2 hover:underline" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
    {#if updatedLabel}
      <span class="text-edge">·</span>
      <span>Data updated {updatedLabel}</span>
    {/if}
  </footer>
</div>
