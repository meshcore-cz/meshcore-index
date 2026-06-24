<script>
  import Seo from '$lib/Seo.svelte';
  import SoftwareList from '$lib/SoftwareList.svelte';
  let { data } = $props();
</script>

<Seo
  title="Software"
  description={`${data.software.length} MeshCore clients, integrations, gateways, monitoring & management, utilities, bots and libraries.`}
/>

<SoftwareList software={data.software} />
