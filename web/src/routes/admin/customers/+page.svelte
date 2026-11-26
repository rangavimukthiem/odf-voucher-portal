<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api.js';
  import { authState } from '$lib/auth.svelte.js';
  import { formatDateTime } from '$lib/format.js';
  import IssueVoucherModal from '$lib/components/IssueVoucherModal.svelte';

  let customers = $state([]);
  let search = $state('');
  let loading = $state(true);
  let error = $state('');
  let successMsg = $state('');

  let showCustomerModal = $state(false);
  let editingId = $state(null);
  let fullName = $state('');
  let passportNumber = $state('');
  let nationality = $state('');
  let phone = $state('');
  let email = $state('');
  let loyaltyPoints = $state('0');
  let notes = $state('');
  let saving = $state(false);
  let modalError = $state('');

  let issueModalOpen = $state(false);
  let preselectedCustomerId = $state('');

  async function loadCustomers() {
    loading = true;
    error = '';
    try {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : '';
      const res = await apiFetch(`/api/customers${qs}`);
      customers = res.customers;
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
    loadCustomers();
  });

  function openCreateModal() {
    editingId = null;
    fullName = '';
    passportNumber = '';
    nationality = '';
    phone = '';
    email = '';
    loyaltyPoints = '0';
    notes = '';
    modalError = '';
    showCustomerModal = true;
  }

  function openEditModal(c) {
    editingId = c.id;
    fullName = c.full_name;
    passportNumber = c.passport_number;
    nationality = c.nationality || '';
    phone = c.phone || '';
    email = c.email || '';
    loyaltyPoints = String(c.loyalty_points ?? 0);
    notes = c.notes || '';
    modalError = '';
    showCustomerModal = true;
  }

  async function handleSaveCustomer(event) {
    event.preventDefault();
    modalError = '';
    saving = true;
    try {
      const payload = {
        full_name: fullName,
        passport_number: passportNumber,
        nationality,
        phone,
        email,
        loyalty_points: Number(loyaltyPoints || 0),
        notes,
      };
      if (editingId) {
        await apiFetch(`/api/customers/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        successMsg = `Updated passenger ${fullName}.`;
      } else {
        await apiFetch('/api/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        successMsg = `Registered passenger ${fullName}.`;
      }
      showCustomerModal = false;
      await loadCustomers();
    } catch (err) {
      modalError = err.message;
    } finally {
      saving = false;
    }
  }

  function openIssueForCustomer(customer) {
    preselectedCustomerId = String(customer.id);
    issueModalOpen = true;
  }
</script>

<div style="display: flex; flex-direction: column; gap: 1.25rem;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <div>
      <h1 style="margin: 0; font-size: 1.35rem;">Passenger Registry</h1>
      <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem;">
        Store passenger details, passport numbers, and operations-calculated loyalty points.
      </p>
    </div>
    <button type="button" class="btn btn-primary" onclick={openCreateModal}>+ Add Passenger</button>
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
        loadCustomers();
      }}
      style="display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem;"
    >
      <input
        class="input"
        style="flex: 1; min-width: 220px;"
        type="search"
        placeholder="Search by passenger name, passport number, email, or phone..."
        bind:value={search}
      />
      <button type="submit" class="btn">Search</button>
      {#if search}
        <button
          type="button"
          class="btn"
          onclick={() => {
            search = '';
            loadCustomers();
          }}
        >
          Reset
        </button>
      {/if}
    </form>

    {#if loading}
      <div style="color: var(--text-secondary);">Loading passengers...</div>
    {:else if customers.length === 0}
      <div style="color: var(--text-secondary);">No passenger records found.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Passenger Name</th>
              <th>Passport #</th>
              <th>Nationality</th>
              <th>Loyalty Points</th>
              <th>Vouchers</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each customers as c}
              <tr>
                <td>
                  <div style="font-weight: 600;">{c.full_name}</div>
                  {#if c.email || c.phone}
                    <div style="font-size: 0.76rem; color: var(--text-muted);">
                      {[c.phone, c.email].filter(Boolean).join(' · ')}
                    </div>
                  {/if}
                </td>
                <td class="mono" style="font-weight: 600;">{c.passport_number}</td>
                <td style="color: var(--text-secondary);">{c.nationality || '—'}</td>
                <td class="mono" style="color: var(--accent-cyan); font-weight: 600;">{c.loyalty_points}</td>
                <td class="mono" style="font-size: 0.8rem;">
                  {c.active_vouchers || 0} active / {c.total_vouchers || 0} total
                </td>
                <td style="color: var(--text-secondary); font-size: 0.8rem;">{formatDateTime(c.updated_at)}</td>
                <td>
                  <div style="display: flex; gap: 0.45rem;">
                    <button type="button" class="btn btn-sm" onclick={() => openEditModal(c)}>Edit</button>
                    <button type="button" class="btn btn-sm btn-primary" onclick={() => openIssueForCustomer(c)}>
                      Assign Voucher
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

{#if showCustomerModal}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="customer-modal-title">
    <div class="modal">
      <div class="modal-header">
        <h2 id="customer-modal-title" style="margin: 0; font-size: 1.05rem;">
          {editingId ? 'Edit Passenger Record' : 'Register Passenger'}
        </h2>
        <button type="button" class="btn btn-sm" onclick={() => (showCustomerModal = false)}>Close</button>
      </div>

      <form onsubmit={handleSaveCustomer} style="display: flex; flex-direction: column; min-height: 0; flex: 1;">
        <div class="modal-body">
          {#if modalError}
            <div class="alert alert-error">{modalError}</div>
          {/if}

          <div class="field">
            <label for="cust-name">Full Name (as on Passport)</label>
            <input id="cust-name" class="input" type="text" bind:value={fullName} required />
          </div>

          <div class="grid-auto" style="grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label for="cust-passport">Passport Number</label>
              <input id="cust-passport" class="input mono" type="text" bind:value={passportNumber} required />
            </div>

            <div class="field">
              <label for="cust-points">Loyalty Points (Ops Calculated)</label>
              <input id="cust-points" class="input mono" type="number" min="0" step="1" bind:value={loyaltyPoints} required />
            </div>
          </div>

          <div class="grid-auto" style="grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label for="cust-nationality">Nationality</label>
              <input id="cust-nationality" class="input" type="text" bind:value={nationality} />
            </div>

            <div class="field">
              <label for="cust-phone">Phone</label>
              <input id="cust-phone" class="input" type="text" bind:value={phone} />
            </div>
          </div>

          <div class="field">
            <label for="cust-email">Email</label>
            <input id="cust-email" class="input" type="email" bind:value={email} />
          </div>

          <div class="field">
            <label for="cust-notes">Operations Notes</label>
            <textarea id="cust-notes" class="textarea" rows="3" bind:value={notes}></textarea>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" onclick={() => (showCustomerModal = false)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Passenger'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<IssueVoucherModal
  open={issueModalOpen}
  {customers}
  {preselectedCustomerId}
  onClose={() => (issueModalOpen = false)}
  onIssued={(voucher) => {
    successMsg = `Assigned 6-digit voucher ${voucher.voucher_code} to ${voucher.customer_name}.`;
    loadCustomers();
  }}
/>
