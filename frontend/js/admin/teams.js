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
  document.getElementById("teams-search")?.addEventListener("input", debounce(() => {
    currentPage = 1;
    void loadTeams();
  }, 250));
  document.getElementById("teams-prev")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      void loadTeams();
    }
  });
  document.getElementById("teams-next")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      void loadTeams();
    }
  });
  await loadTeams();
});

import { debounce } from "../utils.js";

let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 25;

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
          <div class="form-group">
            <label class="form-label" for="ct-max-members">Maximum Members</label>
            <input type="number" id="ct-max-members" class="form-input form-input-mono" value="4" min="1" max="100" required>
            <div class="form-helper">Controls how many users can join this team.</div>
          </div>
        </form>
      `,
      confirmText: "Create Squad",
      onConfirm: async () => {
        const name = document.getElementById("ct-name").value.trim();
        const captain = document.getElementById("ct-captain").value.trim();
        const max_members = Number(document.getElementById("ct-max-members").value);

        if (!name || !Number.isInteger(max_members) || max_members < 1 || max_members > 100) {
          showToast("Enter a team name and a maximum member count from 1 to 100", "error");
          return false;
        }

        try {
          await api.post("/admin/teams", {
            name,
            captain_username: captain || null,
            max_members
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
    const [teams, users] = await Promise.all([
      api.get("/admin/teams", { page: currentPage, page_size: PAGE_SIZE, q: document.getElementById("teams-search")?.value.trim() }),
      !cachedUsers.length
        ? api.get("/admin/users", { page: 1, page_size: 100, unassigned: true })
        : Promise.resolve({ items: cachedUsers })
    ]);
    if (users.items) cachedUsers = users.items.filter((user) => user.role === "user");
    totalPages = Math.max(1, Math.ceil(teams.total / PAGE_SIZE));
    renderTeams(teams.items);
    renderPagination(teams.total);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

let cachedUsers = [];

function renderPagination(total) {
  const info = document.getElementById("teams-page-info");
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  if (info) info.textContent = `Showing ${start}-${end} of ${total} teams`;
  const prev = document.getElementById("teams-prev");
  const next = document.getElementById("teams-next");
  if (prev) prev.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;
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
        <td>
          <div class="text-xs" style="display:flex; flex-wrap:wrap; gap:0.35rem; margin-bottom:0.5rem;">
            ${(t.members || []).map((member) => `<span class="badge badge-grey">${escapeHtml(member.username)} <button type="button" class="remove-member-btn" aria-label="Remove ${escapeHtml(member.username)} from ${escapeHtml(t.name)}" data-team-id="${t.id}" data-user-id="${member.id}" data-username="${escapeHtml(member.username)}" style="border:0;background:transparent;color:inherit;cursor:pointer;">Remove</button></span>`).join("") || `<span class="text-dim">No members</span>`}
          </div>
          <button type="button" class="btn btn-xs btn-outline add-member-btn" data-id="${t.id}" data-name="${escapeHtml(t.name)}">Add account</button>
          <div class="text-dim text-xs" style="margin-top:0.5rem;">Capacity: ${(t.members || []).length} / ${t.max_members || 4}</div>
          <div style="display:flex;gap:0.35rem;align-items:center;margin-top:0.35rem;">
            <label class="text-xs text-dim" for="team-capacity-${t.id}">Max:</label>
            <input id="team-capacity-${t.id}" type="number" class="form-input form-input-mono" min="1" max="100" value="${t.max_members || 4}" style="width:5rem;padding:0.25rem 0.4rem;">
            <button type="button" class="btn btn-xs btn-secondary capacity-edit-btn" data-id="${t.id}">Save</button>
          </div>
        </td>
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

  tbody.querySelectorAll(".add-member-btn").forEach((btn) => {
    btn.onclick = () => {
      const teamId = btn.getAttribute("data-id");
      const teamName = btn.getAttribute("data-name");
      showModal({
        title: `Add member to ${teamName}`,
        contentHtml: `
          <div class="form-group">
            <label class="form-label" for="member-username">Account</label>
            <select id="member-username" class="form-input form-select" required>
              <option value="">Choose an account</option>
              ${cachedUsers.filter((user) => !user.team_id).map((user) => `<option value="${escapeHtml(user.username)}">${escapeHtml(user.username)} (${escapeHtml(user.display_name)})</option>`).join("")}
            </select>
            <div class="form-helper">Only accounts that are not already on a team are available.</div>
          </div>
        `,
        confirmText: "Add Member",
        onConfirm: async () => {
          const username = document.getElementById("member-username").value;
          if (!username) {
            showToast("Username is required", "error");
            return false;
          }
          try {
            await api.post(`/admin/teams/${teamId}/members`, { username });
            cachedUsers = cachedUsers.filter((user) => user.username !== username);
            showToast(`User '${username}' added to '${teamName}'`, "success");
            await loadTeams();
            return true;
          } catch (err) {
            showToast(err.message || "Failed to add member", "error");
            return false;
          }
        }
      });
    };
  });

  tbody.querySelectorAll(".capacity-edit-btn").forEach((btn) => {
    btn.onclick = async () => {
      const teamId = btn.dataset.id;
      const max_members = Number(document.getElementById(`team-capacity-${teamId}`).value);
      if (!Number.isInteger(max_members) || max_members < 1 || max_members > 100) {
        showToast("Maximum members must be between 1 and 100", "error");
        return;
      }
      try {
        await api.patch(`/admin/teams/${teamId}/capacity`, { max_members });
        showToast("Team capacity updated", "success");
        await loadTeams();
      } catch (err) {
        showToast(err.message || "Unable to update team capacity", "error");
      }
    };
  });

  tbody.querySelectorAll(".remove-member-btn").forEach((btn) => {
    btn.onclick = async () => {
      const teamId = btn.getAttribute("data-team-id");
      const userId = btn.getAttribute("data-user-id");
      const username = btn.getAttribute("data-username");
      try {
        await api.delete(`/admin/teams/${teamId}/members/${userId}`);
        showToast(`User '${username}' removed from the team`, "success");
        await loadTeams();
      } catch (err) {
        showToast(err.message || "Failed to remove member", "error");
      }
    };
  });

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
