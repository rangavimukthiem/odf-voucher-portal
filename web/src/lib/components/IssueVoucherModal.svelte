<script>
  import { apiFetch } from '$lib/api.js';

  let {
    open = false,
    customers = [],
    preselectedCustomerId = '',
    onClose = () => {},
    onIssued = () => {},
  } = $props();

  let customerId = $state('');
  let voucherCode = $state('');
  let pointsRedeemed = $state('');
  let voucherValue = $state('');
  let currency = $state('USD');
  let expiresAt = $state('');
  let submitting = $state(false);
  let error = $state('');

  $effect(() => {
    if (open) {
      customerId = preselectedCustomerId ? String(preselectedCustomerId) : '';
      voucherCode = '';
      voucherValue = '';
      currency = 'USD';
      expiresAt = '';
      error = '';

      const selected = customers.find((c) => String(c.id) === String(preselectedCustomerId));
      pointsRedeemed = selected ? String(selected.loyalty_points ?? 0) : '';
    }
  });

  function handleCustomerChange(event) {
    customerId = event.target.value;
    const selected = customers.find((c) => String(c.id) === customerId);
    if (selected) {
      pointsRedeemed = String(selected.loyalty_points ?? 0);
    }
  }

  function handleCodeInput(event) {
    voucherCode = event.target.value.replace(/\D/g, '').slice(0, 6);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    error = '';

    if (!/^\d{6}$/.test(voucherCode)) {
      error = 'Voucher code must be exactly 6 numeric digits from the operations sheet.';
      return;
    }
    if (!customerId) {
      error = 'Select a passenger to assign this voucher to.';
      return;
    }

    submitting = true;
    try {
      const payload = {
        voucher_code: voucherCode,
        customer_id: Number(customerId),
        points_redeemed: Number(pointsRedeemed || 0),
        voucher_value: Number(voucherValue),
        currency: currency.trim().toUpperCase() || 'USD',
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      const res = await apiFetch('/api/vouchers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onIssued(res.voucher);
      onClose();
    } catch (err) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="issue-voucher-title">
    <div class="modal">
      <div class="modal-header">
        <div>
          <h2 id="issue-voucher-title" style="margin: 0; font-size: 1.05rem;">Assign 6-Digit E-Voucher</h2>
          <p style="margin: 0.2rem 0 0; font-size: 0.78rem; color: var(--text-secondary);">
            Enter the 6-digit voucher number from the operations calculation sheet.
          </p>
        </div>
        <button type="button" class="btn btn-sm" onclick={onClose}>Close</button>
      </div>

      <form onsubmit={handleSubmit} style="display: flex; flex-direction: column; min-height: 0; flex: 1;">
        <div class="modal-body">
          {#if error}
            <div class="alert alert-error">{error}</div>
          {/if}

          <div class="field">
            <label for="issue-customer">Passenger</label>
            <select id="issue-customer" class="select" value={customerId} onchange={handleCustomerChange} required>
              <option value="">Select passenger...</option>
              {#each customers as customer}
                <option value={String(customer.id)}>
                  {customer.full_name} — {customer.passport_number} ({customer.loyalty_points} pts)
                </option>
              {/each}
            </select>
          </div>

          <div class="grid-auto" style="grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label for="issue-code">6-Digit Voucher Number</label>
              <input
                id="issue-code"
                class="input mono"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="e.g. 482910"
                value={voucherCode}
                oninput={handleCodeInput}
                style="letter-spacing: 0.22em; font-size: 1.05rem; font-weight: 600;"
                required
              />
            </div>

            <div class="field">
              <label for="issue-points">Calculated Loyalty Points</label>
              <input
                id="issue-points"
                class="input mono"
                type="number"
                min="0"
                step="1"
                bind:value={pointsRedeemed}
                required
              />
            </div>
          </div>

          <div class="grid-auto" style="grid-template-columns: 1fr 140px;">
            <div class="field">
              <label for="issue-value">Voucher Monetary Value</label>
              <input
                id="issue-value"
                class="input mono"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="50.00"
                bind:value={voucherValue}
                required
              />
            </div>

            <div class="field">
              <label for="issue-currency">Currency</label>
              <select id="issue-currency" class="select mono" bind:value={currency}>
                <option value="USD">USD</option>
                <option value="LKR">LKR</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label for="issue-expiry">Expiry Date & Time (Optional)</label>
            <input id="issue-expiry" class="input" type="datetime-local" bind:value={expiresAt} />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" onclick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Assigning...' : 'Assign Voucher'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
