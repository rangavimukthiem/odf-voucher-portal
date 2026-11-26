<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api.js';
  import { authState } from '$lib/auth.svelte.js';
  import { formatDateTime, formatMoney } from '$lib/format.js';
  import IssueVoucherModal from '$lib/components/IssueVoucherModal.svelte';

  let stats = $state(null);
  let recentVouchers = $state([]);
  let customers = $state([]);
  let loading = $state(true);
  let error = $state('');
  let showIssueModal = $state(false);

  async function loadDashboard() {
    loading = true;
    error = '';
    try {
      const [statsRes, vouchersRes, customersRes] = await Promise.all([
        apiFetch('/api/vouchers/stats'),
        apiFetch('/api/vouchers?limit=10'),
        apiFetch('/api/customers?limit=200'),
      ]);
      stats = statsRes.stats;
      recentVouchers = vouchersRes.vouchers;
      customers = customersRes.customers;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (authState.user && authState.user.role !== 'admin') {
      window.location.replace('/cashier');
      return;
    }
    loadDashboard();
  });
</script>

<div style="display: flex; flex-direction: column; gap: 1.25rem;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <div>
      <h1 style="margin: 0; font-size: 1.35rem;">Operations Overview</h1>
      <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem;">
        Issue manual 6-digit e-vouchers from calculated passenger loyalty points.
      </p>
    </div>
    <div style="display: flex; gap: 0.65rem; flex-wrap: wrap;">
      <a href="/admin/customers" class="btn">Manage Passengers</a>
      <button type="button" class="btn btn-primary" onclick={() => (showIssueModal = true)}>
        + Assign 6-Digit Voucher
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if loading}
    <div class="card" style="color: var(--text-secondary);">Loading operations summary...</div>
  {:else if stats}
    <div class="kpi-grid">
      <div class="card">
        <div class="kpi-label">Registered Passengers</div>
        <div class="kpi-value mono">{stats.total_customers}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Active Issued Vouchers</div>
        <div class="kpi-value mono" style="color: var(--accent-cyan);">{stats.issued_count}</div>
        <div class="kpi-sub mono">{formatMoney(stats.issued_value)}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Claimed Vouchers</div>
        <div class="kpi-value mono" style="color: #6ee7b7;">{stats.claimed_count}</div>
        <div class="kpi-sub mono">{formatMoney(stats.claimed_value)}</div>
      </div>
      <div class="card">
        <div class="kpi-label">Cancelled / Expired</div>
        <div class="kpi-value mono" style="color: #fda4af;">
          {stats.cancelled_count + stats.expired_count}
        </div>
        <div class="kpi-sub">{stats.cancelled_count} void · {stats.expired_count} expired</div>
      </div>
    </div>

    <div class="card">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.85rem;">
        <h2 style="margin: 0; font-size: 1rem;">Recent E-Vouchers</h2>
        <a href="/admin/vouchers" style="color: var(--accent-cyan); font-size: 0.85rem; text-decoration: none;">
          View all →
        </a>
      </div>

      {#if recentVouchers.length === 0}
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
          No vouchers assigned yet. Click "Assign 6-Digit Voucher" to issue the first voucher.
        </p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Passenger</th>
                <th>Passport</th>
                <th>Points</th>
                <th>Value</th>
                <th>Status</th>
                <th>Issued</th>
              </tr>
            </thead>
            <tbody>
              {#each recentVouchers as v}
                <tr>
                  <td class="mono" style="font-weight: 700; letter-spacing: 0.1em; color: var(--accent-cyan);">
                    {v.voucher_code}
                  </td>
                  <td>{v.customer_name}</td>
                  <td class="mono">{v.customer_passport}</td>
                  <td class="mono">{v.points_redeemed}</td>
                  <td class="mono">{formatMoney(v.voucher_value, v.currency)}</td>
                  <td><span class="badge badge-{v.status}">{v.status}</span></td>
                  <td style="color: var(--text-secondary); font-size: 0.8rem;">{formatDateTime(v.issued_at)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  {/if}
</div>

<IssueVoucherModal
  open={showIssueModal}
  {customers}
  onClose={() => (showIssueModal = false)}
  onIssued={() => loadDashboard()}
/>

<style>
  .kpi-label {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .kpi-value {
    margin-top: 0.45rem;
    font-size: 1.7rem;
    font-weight: 700;
  }

  .kpi-sub {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: var(--text-muted);
  }
</style>
