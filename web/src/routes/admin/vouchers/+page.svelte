<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api.js';
  import { authState } from '$lib/auth.svelte.js';
  import { formatDateTime, formatMoney } from '$lib/format.js';
  import IssueVoucherModal from '$lib/components/IssueVoucherModal.svelte';

  let vouchers = $state([]);
  let customers = $state([]);
  let statusFilter = $state('');
  let search = $state('');
  let loading = $state(true);
  let error = $state('');
  let successMsg = $state('');
  let showIssueModal = $state(false);

  async function loadVouchers() {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      params.set('limit', '100');

      const [vRes, cRes] = await Promise.all([
        apiFetch(`/api/vouchers?${params.toString()}`),
        customers.length > 0 ? Promise.resolve({ customers }) : apiFetch('/api/customers?limit=200'),
      ]);
      vouchers = vRes.vouchers;
      customers = cRes.customers;
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
    loadVouchers();
  });

  async function cancelVoucher(voucher) {
    const reason = window.prompt(`Reason for cancelling voucher ${voucher.voucher_code}? (optional)`);
    if (reason === null) return;
    error = '';
    successMsg = '';
    try {
      await apiFetch(`/api/vouchers/${voucher.voucher_code}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      successMsg = `Voucher ${voucher.voucher_code} has been cancelled.`;
      await loadVouchers();
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div style="display: flex; flex-direction: column; gap: 1.25rem;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <div>
      <h1 style="margin: 0; font-size: 1.35rem;">6-Digit Voucher Ledger</h1>
      <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem;">
        Track issued, claimed, cancelled, and expired passenger e-vouchers.
      </p>
    </div>
    <button type="button" class="btn btn-primary" onclick={() => (showIssueModal = true)}>
      + Assign 6-Digit Voucher
    </button>
  </div>

  {#if successMsg}
    <div class="alert alert-success">{successMsg}</div>
  {/if}
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="card">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        loadVouchers();
      }}
      style="display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem;"
    >
      <input
        class="input"
        style="flex: 1; min-width: 220px;"
        type="search"
        placeholder="Search 6-digit code, passenger name, passport, or receipt ref..."
        bind:value={search}
      />
      <select class="select" style="width: 170px;" bind:value={statusFilter} onchange={loadVouchers}>
        <option value="">All Statuses</option>
        <option value="issued">Issued (Active)</option>
        <option value="claimed">Claimed</option>
        <option value="cancelled">Cancelled</option>
        <option value="expired">Expired</option>
      </select>
      <button type="submit" class="btn">Filter</button>
    </form>

    {#if loading}
      <div style="color: var(--text-secondary);">Loading vouchers...</div>
    {:else if vouchers.length === 0}
      <div style="color: var(--text-secondary);">No vouchers match your criteria.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Voucher #</th>
              <th>Passenger</th>
              <th>Passport</th>
              <th>Points</th>
              <th>Value</th>
              <th>Status</th>
              <th>Issued By / At</th>
              <th>Claimed By / POS Ref</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {#each vouchers as v}
              <tr>
                <td class="mono" style="font-weight: 700; letter-spacing: 0.12em; color: var(--accent-cyan);">
                  {v.voucher_code}
                </td>
                <td>{v.customer_name}</td>
                <td class="mono">{v.customer_passport}</td>
                <td class="mono">{v.points_redeemed}</td>
                <td class="mono">{formatMoney(v.voucher_value, v.currency)}</td>
                <td><span class="badge badge-{v.status}">{v.status}</span></td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">
                  <div>{v.issued_by_name || '—'}</div>
                  <div>{formatDateTime(v.issued_at)}</div>
                </td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">
                  {#if v.claimed_at}
                    <div>{v.claimed_by_name || '—'}</div>
                    <div class="mono">{v.pos_receipt_ref || 'No POS ref'} · {formatDateTime(v.claimed_at)}</div>
                  {:else}
                    —
                  {/if}
                </td>
                <td>
                  {#if v.status === 'issued'}
                    <button type="button" class="btn btn-sm btn-danger" onclick={() => cancelVoucher(v)}>
                      Cancel
                    </button>
                  {:else}
                    <span style="color: var(--text-muted); font-size: 0.78rem;">—</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<IssueVoucherModal
  open={showIssueModal}
  {customers}
  onClose={() => (showIssueModal = false)}
  onIssued={(voucher) => {
    successMsg = `Assigned voucher ${voucher.voucher_code} to ${voucher.customer_name}.`;
    loadVouchers();
  }}
/>
