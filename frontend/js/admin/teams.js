/**
 * CTF Arena - Admin Teams Controller
 * File: frontend/js/admin/teams.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast, showModal } from "../ui.js";
import { escapeHtml, formatDate } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();
  initCreateTeamBtn();
  await loadTeams();
});

function initCreateTeamBtn() {
  const btn = document.getElementById("create-team-btn");
  if (!btn) return;

  btn.onclick = () => {
    showModal({
      title: "Establish New Squad",
      contentHtml: `
        <form id="create-team-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label class="form-label" for="ct-name">Squad Name</label>
            <input type="text" id="ct-name" class="form-input" required minlength="3" maxlength="30" placeholder="e.g. CyberSec Vanguard">
          </div>
          <div class="form-group">
            <label class="form-label" for="ct-captain">Captain Username (Optional)</label>
            <input type="text" id="ct-captain" class="form-input form-input-mono" placeholder="username of an existing competitor">
            <div class="form-helper">The designated user will become squad captain.</div>
          </div>
        </form>
      `,
      confirmText: "Create Squad",
      onConfirm: async () => {
        const name = document.getElementById("ct-name").value.trim();
        const captain = document.getElementById("ct-captain").value.trim();

        if (!name) {
          showToast("Squad name is required", "error");
          return false;
        }

        try {
          await api.post("/admin/teams", {
            name,
            captain_username: captain || null
          });
          showToast(`Squad '${name}' created successfully`, "success");
          await loadTeams();
          return true;
        } catch (err) {
          showToast(err.message || "Failed to create squad", "error");
          return false;
        }
      }
    });
  };
}

async function loadTeams() {
  const tbody = document.getElementById("teams-tbody");
  try {
    const teams = await api.get("/admin/teams");
    renderTeams(teams);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTeams(teams) {
  const tbody = document.getElementById("teams-tbody");

  if (!teams || teams.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">No teams found.</td></tr>`;
    return;
  }

  let html = "";
  teams.forEach((t) => {
    const captain = t.profiles || {};
    const captainName = captain.username || "Unassigned";

    html += `
      <tr>
        <td class="font-bold">
          <a href="/team-profile.html?id=${encodeURIComponent(t.id)}" target="_blank">
            ${escapeHtml(t.name)}
          </a>
        </td>
        <td>
          <a href="/profile.html?username=${encodeURIComponent(captainName)}" target="_blank" class="text-dim">
            ${escapeHtml(captainName)}
          </a>
        </td>
        <td><code class="text-cyan text-mono text-xs">${escapeHtml(t.invite_code)}</code></td>
        <td class="text-dim text-mono text-xs">${formatDate(t.created_at)}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-sm btn-secondary reset-score-btn" data-id="${t.id}" data-name="${escapeHtml(t.name)}">
            Reset Solves
          </button>
          <button type="button" class="btn btn-sm btn-danger disband-team-btn" data-id="${t.id}" data-name="${escapeHtml(t.name)}">
            Disband
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Bind reset score
  tbody.querySelectorAll(".reset-score-btn").forEach((btn) => {
    btn.onclick = () => {
      const teamId = btn.getAttribute("data-id");
      const teamName = btn.getAttribute("data-name");

      showModal({
        title: "Reset Team Score",
        contentHtml: `<p>Are you sure you want to <strong>reset the score and solves</strong> for team <strong>${teamName}</strong>?</p>`,
        confirmText: "Reset Solves",
        onConfirm: async () => {
          await api.post(`/admin/teams/${teamId}/reset-score`);
          showToast(`Score reset for team '${teamName}'`, "info");
          await loadTeams();
        }
      });
    };
  });

  // Bind disband team
  tbody.querySelectorAll(".disband-team-btn").forEach((btn) => {
    btn.onclick = () => {
      const teamId = btn.getAttribute("data-id");
      const teamName = btn.getAttribute("data-name");

      showModal({
        title: "Disband Team",
        contentHtml: `<p style="color:var(--status-red-text); font-weight:600;">Permanently delete team "${teamName}" and remove all operatives from the squad?</p>`,
        confirmText: "Disband Squad",
        onConfirm: async () => {
          await api.delete(`/admin/teams/${teamId}`);
          showToast(`Team '${teamName}' has been disbanded`, "info");
          await loadTeams();
        }
      });
    };
  });
}
