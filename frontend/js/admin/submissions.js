/**
 * CTF Arena - Admin Submissions Audit Controller
 * File: frontend/js/admin/submissions.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { escapeHtml, formatRelativeTime } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();

  await loadSubmissions();

  const refreshBtn = document.getElementById("refresh-submissions-btn");
  if (refreshBtn) {
    refreshBtn.onclick = () => loadSubmissions();
  }
});

async function loadSubmissions() {
  const tbody = document.getElementById("submissions-tbody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">Loading submissions stream...</td></tr>`;

  try {
    const list = await api.get("/admin/submissions");
    renderSubmissions(list);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderSubmissions(list) {
  const tbody = document.getElementById("submissions-tbody");

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">No submission attempts logged yet.</td></tr>`;
    return;
  }

  let html = "";
  list.forEach((s) => {
    const user = s.profiles || {};
    const ch = s.challenges || {};
    const team = s.teams || {};

    const outcomeBadge = s.is_correct 
      ? `<span class="badge badge-green">Correct</span>` 
      : `<span class="badge badge-red">Wrong</span>`;

    html += `
      <tr>
        <td class="text-dim text-mono text-xs">${formatRelativeTime(s.created_at)}</td>
        <td class="font-bold">
          <a href="/profile.html?username=${encodeURIComponent(user.username || "")}" target="_blank">
            ${escapeHtml(user.username || "Unknown")}
          </a>
        </td>
        <td class="text-dim text-xs">${escapeHtml(team.name || "Solo")}</td>
        <td>${escapeHtml(ch.title || "Challenge")}</td>
        <td><code class="text-mono text-xs" style="color:var(--text-main);">${escapeHtml(s.submitted_flag || "(hidden)")}</code></td>
        <td>${outcomeBadge}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}
