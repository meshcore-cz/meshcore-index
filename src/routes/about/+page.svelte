<script>
  import { base } from '$app/paths';
  import Seo from '$lib/Seo.svelte';
</script>

<Seo
  title="About"
  description="How the MeshCore Index works — a community-maintained, open-data catalog of MeshCore firmwares and hardware, generated from human-readable YAML."
/>

<h1 class="mb-2 text-[clamp(1.5rem,5vw,2rem)] font-bold">About</h1>
<p class="max-w-[70ch]">
  The <strong>MeshCore Index</strong> is a community-maintained catalog
  of <a class="text-accent2 hover:underline" href="https://meshcore.io" target="_blank" rel="noreferrer">MeshCore</a>
  firmwares — the official build plus community forks and custom variants — with
  their details and a hardware compatibility matrix.
</p>

<h2 class="mt-7 text-[1.15rem] font-semibold">How it works</h2>
<p class="max-w-[70ch]">
  The whole site is generated at build time from human-readable YAML files in the
  <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">data/</code> folder. There is no database and no server. There are three
  collections — <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">firmwares</code>, <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">devices</code> and
  <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">vendors</code> — each a directory of records, where the directory name
  <em>is</em> the id. A build step compiles them into a single
  <a class="text-accent2 hover:underline" href="{base}/data.json">data.json</a> the app reads (and which is published for
  reuse).
</p>

<h2 class="mt-7 text-[1.15rem] font-semibold">Contributing</h2>
<ol class="max-w-[70ch] list-decimal pl-5">
  <li class="mb-1.5">Add a record, e.g. <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">data/devices/&lt;id&gt;/device.yaml</code>.</li>
  <li class="mb-1.5">Link a device to its maker with <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">vendorId</code>, and reference device
    ids from a firmware's <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">devices:</code> list.</li>
  <li class="mb-1.5">Run <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">npm test</code> to validate against the YAML schema files.</li>
  <li class="mb-1.5">Open a PR.</li>
</ol>
<p class="max-w-[70ch]">See <code class="rounded bg-elev2 px-1.5 py-0.5 font-mono text-[0.9em]">data/SCHEMA.md</code> for the full field reference.</p>

<h2 class="mt-7 text-[1.15rem] font-semibold">Accuracy</h2>
<p class="max-w-[70ch]">
  Details are gathered from each project's repository and may lag behind the
  latest release. Corrections via PR are very welcome.
</p>
