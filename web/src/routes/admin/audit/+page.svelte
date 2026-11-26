<script>
  import { onMount } from 'svelte';
  import { apiFetch } from '$lib/api.js';
  import { authState } from '$lib/auth.svelte.js';
  import { formatDateTime } from '$lib/format.js';

  let logs = $state([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    if (authState.user && authState.user.role !== 'admin') {
      window.location.replace('/cashier');
      return;
    }
    try {
      const res = await apiFetch('/api/audit-logs?limit=100');
      logs = res.logs;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });
</script>

<div style="display: flex; flex-direction: column; gap: 1.25rem;">
  <div>
    <h1 style="margin: 0; font-size: 1.35rem;">System Audit Trail</h1>
    <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.875rem;">
      Immutable log of logins, passenger updates, voucher assignments, and cashier claims.
    </p>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  <div class="card">
    {#if loading}
      <div style="color: var(--text-secondary);">Loading audit logs...</div>
    {:else if logs.length === 0}
      <div style="color: var(--text-secondary);">No audit entries yet.</div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log}
              <tr>
                <td style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap;">
                  {formatDateTime(log.created_at)}
                </td>
                <td>
                  <div style="font-weight: 600;">{log.actor_name || 'System'}</div>
                  {#if log.actor_username}
                    <div class="mono" style="font-size: 0.74rem; color: var(--text-muted);">
                      {log.actor_username} ({log.actor_role})
                    </div>
                  {/if}
                </td>
                <td class="mono" style="font-size: 0.8rem; color: var(--accent-cyan);">{log.action}</td>
                <td class="mono" style="font-size: 0.8rem;">{log.entity_type}#{log.entity_id ?? '—'}</td>
                <td class="mono" style="font-size: 0.76rem; color: var(--text-secondary); max-width: 380px; word-break: break-word;">
                  {log.details ? JSON.stringify(log.details) : '—'}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>
