<script>
  import Seo from '$lib/Seo.svelte';
  import SoftwareList from '$lib/SoftwareList.svelte';
  import { SOFTWARE_KIND_META } from '$lib/data.js';
  let { data } = $props();

  let meta = $derived(SOFTWARE_KIND_META[data.kind]);
  let count = $derived(data.software.filter((s) => s.kind === data.kind).length);
</script>

<Seo
  title="{meta?.label ?? 'Software'} — Software"
  description={`${count} MeshCore ${meta?.label ?? 'software'} — ${meta?.singular ?? 'software'} for the network.`}
/>

<SoftwareList software={data.software} activeKind={data.kind} />
