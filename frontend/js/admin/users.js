/**
 * CTF Arena - Admin Users Controller
 * File: frontend/js/admin/users.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast, showModal } from "../ui.js";
import { debounce, escapeHtml, formatDate } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();
  initCreateUserBtn();
  document.getElementById("users-search")?.addEventListener("input", debounce(() => {
    currentPage = 1;
    void loadUsers();
  }, 250));
  document.getElementById("users-prev")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      void loadUsers();
    }
  });
  document.getElementById("users-next")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      void loadUsers();
    }
  });
  await loadUsers();
});

let currentPage = 1;
let totalPages = 1;
let cachedTeams = [];
const PAGE_SIZE = 6;

function initCreateUserBtn() {
  const btn = document.getElementById("create-user-btn");
  if (!btn) return;

  btn.onclick = async () => {
    if (!cachedTeams.length) {
      try {
        const teams = await api.get("/admin/teams", { page: 1, page_size: 100 });
        cachedTeams = teams.items || [];
      } catch (err) {
        showToast(err.message || "Unable to load teams for the account form", "error");
        return;
      }
    }
    const availableTeams = cachedTeams.filter((team) => team.id);
    showModal({
      title: "Create User Account",
      contentHtml: `
        <form id="create-user-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label class="form-label" for="cu-username">Username</label>
            <input type="text" id="cu-username" class="form-input form-input-mono" required minlength="3" maxlength="20" placeholder="handle">
          </div>
          <div class="form-group">
            <label class="form-label" for="cu-email">Email</label>
            <input type="email" id="cu-email" class="form-input" required maxlength="254" autocomplete="email" placeholder="name@example.com">
          </div>
          <div class="form-group">
            <label class="form-label" for="cu-display-name">Display Name (Optional)</label>
            <input type="text" id="cu-display-name" class="form-input" maxlength="50" placeholder="Callsign or Name">
          </div>
          <div class="form-group">
            <label class="form-label" for="cu-password">Initial Password</label>
            <input type="password" id="cu-password" class="form-input form-input-mono" required minlength="6" placeholder="Minimum 6 characters">
          </div>
          <div class="form-group">
            <label class="form-label" for="cu-team">Team (Optional)</label>
            <select id="cu-team" class="form-input form-select">
              <option value="">No team</option>
              ${availableTeams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join("")}
            </select>
            <div class="form-helper">Team capacity is enforced when the account is created.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="cu-role">Role</label>
            <select id="cu-role" class="form-input form-select">
              <option value="user" selected>Competitor (User)</option>
              <option value="admin">Administrator (Admin)</option>
            </select>
          </div>
        </form>
      `,
      confirmText: "Create Account",
      onConfirm: async () => {
        const username = document.getElementById("cu-username").value.trim();
        const email = document.getElementById("cu-email").value.trim();
        const displayName = document.getElementById("cu-display-name").value.trim();
        const password = document.getElementById("cu-password").value;
        const role = document.getElementById("cu-role").value;
        const teamId = document.getElementById("cu-team").value;

        if (!username || !email || !password) {
          showToast("Username, email, and password are required", "error");
          return false;
        }

        try {
          await api.post("/admin/users", {
            username,
            email,
            display_name: displayName || username,
            password,
            role,
            team_id: teamId || null
          });
          showToast(`User '${username}' created successfully`, "success");
          await loadUsers();
          return true;
        } catch (err) {
          showToast(err.message || "Failed to create user", "error");
          return false;
        }
      }
    });
  };
}

async function loadUsers() {
  const tbody = document.getElementById("users-tbody");
  try {
    const users = await api.get("/admin/users", {
      page: currentPage,
      page_size: PAGE_SIZE,
      q: document.getElementById("users-search")?.value.trim()
    });
    totalPages = Math.max(1, Math.ceil(users.total / PAGE_SIZE));
    renderUsers(users.items);
    renderPagination(users.total);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderPagination(total) {
  const info = document.getElementById("users-page-info");
  const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);
  if (info) info.textContent = `Page ${currentPage} of ${totalPages} | ${start}-${end} of ${total} accounts`;
  const prev = document.getElementById("users-prev");
  const next = document.getElementById("users-next");
  if (prev) prev.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;
}

function renderUsers(users) {
  const tbody = document.getElementById("users-tbody");

  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">No users found.</td></tr>`;
    return;
  }

  let html = "";
  users.forEach((u) => {
    const teamInfo = u.teams || {};
    const teamName = teamInfo.name || "Solo";

    const isBanned = u.is_banned;
    const statusBadge = isBanned 
      ? `<span class="badge badge-red">Suspended</span>` 
      : `<span class="badge badge-green">Active</span>`;

    html += `
      <tr>
        <td class="font-bold">
          <a href="/profile.html?username=${encodeURIComponent(u.username)}" target="_blank">
            ${escapeHtml(u.username)}
          </a>
        </td>
        <td>${escapeHtml(u.display_name)}</td>
        <td>
          <span class="badge ${u.role === "admin" ? "badge-green" : "badge-grey"}">${escapeHtml(u.role)}</span>
        </td>
        <td class="text-dim text-xs">${escapeHtml(teamName)}</td>
        <td>${statusBadge}</td>
        <td class="text-dim text-mono text-xs">${formatDate(u.created_at)}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-sm btn-secondary reset-pwd-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">
            Reset Password
          </button>
          ${u.role !== "admin" ? `
            <button type="button" class="btn btn-sm btn-danger delete-user-btn" data-id="${u.id}" data-username="${escapeHtml(u.username)}">
              Delete
            </button>
          ` : `<span class="badge badge-grey text-xs" style="margin-left: 0.35rem;">Protected</span>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Bind reset password handlers
  tbody.querySelectorAll(".reset-pwd-btn").forEach((btn) => {
    btn.onclick = () => {
      const userId = btn.getAttribute("data-id");
      const username = btn.getAttribute("data-username");

      showModal({
        title: `Reset Password: ${username}`,
        contentHtml: `
          <div class="form-group">
            <label class="form-label" for="reset-new-password">New Password</label>
            <input type="password" id="reset-new-password" class="form-input form-input-mono" placeholder="Minimum 6 characters" required minlength="6">
          </div>
        `,
        confirmText: "Update Password",
        onConfirm: async () => {
          const newPassword = document.getElementById("reset-new-password").value;
          if (!newPassword || newPassword.length < 6) {
            showToast("Password must be at least 6 characters", "error");
            return false;
          }

          try {
            await api.post(`/admin/users/${userId}/reset-password`, { new_password: newPassword });
            showToast(`Password updated for user '${username}'`, "success");
            return true;
          } catch (err) {
            showToast(err.message || "Failed to reset password", "error");
            return false;
          }
        }
      });
    };
  });

  // Bind delete user handlers
  tbody.querySelectorAll(".delete-user-btn").forEach((btn) => {
    btn.onclick = () => {
      const userId = btn.getAttribute("data-id");
      const username = btn.getAttribute("data-username");

      showModal({
        title: "Delete User Account",
        contentHtml: `<p>Are you sure you want to permanently <strong>delete user ${username}</strong>? This will revoke access and remove their profile.</p>`,
        confirmText: "Permanently Delete",
        onConfirm: async () => {
          try {
            await api.delete(`/admin/users/${userId}`);
            showToast(`User '${username}' deleted`, "info");
            await loadUsers();
            return true;
          } catch (err) {
            showToast(err.message || "Failed to delete user", "error");
            return false;
          }
        }
      });
    };
  });

}
