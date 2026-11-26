<script>
  import { onMount } from 'svelte';
  import { loginUser, refreshAuth } from '$lib/auth.svelte.js';

  let username = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state('');

  onMount(async () => {
    const existing = await refreshAuth();
    if (existing) {
      window.location.replace(existing.role === 'admin' ? '/admin' : '/cashier');
    }
  });

  async function handleSubmit(event) {
    event.preventDefault();
    error = '';
    loading = true;
    try {
      const user = await loginUser(username, password);
      window.location.replace(user.role === 'admin' ? '/admin' : '/cashier');
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-page">
  <div class="card login-card">
    <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
      <div class="logo-mark">ODF</div>
      <div>
        <h1 style="margin: 0; font-size: 1.2rem;">Loyalty E-Voucher Portal</h1>
        <p style="margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--text-secondary);">
          Duty Free Admin & Cashier Sign In
        </p>
      </div>
    </div>

    {#if error}
      <div class="alert alert-error" style="margin-bottom: 1rem;">{error}</div>
    {/if}

    <form onsubmit={handleSubmit} style="display: flex; flex-direction: column; gap: 0.95rem;">
      <div class="field">
        <label for="login-username">Username</label>
        <input
          id="login-username"
          class="input mono"
          type="text"
          autocomplete="username"
          placeholder="admin or cashier username"
          bind:value={username}
          required
        />
      </div>

      <div class="field">
        <label for="login-password">Password</label>
        <input
          id="login-password"
          class="input"
          type="password"
          autocomplete="current-password"
          placeholder="Enter password"
          bind:value={password}
          required
        />
      </div>

      <button type="submit" class="btn btn-primary" disabled={loading} style="margin-top: 0.25rem; padding: 0.75rem;">
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  </div>
</div>

<style>
  .login-page {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1.5rem;
  }

  .login-card {
    width: 100%;
    max-width: 410px;
    padding: 1.75rem;
  }

  .logo-mark {
    width: 42px;
    height: 42px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 0.88rem;
    letter-spacing: 0.04em;
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-indigo));
    color: #ffffff;
    box-shadow: 0 8px 24px rgba(2, 132, 199, 0.35);
  }
</style>
