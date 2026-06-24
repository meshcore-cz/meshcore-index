<script>
  import { base } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
  import PageHeader from '$lib/PageHeader.svelte';
  import ProgrammingLanguageIcon from '$lib/ProgrammingLanguageIcon.svelte';
  let { data } = $props();

  const pct = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
  let max = $derived(data.languages[0]?.count ?? 1);

  // Medal tint for the top three; everything else uses the neutral accent bar.
  const RANK_TONE = ['text-warn', 'text-dim', 'text-[#cd7f32]'];
</script>

<Seo
  title="Language Leaderboard"
  description={`Programming languages used across ${data.totalSoftware} MeshCore software projects, ranked by adoption.`}
/>

<PageHeader tool="languages" subtitleClass="max-w-[70ch]">
  Which programming languages power the MeshCore software ecosystem. Ranked by how many of the
  {data.totalSoftware} catalogued projects use each language — projects can use more than one.
</PageHeader>

{#if data.languages.length}
  <ol class="flex flex-col gap-1.5">
    {#each data.languages as lang, i (lang.language)}
      {@const coverage = (lang.count / data.totalSoftware) * 100}
      <li>
        <a
          href="{base}/software/?q={encodeURIComponent(lang.language)}"
          class="group flex items-center gap-3 rounded-lg border border-edge bg-elev px-3 py-2.5 hover:border-accent"
        >
          <span class="w-7 shrink-0 text-center font-mono text-[0.95rem] font-bold tabular-nums {RANK_TONE[i] ?? 'text-dim'}">
            {i + 1}
          </span>
          <span class="w-32 shrink-0 min-w-0">
            <ProgrammingLanguageIcon language={lang.language} showLabel size={18} class="font-medium group-hover:text-accent" />
          </span>
          <span class="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-elev2">
            <span class="absolute inset-y-0 left-0 rounded-full bg-accent" style="width: {(lang.count / max) * 100}%"></span>
          </span>
          <span class="w-10 shrink-0 text-right font-mono text-[0.9rem] font-semibold tabular-nums">{lang.count}</span>
          <span class="w-12 shrink-0 text-right font-mono text-[0.78rem] text-dim tabular-nums">{pct.format(coverage)}%</span>
        </a>
      </li>
    {/each}
  </ol>

  <p class="mt-4 text-[0.8rem] text-dim">
    {data.languages.length} languages across {data.totalSoftware} projects · share is the percentage of all software using each language.
  </p>
{:else}
  <p class="text-dim">No language data available.</p>
{/if}
