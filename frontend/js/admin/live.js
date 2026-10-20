/**
 * CTF Arena - Admin Live Activity Controller
 * File: frontend/js/admin/live.js
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { showToast } from "../ui.js";

let pollInterval = null;
let countdownSeconds = 10;
let countdownTimer = null;
let allEventsCache = [];

async function init() {
  await initLayout();
  const user = await requireAdmin();
  if (!user) return;

  setupListeners();
  await refreshLiveData();

  startPolling();
}

function setupListeners() {
  const manualBtn = document.getElementById("manual-refresh-btn");
  if (manualBtn) {
    manualBtn.addEventListener("click", async () => {
      manualBtn.disabled = true;
      await refreshLiveData();
      countdownSeconds = 10;
      manualBtn.disabled = false;
      showToast("Live telemetry refreshed", "info");
    });
  }

  const typeFilter = document.getElementById("event-type-filter");
  if (typeFilter) {
    typeFilter.addEventListener("change", () => {
      renderEventsFeed(allEventsCache);
    });
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  if (countdownTimer) clearInterval(countdownTimer);

  countdownSeconds = 10;
  countdownTimer = setInterval(() => {
    countdownSeconds -= 1;
    const el = document.getElementById("countdown-indicator");
    if (el) {
      el.textContent = `Next poll in ${countdownSeconds}s`;
    }
    if (countdownSeconds <= 0) {
      countdownSeconds = 10;
    }
  }, 1000);

  pollInterval = setInterval(async () => {
    await refreshLiveData();
  }, 10000);
}

async function refreshLiveData() {
  try {
    const [users, events] = await Promise.all([
      api.get("/admin/monitor/live"),
      api.get("/admin/monitor/events")
    ]);

    allEventsCache = events || [];
    renderOnlineUsers(users || []);
    renderEventsFeed(allEventsCache);
  } catch (err) {
    console.error("Failed to refresh live data:", err);
  }
}

function renderOnlineUsers(users) {
  const tbody = document.getElementById("online-users-tbody");
  const countBadge = document.getElementById("online-count-badge");
  if (!tbody) return;

  if (countBadge) {
    countBadge.textContent = `${users.length} Online`;
    countBadge.className = `badge ${users.length > 0 ? "badge-green" : "badge-grey"}`;
  }

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No competitors active within the last 5 minutes.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const lastSeen = u.last_seen_at ? new Date(u.last_seen_at).toLocaleTimeString() : "Never";
    const lastEvent = u.last_event_type ? u.last_event_type.replace(/_/g, " ").toUpperCase() : "HEARTBEAT";

    return `
      <tr>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(u.display_name)}</div>
          <div class="text-mono text-dim text-xs">@${escapeHtml(u.username)}</div>
        </td>
        <td>
          ${u.team_name ? `<span class="badge badge-grey">${escapeHtml(u.team_name)}</span>` : '<span class="text-dim text-xs">Solo</span>'}
        </td>
        <td>
          ${u.current_room_title ? `<span class="text-accent" style="color: var(--accent-cyan); font-weight: 500;">${escapeHtml(u.current_room_title)}</span>` : '<span class="text-dim text-xs">Lobby / Browse</span>'}
        </td>
        <td>
          ${u.current_challenge_title ? `<span>${escapeHtml(u.current_challenge_title)}</span>` : '<span class="text-dim text-xs">--</span>'}
        </td>
        <td class="text-mono text-xs text-dim">
          ${lastSeen}
        </td>
        <td>
          <span class="badge badge-grey" style="font-size: 10px;">${escapeHtml(lastEvent)}</span>
        </td>
        <td>
          <a href="/admin/user.html?id=${u.user_id}" class="btn btn-xs btn-outline">Audit</a>
        </td>
      </tr>
    `;
  }).join("");
}

function renderEventsFeed(events) {
  const tbody = document.getElementById("events-feed-tbody");
  const typeFilter = document.getElementById("event-type-filter")?.value;
  if (!tbody) return;

  let filtered = events;
  if (typeFilter) {
    filtered = events.filter(e => e.event_type === typeFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No audit events recorded matching current filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    const timeStr = e.created_at ? new Date(e.created_at).toLocaleTimeString() : "";
    let badgeClass = "badge-grey";
    let eventLabel = e.event_type;

    if (e.event_type === "flag_solved") {
      badgeClass = "badge-green";
      eventLabel = "FLAG SOLVED";
    } else if (e.event_type === "flag_attempt_wrong") {
      badgeClass = "badge-red";
      eventLabel = "WRONG ATTEMPT";
    } else if (e.event_type === "hint_unlocked") {
      badgeClass = "badge-amber";
      eventLabel = "HINT UNLOCKED";
    } else if (e.event_type === "lab_completed") {
      badgeClass = "badge-green";
      eventLabel = "LAB COMPLETED";
    } else if (e.event_type === "lab_opened") {
      badgeClass = "badge-grey";
      eventLabel = "LAB OPENED";
    }

    const metaParts = [];
    if (e.metadata && typeof e.metadata === "object") {
      if (e.metadata.points) metaParts.push(`+${e.metadata.points} pts`);
      if (e.metadata.penalty) metaParts.push(`-${e.metadata.penalty} cost`);
      if (e.metadata.attempt_count) metaParts.push(`Try #${e.metadata.attempt_count}`);
      if (e.metadata.is_first_blood) metaParts.push("First Blood");
    }
    const metaStr = metaParts.join(" | ") || "--";

    return `
      <tr>
        <td class="text-mono text-xs text-dim">${timeStr}</td>
        <td><span class="badge ${badgeClass}" style="font-size: 10px;">${eventLabel}</span></td>
        <td>
          <a href="/admin/user.html?id=${e.user_id}" style="font-weight: 500; color: #ffffff;">
            ${escapeHtml(e.display_name)}
          </a>
          <span class="text-mono text-dim text-xs">(@${escapeHtml(e.username)})</span>
        </td>
        <td>
          ${e.team_name ? `<span class="badge badge-grey">${escapeHtml(e.team_name)}</span>` : '<span class="text-dim text-xs">Solo</span>'}
        </td>
        <td>
          <div style="font-size: var(--text-xs); color: #ffffff;">${escapeHtml(e.room_title || "General")}</div>
          ${e.challenge_title ? `<div class="text-dim text-xs">${escapeHtml(e.challenge_title)}</div>` : ""}
        </td>
        <td class="text-mono text-xs text-dim">
          ${escapeHtml(metaStr)}
        </td>
      </tr>
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
window.addEventListener("beforeunload", () => {
  if (pollInterval) clearInterval(pollInterval);
  if (countdownTimer) clearInterval(countdownTimer);
});
