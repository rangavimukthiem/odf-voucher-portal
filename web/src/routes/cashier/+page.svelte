<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api.js';
  import { authState } from '$lib/auth.svelte.js';
  import { formatDateTime, formatMoney } from '$lib/format.js';

  let lookupCode = $state('');
  let lookingUp = $state(false);
  let lookupError = $state('');
  let voucher = $state(null);

  let passportVerification = $state('');
  let posReceiptRef = $state('');
  let claimNotes = $state('');
  let claiming = $state(false);
  let claimError = $state('');
  let claimSuccess = $state('');

  let myClaims = $state([]);
  let loadingClaims = $state(true);

  async function loadMyClaims() {
    loadingClaims = true;
    try {
      const res = await apiFetch('/api/vouchers?limit=25');
      myClaims = res.vouchers;
    } catch {
      // Ignore secondary list error during initial mount
    } finally {
      loadingClaims = false;
    }
  }

  onMount(() => {
    if (authState.user && authState.user.role !== 'cashier') {
      window.location.replace('/admin');
      return;
    }
    loadMyClaims();
  });

  function handleCodeInput(event) {
    lookupCode = event.target.value.replace(/\D/g, '').slice(0, 6);
  }

  async function handleLookup(event) {
    event.preventDefault();
    lookupError = '';
    claimError = '';
    claimSuccess = '';
    voucher = null;
    passportVerification = '';
    posReceiptRef = '';
    claimNotes = '';

    if (!/^\d{6}$/.test(lookupCode)) {
      lookupError = 'Enter a valid 6-digit voucher number.';
      return;
    }

    lookingUp = true;
    try {
      const res = await apiFetch(`/api/vouchers/lookup/${lookupCode}`);
      voucher = res.voucher;
    } catch (err) {
      lookupError = err.message;
    } finally {
      lookingUp = false;
    }
  }

  async function handleClaim(event) {
    event.preventDefault();
    if (!voucher) return;
    claimError = '';
    claimSuccess = '';

    if (!passportVerification.trim()) {
      claimError = 'Enter passenger full passport number or last 4 characters.';
      return;
    }

    claiming = true;
    try {
      const res = await apiFetch(`/api/vouchers/${voucher.voucher_code}/claim`, {
        method: 'POST',
        body: JSON.stringify({
          passport_verification: passportVerification,
          pos_receipt_ref: posReceiptRef,
          claim_notes: claimNotes,
        }),
      });
      voucher = res.voucher;
      claimSuccess = res.message;
      passportVerification = '';
      posReceiptRef = '';
      claimNotes = '';
      await loadMyClaims();
    } catch (err) {
      claimError = err.message;
    } finally {
      claiming = false;
    }
  }
</script>

