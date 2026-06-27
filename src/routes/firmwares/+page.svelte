<script>
  import Seo from '$lib/Seo.svelte';
  import FirmwareList from '$lib/FirmwareList.svelte';
  let { data } = $props();
</script>

<Seo
  title="Firmwares"
  description="MeshCore firmwares — the reference build plus community forks and custom variants, with node roles and supported devices."
/>

<FirmwareList firmwares={data.firmwares} />
