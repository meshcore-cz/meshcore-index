<script>
  import '../app.css';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  let { children } = $props();

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

<div class="flex min-h-screen flex-col">
  <header
    class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4 border-b border-edge bg-elev px-[clamp(1rem,4vw,2rem)] py-[0.9rem]"
  >
    <a class="flex items-center gap-2 text-[1.05rem] font-bold" href="{base}/">
      <span class="text-[1.3rem] text-accent">◇</span>
      <span>MeshCore Firmware Atlas</span>
    </a>
    <nav class="flex gap-1">
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
    </nav>
  </header>

  <main class="mx-auto w-full max-w-[1100px] flex-1 px-[clamp(1rem,4vw,2rem)] py-[clamp(1.2rem,4vw,2.5rem)]">
    {@render children()}
  </main>

  <footer class="border-t border-edge px-[clamp(1rem,4vw,2rem)] py-5 text-center text-sm text-dim">
    <span>Built from human-readable YAML — edit the <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono">data/</code> folder to contribute.</span>
  </footer>
</div>
