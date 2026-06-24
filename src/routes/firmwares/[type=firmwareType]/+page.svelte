<script>
  import Seo from '$lib/Seo.svelte';
  import FirmwareList from '$lib/FirmwareList.svelte';
  import { TYPE_META } from '$lib/data.js';
  let { data } = $props();

  let meta = $derived(TYPE_META[data.type]);
  let count = $derived(data.firmwares.filter((fw) => fw.type === data.type).length);
</script>

<Seo
  title="{meta?.label ?? 'Firmwares'} firmwares"
  description={`${count} ${meta?.label ?? ''} MeshCore firmware${count === 1 ? '' : 's'} — node roles and the devices they run on.`}
/>

<FirmwareList firmwares={data.firmwares} activeType={data.type} />
