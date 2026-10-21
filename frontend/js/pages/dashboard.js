/**
 * CTF Arena - Dashboard Controller
 * File: frontend/js/pages/dashboard.js
 * Strictly zero emoji.
 */

import { requireAuth, startHeartbeat } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { escapeHtml, formatRelativeTime } from "../utils.js";
import { renderStatusBadge } from "../ui.js";

export async function initializeDashboard(initialProfile = null) {
  let profile = initialProfile;
  if (!profile) {
    try {
      profile = await requireAuth();
    } catch {
      return;
    }
  }

  await initLayout();
  startHeartbeat();

  document.getElementById("dash-display-name").textContent = profile.display_name || profile.username;

  await loadDashboardData();
}

// Keep old bookmarks working while the authenticated dashboard lives at '/'.
if (/\/dashboard(?:\.html)?\/?$/.test(window.location.pathname)) {
  window.location.replace("/");
}

async function loadDashboardData() {
  try {
    const data = await api.get("/dashboard");
    renderStats(data.stats);
    renderActiveLabs(data.active_labs);
    renderActivityFeed(data.recent_activity);
  } catch (err) {
    console.error("Dashboard data load error:", err);
  }
}

function renderStats(stats) {
  document.getElementById("stat-score").textContent = stats.total_score.toLocaleString();
  document.getElementById("stat-solves-sub").textContent = `${stats.solves_count} challenges solved`;

  document.getElementById("stat-rank").textContent = stats.rank ? `#${stats.rank}` : "Unranked";

  document.getElementById("stat-labs-completed").textContent = `${stats.labs_completed} / ${stats.total_labs}`;
  document.getElementById("stat-labs-in-progress").textContent = `${stats.labs_in_progress} currently in progress`;

  const teamNameEl = document.getElementById("stat-team-name");
  const teamSubEl = document.getElementById("stat-team-rank-sub");

  if (stats.team_name) {
    teamNameEl.textContent = stats.team_name;
    teamSubEl.textContent = stats.team_rank 
      ? `Rank #${stats.team_rank} (${(stats.team_score || 0).toLocaleString()} pts)` 
      : `${(stats.team_score || 0).toLocaleString()} pts`;
  } else {
    teamNameEl.textContent = "Solo Operative";
    teamSubEl.innerHTML = `<a href="/team.html" class="text-cyan">Form or Join a Squad</a>`;
  }
}

function renderActiveLabs(activeLabs) {
  const container = document.getElementById("active-labs-container");
  const countBadge = document.getElementById("active-labs-count");

  countBadge.textContent = `${activeLabs.length} Active`;

  if (!activeLabs || activeLabs.length === 0) {
    container.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: var(--space-6); text-align: center;">
        <p class="text-dim" style="margin-bottom: var(--space-3);">You have no active labs currently in progress.</p>
        <a href="/labs.html" class="btn btn-sm btn-primary">Browse Available Labs</a>
      </div>
    `;
    return;
  }

  let html = "";
  activeLabs.forEach((lab) => {
    let diffBadgeClass = "badge-grey";
    if (lab.difficulty === "Easy") diffBadgeClass = "badge-green";
    else if (lab.difficulty === "Medium") diffBadgeClass = "badge-amber";
    else diffBadgeClass = "badge-red";

    html += `
      <div class="card">
        <div class="card-header">
          <span class="badge ${diffBadgeClass}">${escapeHtml(lab.difficulty)}</span>
          <span class="text-dim text-mono text-xs">Last Active: ${formatRelativeTime(lab.last_activity_at)}</span>
        </div>
        <div class="card-body">
          <h3 style="font-size: var(--text-lg); margin-bottom: var(--space-2);">
            <a href="/lab.html?slug=${encodeURIComponent(lab.slug)}" style="color:#ffffff;">
              ${escapeHtml(lab.title)}
            </a>
          </h3>

          <div style="margin-bottom: var(--space-4);">
            <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); font-family: var(--font-mono); margin-bottom: var(--space-1);">
              <span class="text-dim">PROGRESS</span>
              <span class="text-green">${lab.solved_count} / ${lab.total_count} SOLVED (${lab.percent}%)</span>
            </div>
            <div class="progress-container">
              <div class="progress-bar" style="width: ${lab.percent}%;"></div>
            </div>
          </div>
        </div>

        <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="text-mono text-green text-xs font-bold">+${lab.points_earned} PTS EARNED</span>
          <a href="/lab.html?slug=${encodeURIComponent(lab.slug)}" class="btn btn-sm btn-primary">
            Resume Lab
          </a>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderActivityFeed(events) {
  const tbody = document.getElementById("activity-tbody");

  if (!events || events.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No recent activity events recorded.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  events.forEach((ev) => {
    let actionBadge = `<span class="badge badge-grey">${escapeHtml(ev.event_type)}</span>`;
    let outcome = `<span class="text-dim">Logged</span>`;

    if (ev.event_type === "flag_solved") {
      actionBadge = `<span class="badge badge-green">Flag Captured</span>`;
      outcome = `<span class="text-green text-mono font-bold">+${ev.points || 0} PTS</span>`;
    } else if (ev.event_type === "flag_attempt_wrong") {
      actionBadge = `<span class="badge badge-red">Incorrect Attempt</span>`;
      outcome = `<span class="text-danger">Failed</span>`;
    } else if (ev.event_type === "hint_unlocked") {
      actionBadge = `<span class="badge badge-amber">Hint Unlocked</span>`;
      outcome = `<span class="text-amber">Intel Accessed</span>`;
    } else if (ev.event_type === "lab_completed") {
      actionBadge = `<span class="badge badge-green">Lab Completed</span>`;
      outcome = `<span class="text-green font-bold">100% Cleared</span>`;
    } else if (ev.event_type === "lab_opened") {
      actionBadge = `<span class="badge badge-grey">Lab Initiated</span>`;
      outcome = `<span class="text-dim">Started</span>`;
    }

    html += `
      <tr>
        <td>${actionBadge}</td>
        <td class="font-bold">${escapeHtml(ev.challenge_title || "--")}</td>
        <td>${escapeHtml(ev.room_title || "--")}</td>
        <td>${outcome}</td>
        <td class="text-dim text-mono text-xs">${formatRelativeTime(ev.created_at)}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}
