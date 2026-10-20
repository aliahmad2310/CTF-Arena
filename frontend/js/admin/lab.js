/**
 * CTF Arena - Admin Lab Cohort Telemetry Controller
 * File: frontend/js/admin/lab.js
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { showToast } from "../ui.js";

let roomId = null;
let currentLabData = null;
let activeCohortTab = "completed"; // "completed" | "in_progress" | "not_started"

async function init() {
  await initLayout();
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  const params = new URLSearchParams(window.location.search);
  roomId = params.get("id");

  if (!roomId) {
    showToast("No lab ID specified", "error");
    setTimeout(() => { window.location.href = "/admin/monitor.html"; }, 1500);
    return;
  }

  setupListeners();
  await loadLabMetrics();
}

function setupListeners() {
  const tabCompleted = document.getElementById("tab-completed");
  const tabInProgress = document.getElementById("tab-in-progress");
  const tabNotStarted = document.getElementById("tab-not-started");

  const switchTab = (tabName, el) => {
    activeCohortTab = tabName;
    [tabCompleted, tabInProgress, tabNotStarted].forEach(t => {
      if (t) {
        t.style.borderBottomColor = "transparent";
        t.style.color = "var(--text-muted)";
      }
    });
    if (el) {
      el.style.borderBottomColor = tabName === "completed" ? "var(--accent-green)" : tabName === "in_progress" ? "var(--status-amber-text)" : "var(--status-grey-border)";
      el.style.color = "#ffffff";
    }
    renderActiveCohortTable();
  };

  if (tabCompleted) tabCompleted.addEventListener("click", () => switchTab("completed", tabCompleted));
  if (tabInProgress) tabInProgress.addEventListener("click", () => switchTab("in_progress", tabInProgress));
  if (tabNotStarted) tabNotStarted.addEventListener("click", () => switchTab("not_started", tabNotStarted));
}

async function loadLabMetrics() {
  try {
    const data = await api.get(`/admin/monitor/labs/${roomId}`);
    currentLabData = data;

    renderLabHeader(data);
    renderHardestChallenges(data.hardest_challenges || []);
    renderActiveCohortTable();
  } catch (err) {
    showToast(err.message || "Failed to load lab metrics", "error");
  }
}

function renderLabHeader(data) {
  const heading = document.getElementById("lab-title-heading");
  const diffBadge = document.getElementById("lab-diff-badge");
  const sub = document.getElementById("lab-meta-sub");
  const link = document.getElementById("public-lab-link");

  if (heading) heading.textContent = data.title;
  if (diffBadge) {
    diffBadge.textContent = data.difficulty.toUpperCase();
    diffBadge.className = `badge badge-grey`;
  }
  if (sub) {
    sub.textContent = `${data.total_challenges} challenges published | ${data.total_points} total points achievable`;
  }
  if (link) {
    link.href = `/lab.html?slug=${encodeURIComponent(data.slug)}`;
  }

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl("lab-completion-rate", `${data.completion_rate_percent ?? 0}%`);

  const avgMins = Math.round((data.avg_completion_time_seconds || 0) / 60);
  setEl("lab-avg-time", avgMins > 0 ? `${avgMins} mins` : "--");
  setEl("lab-in-progress-count", (data.in_progress_users || []).length);
  setEl("lab-total-points", data.total_points ?? 0);

  setEl("count-completed", (data.completed_users || []).length);
  setEl("count-in-progress", (data.in_progress_users || []).length);
  setEl("count-not-started", (data.not_started_users || []).length);
}

function renderHardestChallenges(challenges) {
  const tbody = document.getElementById("hardest-challenges-tbody");
  if (!tbody) return;

  if (challenges.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No challenge submission telemetry available yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = challenges.map(ch => {
    const solvePct = ch.solve_rate_percent ?? 0;
    return `
      <tr>
        <td style="font-weight: 600; color: #ffffff;">${escapeHtml(ch.title)}</td>
        <td><span class="badge badge-grey" style="font-size: 10px;">${escapeHtml(ch.category)}</span></td>
        <td class="text-mono">${ch.points}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="text-mono text-xs">${solvePct}%</span>
            <div class="progress-bar" style="width: 80px; height: 4px;">
              <div class="progress-fill" style="width: ${solvePct}%;"></div>
            </div>
          </div>
        </td>
        <td class="text-mono">${ch.solves_count ?? 0}</td>
        <td class="text-mono text-dim">${ch.wrong_attempts_count ?? 0}</td>
      </tr>
    `;
  }).join("");
}

function renderActiveCohortTable() {
  const tbody = document.getElementById("cohort-tbody");
  const thead = document.getElementById("cohort-thead");
  if (!tbody || !currentLabData) return;

  let list = [];
  if (activeCohortTab === "completed") {
    list = currentLabData.completed_users || [];
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Squad</th>
          <th>Solved Ratio</th>
          <th>Completed At</th>
          <th>Duration</th>
          <th>Action</th>
        </tr>
      `;
    }
  } else if (activeCohortTab === "in_progress") {
    list = currentLabData.in_progress_users || [];
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Squad</th>
          <th>Solved Ratio</th>
          <th>Last Activity</th>
          <th>Action</th>
        </tr>
      `;
    }
  } else {
    list = currentLabData.not_started_users || [];
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Name</th>
          <th>Squad</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      `;
    }
  }

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No competitors currently in this cohort.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(item => {
    const squadBadge = item.team_name ? `<span class="badge badge-grey">${escapeHtml(item.team_name)}</span>` : '<span class="text-dim text-xs">Solo</span>';

    if (activeCohortTab === "completed") {
      const completedTime = item.completed_at ? new Date(item.completed_at).toLocaleString() : "--";
      const durationMins = item.duration_seconds ? `${Math.round(item.duration_seconds / 60)} mins` : "--";

      return `
        <tr>
          <td>
            <a href="/admin/user.html?id=${item.user_id}" style="font-weight: 600; color: #ffffff;">
              ${escapeHtml(item.display_name)}
            </a>
            <div class="text-mono text-dim text-xs">@${escapeHtml(item.username)}</div>
          </td>
          <td>${squadBadge}</td>
          <td class="text-mono" style="color: var(--status-green-text); font-weight: 600;">
            ${item.solved_count}/${item.total_count} (100%)
          </td>
          <td class="text-mono text-xs text-dim">${completedTime}</td>
          <td class="text-mono text-xs">${durationMins}</td>
          <td>
            <a href="/admin/user.html?id=${item.user_id}" class="btn btn-xs btn-outline">Audit</a>
          </td>
        </tr>
      `;
    } else if (activeCohortTab === "in_progress") {
      const lastAct = item.last_activity_at ? new Date(item.last_activity_at).toLocaleTimeString() : "--";
      const pct = item.total_count > 0 ? Math.round((item.solved_count / item.total_count) * 100) : 0;

      return `
        <tr>
          <td>
            <a href="/admin/user.html?id=${item.user_id}" style="font-weight: 600; color: #ffffff;">
              ${escapeHtml(item.display_name)}
            </a>
            <div class="text-mono text-dim text-xs">@${escapeHtml(item.username)}</div>
          </td>
          <td>${squadBadge}</td>
          <td class="text-mono" style="color: var(--status-amber-text); font-weight: 600;">
            ${item.solved_count}/${item.total_count} (${pct}%)
          </td>
          <td class="text-mono text-xs text-dim">${lastAct}</td>
          <td>
            <a href="/admin/user.html?id=${item.user_id}" class="btn btn-xs btn-outline">Audit</a>
          </td>
        </tr>
      `;
    } else {
      return `
        <tr>
          <td>
            <a href="/admin/user.html?id=${item.user_id}" style="font-weight: 600; color: #ffffff;">
              ${escapeHtml(item.display_name)}
            </a>
            <div class="text-mono text-dim text-xs">@${escapeHtml(item.username)}</div>
          </td>
          <td>${squadBadge}</td>
          <td><span class="badge badge-grey">NOT STARTED</span></td>
          <td>
            <a href="/admin/user.html?id=${item.user_id}" class="btn btn-xs btn-outline">Audit</a>
          </td>
        </tr>
      `;
    }
  }).join("");
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
