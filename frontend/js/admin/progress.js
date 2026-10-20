/**
 * CTF Arena - Admin Competitor Progress Directory Controller
 * File: frontend/js/admin/progress.js
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { showToast } from "../ui.js";

let currentPage = 1;
const pageSize = 20;
let totalPages = 1;

async function init() {
  await initLayout();
  const user = await requireAdmin();
  if (!user) return;

  setupListeners();
  await loadProgressDirectory();
}

function setupListeners() {
  const applyBtn = document.getElementById("apply-filters-btn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      currentPage = 1;
      loadProgressDirectory();
    });
  }

  const resetBtn = document.getElementById("reset-filters-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      document.getElementById("search-input").value = "";
      document.getElementById("status-filter").value = "";
      document.getElementById("online-filter").checked = false;
      currentPage = 1;
      loadProgressDirectory();
    });
  }

  const prevBtn = document.getElementById("prev-page-btn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        loadProgressDirectory();
      }
    });
  }

  const nextBtn = document.getElementById("next-page-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage += 1;
        loadProgressDirectory();
      }
    });
  }

  const exportBtn = document.getElementById("export-csv-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportCsv);
  }
}

async function loadProgressDirectory() {
  const tbody = document.getElementById("progress-tbody");
  if (!tbody) return;

  const q = document.getElementById("search-input")?.value.trim();
  const status = document.getElementById("status-filter")?.value;
  const online = document.getElementById("online-filter")?.checked;

  const params = new URLSearchParams({
    page: String(currentPage),
    page_size: String(pageSize),
    sort_by: "registered_at",
    order: "desc"
  });

  if (q) params.append("q", q);
  if (status) params.append("status", status);
  if (online) params.append("online", "true");

  try {
    const data = await api.get(`/admin/monitor/users?${params.toString()}`);
    totalPages = Math.ceil((data.total || 1) / pageSize) || 1;
    renderTable(data.users || []);
    renderPagination(data.total || 0);
  } catch (err) {
    showToast(err.message || "Failed to load progress records", "error");
  }
}

function renderTable(users) {
  const tbody = document.getElementById("progress-tbody");
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No competitors found matching your criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const onlineBadge = u.is_online
      ? '<span class="badge badge-green" style="font-size:10px;">ONLINE</span>'
      : '<span class="badge badge-grey" style="font-size:10px;">OFFLINE</span>';

    const pct = Math.min(100, Math.max(0, u.completion_percent || 0));

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div>
              <a href="/admin/user.html?id=${u.user_id}" style="font-weight: 600; color: #ffffff;">
                ${escapeHtml(u.display_name)}
              </a>
              <div class="text-mono text-dim text-xs">@${escapeHtml(u.username)}</div>
            </div>
          </div>
        </td>
        <td>
          ${u.team_name ? `<span class="badge badge-grey">${escapeHtml(u.team_name)}</span>` : '<span class="text-dim text-xs">Solo</span>'}
        </td>
        <td>
          ${onlineBadge}
        </td>
        <td class="text-mono text-sm" style="color: var(--status-green-text); font-weight: 600;">
          ${u.labs_completed}
        </td>
        <td class="text-mono text-sm" style="color: var(--status-amber-text); font-weight: 600;">
          ${u.labs_in_progress}
        </td>
        <td class="text-mono text-sm text-dim">
          ${u.labs_not_started}
        </td>
        <td style="min-width: 140px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
            <span class="text-mono">${pct}%</span>
            <span class="text-dim text-mono">${u.labs_completed}/${u.total_labs} labs</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${pct}%;"></div>
          </div>
        </td>
        <td class="text-mono text-sm" style="font-weight: 700; color: #ffffff;">
          ${u.total_points}
        </td>
        <td>
          <a href="/admin/user.html?id=${u.user_id}" class="btn btn-xs btn-outline">Audit</a>
        </td>
      </tr>
    `;
  }).join("");
}

function renderPagination(totalCount) {
  const infoEl = document.getElementById("pagination-info");
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");

  const start = Math.min((currentPage - 1) * pageSize + 1, totalCount);
  const end = Math.min(currentPage * pageSize, totalCount);

  if (infoEl) {
    infoEl.textContent = `Showing ${start}-${end} of ${totalCount} competitors`;
  }

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

async function handleExportCsv() {
  try {
    showToast("Generating CSV export...", "info");
    const response = await fetch(`${api.baseUrl || ""}/admin/monitor/export/users.csv`, {
      headers: {
        Authorization: `Bearer ${await api.getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error("CSV generation failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "competitors_progress.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("Competitor CSV downloaded", "success");
  } catch (err) {
    showToast(err.message || "Export failed", "error");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", init);
