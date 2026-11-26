<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api.js';
  import { authState } from '$lib/auth.svelte.js';
  import { formatDateTime } from '$lib/format.js';

  let users = $state([]);
  let loading = $state(true);
  let error = $state('');
  let successMsg = $state('');

  let showCreateModal = $state(false);
  let username = $state('');
  let fullName = $state('');
  let role = $state('cashier');
  let password = $state('');
  let saving = $state(false);
  let modalError = $state('');

  async function loadUsers() {
    loading = true;
    error = '';
    try {
      const res = await apiFetch('/api/users');
      users = res.users;
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
    loadUsers();
  });

  async function handleCreateUser(event) {
    event.preventDefault();
    modalError = '';
    saving = true;
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, full_name: fullName, role, password }),
      });
      showCreateModal = false;
      username = '';
      fullName = '';
      password = '';
      role = 'cashier';
      successMsg = 'Staff account created.';
      await loadUsers();
    } catch (err) {
      modalError = err.message;
    } finally {
      saving = false;
    }
  }

  async function toggleActive(u) {
    error = '';
    successMsg = '';
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      successMsg = `${u.username} is now ${!u.is_active ? 'active' : 'disabled'}.`;
      await loadUsers();
    } catch (err) {
      error = err.message;
    }
  }

  async function resetPassword(u) {
    const newPassword = window.prompt(`Enter new password (min 8 chars) for ${u.username}:`);
    if (!newPassword) return;
    error = '';
    successMsg = '';
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ new_password: newPassword }),
      });
      successMsg = `Password updated for ${u.username}.`;
    } catch (err) {
      error = err.message;
    }
  }
</script>

<div style="display: flex; flex-direction: column; gap: 1.25rem;">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <div>
      <h1 style="margin: 0; font-size: 1.35rem;">Staff Accounts</h1>
      <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem;">
        Manage Admin and Duty Free Cashier credentials.
      </p>
    </div>
    <button type="button" class="btn btn-primary" onclick={() => (showCreateModal = true)}>+ Create Staff User</button>
  </div>

  {#if successMsg}
    <div class="alert alert-success">{successMsg}</div>
  {/if}
  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="card">
    {#if loading}
      <div style="color: var(--text-secondary);">Loading staff accounts...</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each users as u}
              <tr>
                <td class="mono" style="font-weight: 600;">{u.username}</td>
                <td>{u.full_name}</td>
                <td><span class="badge badge-role-{u.role}">{u.role}</span></td>
                <td>
                  {#if u.is_active}
                    <span class="badge badge-claimed">Active</span>
                  {:else}
                    <span class="badge badge-cancelled">Disabled</span>
                  {/if}
                </td>
                <td style="color: var(--text-secondary); font-size: 0.8rem;">{formatDateTime(u.created_at)}</td>
                <td>
                  <div style="display: flex; gap: 0.45rem;">
                    <button type="button" class="btn btn-sm" onclick={() => resetPassword(u)}>Reset Password</button>
                    <button
                      type="button"
                      class="btn btn-sm {u.is_active ? 'btn-danger' : 'btn-success'}"
                      disabled={authState.user?.id === u.id}
                      onclick={() => toggleActive(u)}
                    >
                      {u.is_active ? 'Disable' : 'Enable'}
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

{#if showCreateModal}
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
    <div class="modal">
      <div class="modal-header">
        <h2 id="user-modal-title" style="margin: 0; font-size: 1.05rem;">Create Staff Account</h2>
        <button type="button" class="btn btn-sm" onclick={() => (showCreateModal = false)}>Close</button>
      </div>

      <form onsubmit={handleCreateUser} style="display: flex; flex-direction: column; min-height: 0; flex: 1;">
        <div class="modal-body">
          {#if modalError}
            <div class="alert alert-error">{modalError}</div>
          {/if}

          <div class="field">
            <label for="user-username">Username</label>
            <input id="user-username" class="input mono" type="text" placeholder="cashier.counter1" bind:value={username} required />
          </div>

          <div class="field">
            <label for="user-fullname">Full Name</label>
            <input id="user-fullname" class="input" type="text" bind:value={fullName} required />
          </div>

          <div class="field">
            <label for="user-role">Role</label>
            <select id="user-role" class="select" bind:value={role}>
              <option value="cashier">Cashier (Lookup & Claim Vouchers Only)</option>
              <option value="admin">Admin (Manage Passengers & Assign Vouchers)</option>
            </select>
          </div>

          <div class="field">
            <label for="user-password">Temporary Password (min 8 chars)</label>
            <input id="user-password" class="input" type="password" minlength="8" bind:value={password} required />
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn" onclick={() => (showCreateModal = false)} disabled={saving}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
