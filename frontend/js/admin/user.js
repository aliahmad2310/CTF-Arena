/**
 * CTF Arena - Admin Competitor Audit Deep Dive Controller
 * File: frontend/js/admin/user.js
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { showToast } from "../ui.js";

let userId = null;

async function init() {
  await initLayout();
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  const params = new URLSearchParams(window.location.search);
  userId = params.get("id");

  if (!userId) {
    showToast("No competitor ID provided", "error");
    setTimeout(() => { window.location.href = "/admin/progress.html"; }, 1500);
    return;
  }

  await loadUserAuditData();
}

async function loadUserAuditData() {
  try {
    const data = await api.get(`/admin/monitor/users/${userId}`);
    renderHeaderAndMetrics(data);
    renderLabCards(data.labs || []);
    renderRemainingPanel(data.labs || []);
    renderActivityFeed(data.recent_activity || []);
  } catch (err) {
    showToast(err.message || "Failed to load competitor audit", "error");
  }
}

function renderHeaderAndMetrics(data) {
  const u = data.user;
  const nameEl = document.getElementById("user-display-name");
  const subEl = document.getElementById("user-meta-sub");
  const onlineBadge = document.getElementById("user-online-badge");

  if (nameEl) nameEl.textContent = u.display_name;
  if (subEl) {
    const squad = u.team_name ? `Squad: ${u.team_name}` : "Solo Competitor";
    const regDate = u.registered_at ? new Date(u.registered_at).toLocaleDateString() : "";
    subEl.textContent = `@${u.username} | ${squad} | Enrolled: ${regDate}`;
  }

  if (onlineBadge) {
    onlineBadge.textContent = u.is_online ? "ONLINE" : "OFFLINE";
    onlineBadge.className = `badge ${u.is_online ? "badge-green" : "badge-grey"}`;
  }

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl("user-rank", data.rank ? `#${data.rank}` : "Unranked");
  setEl("user-points", u.total_points ?? 0);
  setEl("user-labs-completed", `${u.labs_completed} / ${u.total_labs}`);
  setEl("user-challenges-remaining", data.unsolved_challenges_remaining ?? 0);
}

function renderLabCards(labs) {
  const container = document.getElementById("labs-cards-container");
  if (!container) return;

  if (labs.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: var(--space-6); text-align: center; color: var(--text-dim);">
        No published labs on record.
      </div>
    `;
    return;
  }

  container.innerHTML = labs.map(lab => {
    let statusBadge = '<span class="badge badge-grey">NOT STARTED</span>';
    if (lab.status === "completed") {
      statusBadge = '<span class="badge badge-green">COMPLETED</span>';
    } else if (lab.status === "in_progress") {
      statusBadge = '<span class="badge badge-amber">IN PROGRESS</span>';
    }

    const pct = lab.total_count > 0 ? Math.round((lab.solved_count / lab.total_count) * 100) : 0;
    const timeSpent = lab.duration_seconds
      ? `${Math.round(lab.duration_seconds / 60)} mins`
      : lab.status === "in_progress" ? "In progress" : "--";

    return `
      <div class="card" style="margin-bottom: var(--space-4);">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2px;">
              ${statusBadge}
              <span class="badge badge-grey text-xs">${lab.difficulty.toUpperCase()}</span>
              <a href="/admin/lab.html?id=${lab.room_id}" style="font-weight: 700; color: #ffffff; font-size: var(--text-base);">
                ${escapeHtml(lab.title)}
              </a>
            </div>
            <div class="text-mono text-dim text-xs">
              Solved: ${lab.solved_count}/${lab.total_count} (${pct}%) | Points Earned: ${lab.points_earned} | Time: ${timeSpent}
            </div>
          </div>
          <div>
            <a href="/admin/lab.html?id=${lab.room_id}" class="btn btn-xs btn-outline">Lab Metrics</a>
          </div>
        </div>

        <div class="table-container" style="border: none; border-radius: 0;">
          <table class="table" style="margin: 0; font-size: var(--text-xs);">
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Category</th>
                <th>Points</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Hints Used</th>
                <th>Solved At</th>
              </tr>
            </thead>
            <tbody>
              ${lab.challenges.map(ch => {
                const isSolved = ch.is_solved;
                const statusLabel = isSolved
                  ? '<span class="badge badge-green" style="font-size:10px;">SOLVED</span>'
                  : '<span class="badge badge-grey" style="font-size:10px;">UNSOLVED</span>';

                const solvedTime = ch.solved_at ? new Date(ch.solved_at).toLocaleTimeString() : "--";

                return `
                  <tr>
                    <td style="font-weight: 500; color: #ffffff;">${escapeHtml(ch.title)}</td>
                    <td><span class="badge badge-grey" style="font-size:10px;">${escapeHtml(ch.category)}</span></td>
                    <td class="text-mono">${ch.points}</td>
                    <td>${statusLabel}</td>
                    <td class="text-mono">${ch.attempts_count}</td>
                    <td class="text-mono">${ch.hints_used_count}</td>
                    <td class="text-mono text-dim text-xs">${solvedTime}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");
}

function renderRemainingPanel(labs) {
  const container = document.getElementById("remaining-panel-body");
  if (!container) return;

  const unfinished = labs.filter(l => l.status !== "completed");
  if (unfinished.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--status-green-text); font-size: var(--text-xs); padding: var(--space-4);">
        Full Completion: All published labs solved.
      </div>
    `;
    return;
  }

  container.innerHTML = unfinished.map(lab => {
    const unsolvedCount = lab.total_count - lab.solved_count;
    const statusClass = lab.status === "in_progress" ? "text-accent" : "text-dim";

    return `
      <div style="border-bottom: 1px solid var(--border-subtle); padding: var(--space-2) 0;">
        <div style="display: flex; justify-content: space-between; font-size: var(--text-xs);">
          <span style="font-weight: 600; color: #ffffff;">${escapeHtml(lab.title)}</span>
          <span class="${statusClass} text-mono">${unsolvedCount} left</span>
        </div>
        <div class="text-dim text-xs">
          ${lab.status === "in_progress" ? "In progress - partial solves" : "Not yet started"}
        </div>
      </div>
    `;
  }).join("");
}

function renderActivityFeed(events) {
  const container = document.getElementById("user-activity-feed");
  if (!container) return;

  if (events.length === 0) {
    container.innerHTML = `
      <div class="text-dim text-xs" style="text-align: center; padding: var(--space-4);">
        No recent audit events logged.
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(e => {
    const time = e.created_at ? new Date(e.created_at).toLocaleTimeString() : "";
    const eventName = e.event_type.replace(/_/g, " ").toUpperCase();

    return `
      <div style="padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle); font-size: var(--text-xs);">
        <div style="display: flex; justify-content: space-between;">
          <span class="text-mono" style="font-weight: 600; color: #ffffff;">${eventName}</span>
          <span class="text-mono text-dim" style="font-size: 10px;">${time}</span>
        </div>
        <div class="text-dim" style="font-size: 11px;">
          ${escapeHtml(e.room_title || "Lobby")}${e.challenge_title ? ` - ${escapeHtml(e.challenge_title)}` : ""}
        </div>
      </div>
    `;
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
