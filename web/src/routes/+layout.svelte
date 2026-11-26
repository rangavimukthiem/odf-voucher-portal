<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { authState, logoutUser, refreshAuth } from '$lib/auth.svelte.js';

  let { children } = $props();

  onMount(async () => {
    const pathname = window.location.pathname;
    const isLogin = pathname === '/login' || pathname === '/login/';
    const user = await refreshAuth();
    if (!user && !isLogin) {
      window.location.replace('/login');
    }
  });

  const isLoginRoute = $derived($page.url.pathname.startsWith('/login'));
</script>

{#if isLoginRoute}
  {@render children()}
{:else if !authState.ready && !authState.user}
  <div style="min-height: 100vh; display: grid; place-items: center; color: var(--text-secondary);">
    Loading ODF Voucher Portal...
  </div>
{:else}
  <div class="shell">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="brand-dot"></span>
          <div>
            <div class="brand-title">ODF Loyalty Voucher Portal</div>
            <div class="brand-sub">Duty Free Passenger E-Voucher System</div>
          </div>
        </div>

        {#if authState.user}
          <nav class="nav-links">
            {#if authState.user.role === 'admin'}
              <a href="/admin" class:active={$page.url.pathname === '/admin'}>Overview</a>
              <a href="/admin/customers" class:active={$page.url.pathname.startsWith('/admin/customers')}>
                Passengers
              </a>
              <a href="/admin/vouchers" class:active={$page.url.pathname.startsWith('/admin/vouchers')}>
                Vouchers
              </a>
              <a href="/admin/users" class:active={$page.url.pathname.startsWith('/admin/users')}>Staff</a>
              <a href="/admin/audit" class:active={$page.url.pathname.startsWith('/admin/audit')}>Audit</a>
            {:else if authState.user.role === 'cashier'}
              <a href="/cashier" class:active={$page.url.pathname.startsWith('/cashier')}>Claim Terminal</a>
            {/if}
          </nav>

          <div class="user-box">
            <div class="user-meta">
              <span class="user-name">{authState.user.full_name}</span>
              <span class="badge badge-role-{authState.user.role}">{authState.user.role}</span>
            </div>
            <button type="button" class="btn btn-sm" onclick={logoutUser}>Sign out</button>
          </div>
        {/if}
      </div>
    </header>

    <main class="main-wrap">
      {@render children()}
    </main>
  </div>
{/if}

<style>
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(4, 8, 20, 0.88);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border-subtle);
  }

  .topbar-inner {
    max-width: 1240px;
    margin: 0 auto;
    padding: 0.78rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .brand-dot {
    width: 12px;
    height: 12px;
    border-radius: 4px;
    background: linear-gradient(135deg, var(--accent-cyan), var(--accent-indigo));
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.55);
  }

  .brand-title {
    font-weight: 700;
    font-size: 0.96rem;
    letter-spacing: -0.01em;
  }

  .brand-sub {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 500;
    padding: 0.45rem 0.8rem;
    border-radius: 8px;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .nav-links a:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-links a.active {
    color: var(--accent-cyan);
    background: rgba(56, 189, 248, 0.12);
  }

  .user-box {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .user-name {
    font-size: 0.85rem;
    font-weight: 600;
  }

  .main-wrap {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
    flex: 1;
  }
</style>