<div style="display: flex; flex-direction: column; gap: 1.25rem;">
  <div>
    <h1 style="margin: 0; font-size: 1.35rem;">Cashier Voucher Claim Terminal</h1>
    <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem;">
      Verify the passenger's 6-digit e-voucher and passport before applying the entitlement at POS.
    </p>
  </div>

  <div class="grid-auto" style="align-items: start;">
    <div class="card">
      <h2 style="margin: 0 0 0.85rem; font-size: 1rem;">1. Lookup 6-Digit Voucher</h2>
      <form onsubmit={handleLookup} style="display: flex; gap: 0.65rem; flex-wrap: wrap;">
        <input
          class="input mono"
          style="flex: 1; min-width: 180px; font-size: 1.35rem; letter-spacing: 0.28em; text-align: center; font-weight: 700;"
          type="text"
          inputmode="numeric"
          maxlength="6"
          placeholder="000000"
          value={lookupCode}
          oninput={handleCodeInput}
          required
        />
        <button type="submit" class="btn btn-primary" disabled={lookingUp}>
          {lookingUp ? 'Checking...' : 'Check Voucher'}
        </button>
      </form>

      {#if lookupError}
        <div class="alert alert-error" style="margin-top: 1rem;">{lookupError}</div>
      {/if}

      {#if claimSuccess}
        <div class="alert alert-success" style="margin-top: 1rem;">{claimSuccess}</div>
      {/if}

      {#if voucher}
        <div class="voucher-preview">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
            <span class="mono" style="font-size: 1.3rem; font-weight: 700; color: var(--accent-cyan); letter-spacing: 0.14em;">
              #{voucher.voucher_code}
            </span>
            <span class="badge badge-{voucher.status}">{voucher.status}</span>
          </div>

          <div class="detail-grid">
            <div>
              <div class="detail-label">Passenger Name</div>
              <div class="detail-value">{voucher.customer_name}</div>
            </div>
            <div>
              <div class="detail-label">Passport (Masked)</div>
              <div class="detail-value mono">{voucher.customer_passport}</div>
            </div>
            <div>
              <div class="detail-label">Voucher Value</div>
              <div class="detail-value mono" style="color: #6ee7b7; font-size: 1.15rem;">
                {formatMoney(voucher.voucher_value, voucher.currency)}
              </div>
            </div>
            <div>
              <div class="detail-label">Loyalty Points</div>
              <div class="detail-value mono">{voucher.points_redeemed} pts</div>
            </div>
            <div>
              <div class="detail-label">Issued At</div>
              <div class="detail-value">{formatDateTime(voucher.issued_at)}</div>
            </div>
            <div>
              <div class="detail-label">Expires At</div>
              <div class="detail-value">{voucher.expires_at ? formatDateTime(voucher.expires_at) : 'No expiry'}</div>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <div class="card">
      <h2 style="margin: 0 0 0.85rem; font-size: 1rem;">2. Verify Passport & Claim</h2>

      {#if !voucher}
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
          Look up a 6-digit voucher code on the left to begin verification.
        </p>
      {:else if voucher.status !== 'issued'}
        <div class="alert alert-error">
          This voucher is <strong>{voucher.status}</strong> and cannot be claimed.
          {#if voucher.claimed_at}
            <div style="margin-top: 0.35rem; font-size: 0.8rem;">
              Claimed on {formatDateTime(voucher.claimed_at)} by {voucher.claimed_by_name || 'cashier'}.
            </div>
          {/if}
        </div>
      {:else}
        {#if claimError}
          <div class="alert alert-error" style="margin-bottom: 0.85rem;">{claimError}</div>
        {/if}

        <form onsubmit={handleClaim} style="display: flex; flex-direction: column; gap: 0.9rem;">
          <div class="field">
            <label for="claim-passport">Passenger Passport Verification (Full Passport or Last 4 Characters)</label>
            <input
              id="claim-passport"
              class="input mono"
              type="text"
              placeholder="Enter full passport or last 4 characters"
              bind:value={passportVerification}
              required
            />
          </div>

          <div class="field">
            <label for="claim-pos-ref">POS Receipt / Invoice Ref (Optional)</label>
            <input
              id="claim-pos-ref"
              class="input mono"
              type="text"
              placeholder="e.g. POS-2026-88412"
              bind:value={posReceiptRef}
            />
          </div>

          <div class="field">
            <label for="claim-notes">Cashier Notes (Optional)</label>
            <input id="claim-notes" class="input" type="text" placeholder="Counter or terminal remark" bind:value={claimNotes} />
          </div>

          <button type="submit" class="btn btn-success" disabled={claiming} style="padding: 0.78rem;">
            {claiming ? 'Processing Claim...' : `Confirm & Claim ${formatMoney(voucher.voucher_value, voucher.currency)}`}
          </button>
        </form>
      {/if}
    </div>
  </div>

  <div class="card">
    <h2 style="margin: 0 0 0.85rem; font-size: 1rem;">My Recent Claimed Vouchers</h2>
    {#if loadingClaims}
      <div style="color: var(--text-secondary);">Loading claimed history...</div>
    {:else if myClaims.length === 0}
      <div style="color: var(--text-secondary); font-size: 0.875rem;">You have not claimed any vouchers yet.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Voucher #</th>
              <th>Passenger</th>
              <th>Value</th>
              <th>POS Receipt Ref</th>
              <th>Claimed At</th>
            </tr>
          </thead>
          <tbody>
            {#each myClaims as c}
              <tr>
                <td class="mono" style="font-weight: 700; color: var(--accent-cyan);">{c.voucher_code}</td>
                <td>{c.customer_name}</td>
                <td class="mono" style="color: #6ee7b7;">{formatMoney(c.voucher_value, c.currency)}</td>
                <td class="mono">{c.pos_receipt_ref || '—'}</td>
                <td style="color: var(--text-secondary); font-size: 0.8rem;">{formatDateTime(c.claimed_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<style>
  .voucher-preview {
    margin-top: 1.1rem;
    padding: 1rem;
    border-radius: 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
  }

  .detail-grid {
    margin-top: 0.85rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.8rem;
  }

  .detail-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .detail-value {
    margin-top: 0.2rem;
    font-weight: 600;
    font-size: 0.92rem;
  }
</style>
