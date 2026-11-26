<script>
  import { onMount } from 'svelte';
  import { refreshAuth } from '$lib/auth.svelte.js';

  onMount(async () => {
    const user = await refreshAuth();
    if (!user) {
      window.location.replace('/login');
    } else if (user.role === 'admin') {
      window.location.replace('/admin');
    } else {
      window.location.replace('/cashier');
    }
  });
</script>

<div style="min-height: 60vh; display: grid; place-items: center; color: var(--text-secondary);">
  Redirecting to your workspace...
</div>
