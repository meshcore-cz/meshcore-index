<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { env } from '$env/dynamic/public';
  import { generatedAt } from '$lib/data.js';
  import { fullDateTime, recentTimeLabel } from '$lib/format.js';
  import { REPO_URL, SITE_NAME } from '$lib/seo.js';
  import { searchOpen } from '$lib/search.js';
  import CommandPalette from '$lib/CommandPalette.svelte';
  import pkg from '../../package.json';
  let { children } = $props();

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

  const updatedLabel = recentTimeLabel(generatedAt);
  const updatedTitle = fullDateTime(generatedAt);
  const plausibleScriptUrl = env.PUBLIC_PLAUSIBLE_SCRIPT_URL;
  const versionLabel = `v${pkg.version}`;

  function onkeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $searchOpen = !$searchOpen;
    }
  }

  const nav = [
    { href: '/', label: 'Home' },
    { href: '/networks/', label: 'Networks' },
    { href: '/devices/', label: 'Devices' },
    { href: '/firmwares/', label: 'Firmwares' },
    { href: '/matrix/', label: 'Compatibility' },
    { href: '/about/', label: 'About' }
  ];

  function isActive(href) {
    const path = $page.url.pathname.replace(base, '') || '/';
    if (href === '/') return path === '/';
    return path.startsWith(href);
  }
</script>

<svelte:head>
  {#if plausibleScriptUrl}
    <!-- Privacy-friendly analytics by Plausible -->
    <script data-plausible-src={plausibleScriptUrl}>
      {
        const host = window.location.hostname;
        const isLocal =
          host === 'localhost' ||
          host === '::1' ||
          host === '0.0.0.0' ||
          host.startsWith('127.') ||
          host.endsWith('.localhost');
        const scriptUrl = document.currentScript?.dataset.plausibleSrc;

        if (scriptUrl && !isLocal) {
          window.plausible =
            window.plausible ||
            function () {
              (plausible.q = plausible.q || []).push(arguments);
            };
          plausible.init =
            plausible.init ||
            function (i) {
              plausible.o = i || {};
            };
          plausible.init();

          const script = document.createElement('script');
          script.async = true;
          script.src = scriptUrl;
          document.head.append(script);
        }
      }
    </script>
  {/if}
</svelte:head>

<svelte:window {onkeydown} />

<div class="flex min-h-screen flex-col">
  <header
    class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-edge bg-elev px-[clamp(1rem,4vw,2rem)] py-[0.9rem]"
  >
    <a class="flex items-center gap-2.5 text-[1.05rem] font-bold" href="{base}/">
      <img src="{base}/logo.png" alt="" class="site-logo h-8 w-8 shrink-0" width="32" height="32" />
      <span>{SITE_NAME}</span>
      <span
        class="rounded-full border border-accent2/40 bg-accent2/10 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase leading-none tracking-wider text-accent2"
      >
        Alpha
      </span>
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
        onclick={() => ($searchOpen = true)}
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

  <CommandPalette bind:open={$searchOpen} />

  <main class="mx-auto w-full max-w-[1100px] flex-1 px-[clamp(1rem,4vw,2rem)] py-[clamp(1.2rem,4vw,2.5rem)]">
    {@render children()}
  </main>

  <footer
    class="flex flex-col items-center gap-3 border-t border-edge px-[clamp(1rem,4vw,2rem)] py-6 text-center text-sm text-dim"
  >
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      class="inline-flex items-center gap-2 rounded-lg border border-edge bg-elev px-3.5 py-2 font-medium text-ink transition hover:border-accent hover:text-accent"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.67 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17a10.9 10.9 0 0 1 5.74 0c2.18-1.48 3.14-1.17 3.14-1.17.63 1.58.24 2.75.12 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.66.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .5Z" />
      </svg>
      <span>Contribute on GitHub</span>
    </a>
    <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
      <span>{versionLabel}</span>
      <span class="text-edge">·</span>
      <a class="text-accent2 hover:underline" href="https://analytics.pp0.co/meshcore.ninja" target="_blank" rel="noreferrer">Analytics ↗</a>
      <span class="text-edge">·</span>
      <a class="text-accent2 hover:underline" href="{REPO_URL}/blob/main/LICENSES.md" target="_blank" rel="noreferrer">Data CC0 · Code MIT</a>
      <span class="text-edge">·</span>
      <a class="text-accent2 hover:underline" href="{base}/about/">How to contribute</a>
      {#if updatedLabel}
        <span class="text-edge">·</span>
        <span>Last updated <time datetime={generatedAt} title={updatedTitle}>{updatedLabel}</time></span>
      {/if}
    </div>
  </footer>
</div>

<style>
  /* The logo is white line-art on a transparent background: crisp on the dark
     header, but it disappears on the light theme. A soft shadow lifts it off
     the dark header; under the light theme we invert it to dark strokes so it
     stays visible there too. */
  .site-logo {
    filter: drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.5));
  }

  :global(html[data-theme='light']) .site-logo {
    filter: invert(1) drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.3));
  }
</style>
