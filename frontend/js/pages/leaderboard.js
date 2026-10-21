/**
 * CTF Arena - Leaderboard Controller
 * File: frontend/js/pages/leaderboard.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { getUserProfile } from "../auth.js";
import { escapeHtml, formatRelativeTime, debounce } from "../utils.js";
import { CONFIG } from "../config.js";

let activeTab = "teams"; // 'teams' | 'users'
let chartInstance = null;
let pollTimer = null;
let currentProfile = null;
let refreshIntervalSeconds = 15;
const teamColors = new Map();
const timelineColors = [
  "#00ff66", "#00f0ff", "#fbbf24", "#f87171", "#a78bfa",
  "#38bdf8", "#34d399", "#f472b6", "#e879f9", "#818cf8"
];

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await getUserProfile();
  await initLayout();

  initTabs();
  initSearch();

  // Retrieve competition settings for dynamic leaderboard refresh rate
  try {
    const statusData = await api.get("/ctf/status");
    if (statusData && typeof statusData.leaderboard_refresh_seconds === "number") {
      refreshIntervalSeconds = statusData.leaderboard_refresh_seconds;
    }
  } catch {
    refreshIntervalSeconds = 15;
  }

  const subtitleEl = document.getElementById("leaderboard-subtitle");
  if (subtitleEl) {
    if (refreshIntervalSeconds === 0) {
      subtitleEl.textContent = "Live rankings auto-refresh is paused by administrator. Manual refresh available.";
    } else {
      subtitleEl.textContent = `Live rankings update automatically every ${refreshIntervalSeconds} seconds. Earliest timestamp breaks score ties.`;
    }
  }

  await refreshAll();

  // Dynamic Polling loop for live refresh
  if (refreshIntervalSeconds > 0) {
    pollTimer = setInterval(async () => {
      if (!document.hidden) {
        await refreshAll(true);
      }
    }, refreshIntervalSeconds * 1000);
  }
});

window.addEventListener("beforeunload", () => {
  if (pollTimer) clearInterval(pollTimer);
});

async function refreshAll(isBackground = false) {
  if (activeTab === "teams") {
    await fetchTeamsLeaderboard(isBackground);
  } else {
    await fetchUsersLeaderboard(isBackground);
  }

  if (!isBackground || !chartInstance) {
    await fetchAndRenderTimeline();
  }
}

function initTabs() {
  const tabTeams = document.getElementById("tab-teams");
  const tabUsers = document.getElementById("tab-users");

  tabTeams.onclick = async () => {
    if (activeTab === "teams") return;
    activeTab = "teams";

    tabTeams.style.background = "var(--bg-card)";
    tabTeams.style.color = "var(--accent-green)";
    tabTeams.style.borderBottomColor = "var(--accent-green)";

    tabUsers.style.background = "var(--bg-surface)";
    tabUsers.style.color = "var(--text-muted)";
    tabUsers.style.borderBottomColor = "transparent";

    updateTableHeader();
    await fetchTeamsLeaderboard();
  };

  tabUsers.onclick = async () => {
    if (activeTab === "users") return;
    activeTab = "users";

    tabUsers.style.background = "var(--bg-card)";
    tabUsers.style.color = "var(--accent-green)";
    tabUsers.style.borderBottomColor = "var(--accent-green)";

    tabTeams.style.background = "var(--bg-surface)";
    tabTeams.style.color = "var(--text-muted)";
    tabTeams.style.borderBottomColor = "transparent";

    updateTableHeader();
    await fetchUsersLeaderboard();
  };
}

function updateTableHeader() {
  const thead = document.getElementById("leaderboard-thead");
  if (activeTab === "teams") {
    thead.innerHTML = `
      <tr>
        <th style="width: 80px;">Rank</th>
        <th>Team</th>
        <th>Members</th>
        <th>Solves</th>
        <th>Score</th>
      </tr>
    `;
  } else {
    thead.innerHTML = `
      <tr>
        <th style="width: 80px;">Rank</th>
        <th>Name</th>
        <th>Solves</th>
        <th>Score</th>
      </tr>
    `;
  }
}

function initSearch() {
  const searchInput = document.getElementById("leaderboard-search");
  searchInput.addEventListener("input", debounce(async () => {
    const q = searchInput.value.trim();
    if (activeTab === "teams") {
      await fetchTeamsLeaderboard(false, q);
    } else {
      await fetchUsersLeaderboard(false, q);
    }
  }, 300));
}

async function fetchTeamsLeaderboard(isBackground = false, query = "") {
  const tbody = document.getElementById("leaderboard-tbody");
  if (!isBackground) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-8);">Refreshing standings...</td></tr>`;
  }

  try {
    const data = await api.get("/leaderboard/teams", { q: query });
    renderTeamsTable(data.entries);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderTeamsTable(entries) {
  const tbody = document.getElementById("leaderboard-tbody");

  if (!entries || entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-8);">No teams found on the scoreboard.</td></tr>`;
    return;
  }

  let html = "";
  const myTeamId = currentProfile ? currentProfile.team_id : null;

  entries.forEach((team) => {
    const isMyTeam = (String(team.team_id) === String(myTeamId));
    const rankClass = team.rank === 1 ? "text-green font-bold" : team.rank <= 3 ? "text-cyan font-bold" : "text-mono";

    html += `
      <tr style="${isMyTeam ? "background-color: rgba(0, 255, 102, 0.05); border-left: 3px solid var(--accent-green);" : ""}">
        <td class="${rankClass}">#${team.rank}</td>
        <td>
          <a href="/team-profile.html?id=${encodeURIComponent(team.team_id)}" class="text-bold">
            ${escapeHtml(team.team_name)}
          </a>
          ${isMyTeam ? `<span class="badge badge-green" style="margin-left: 0.5rem; font-size: 0.65rem;">Your Team</span>` : ""}
        </td>
        <td class="text-dim text-xs">${team.member_count} Operatives</td>
        <td class="text-mono">${team.solves_count}</td>
        <td class="text-green text-mono font-bold">${team.score.toLocaleString()}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function fetchUsersLeaderboard(isBackground = false, query = "") {
  const tbody = document.getElementById("leaderboard-tbody");
  if (!isBackground) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: var(--space-8);">Refreshing standings...</td></tr>`;
  }

  try {
    const data = await api.get("/leaderboard/users", { q: query });
    renderUsersTable(data.entries);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderUsersTable(entries) {
  const tbody = document.getElementById("leaderboard-tbody");

  if (!entries || entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: var(--space-8);">No competitors ranked yet.</td></tr>`;
    return;
  }

  let html = "";
  const myUserId = currentProfile ? currentProfile.id : null;

  entries.forEach((user) => {
    const isMe = (String(user.user_id) === String(myUserId));
    const rankClass = user.rank === 1 ? "text-green font-bold" : user.rank <= 3 ? "text-cyan font-bold" : "text-mono";

    html += `
      <tr style="${isMe ? "background-color: rgba(0, 255, 102, 0.05); border-left: 3px solid var(--accent-green);" : ""}">
        <td class="${rankClass}">#${user.rank}</td>
        <td>
          <a href="/profile.html?username=${encodeURIComponent(user.username)}" class="text-bold">
            ${escapeHtml(user.username)}
          </a>
          <span class="text-dim text-xs" style="margin-left: 0.35rem;">(${escapeHtml(user.display_name)})</span>
          ${isMe ? `<span class="badge badge-green" style="margin-left: 0.5rem; font-size: 0.65rem;">You</span>` : ""}
        </td>
        <td class="text-mono">${user.solves_count}</td>
        <td class="text-green text-mono font-bold">${user.score.toLocaleString()}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

async function fetchAndRenderTimeline() {
  const canvas = document.getElementById("timeline-chart");
  if (!canvas || !window.Chart) return;

  try {
    const data = await api.get("/leaderboard/timeline");
    const emptyEl = document.getElementById("timeline-empty");

    const seriesWithPoints = (data.series || []).filter((series) => series.points && series.points.length > 0);
    if (seriesWithPoints.length === 0) {
      if (emptyEl) emptyEl.style.display = "flex";
      canvas.style.display = "none";
      return;
    }

    if (emptyEl) emptyEl.style.display = "none";
    canvas.style.display = "block";

    const visibleColors = new Set();
    const datasets = seriesWithPoints.map((s) => {
      let color = teamColors.get(s.id);
      if (!color || visibleColors.has(color)) {
        color = timelineColors.find((candidate) => !visibleColors.has(candidate))
          || timelineColors[visibleColors.size % timelineColors.length];
        teamColors.set(s.id, color);
      }
      visibleColors.add(color);
      const points = s.points.map(p => ({
        x: new Date(p.timestamp).getTime(),
        y: p.score
      })).sort((a, b) => a.x - b.x);

      return {
        label: s.name,
        data: points,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 3,
        pointHoverRadius: 6
      };
    });

    if (chartInstance) {
      chartInstance.data.datasets = datasets;
      chartInstance.update();
      return;
    }

    const ctx = canvas.getContext("2d");
    chartInstance = new window.Chart(ctx, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: "#94a3b8",
              font: { family: "monospace", size: 11 },
              boxWidth: 12
            }
          },
          tooltip: {
            backgroundColor: "#0d111a",
            titleColor: "#ffffff",
            bodyColor: "#e2e8f0",
            borderColor: "#334155",
            borderWidth: 1
          }
        },
        scales: {
          x: {
            type: "linear",
            grid: { color: "#1e293b" },
            ticks: {
              color: "#64748b",
              font: { family: "monospace", size: 10 },
              callback: (value) => new Date(Number(value)).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })
            },
            title: { display: true, text: "Solve time", color: "#94a3b8" }
          },
          y: {
            grid: { color: "#1e293b" },
            ticks: { color: "#64748b", font: { family: "monospace", size: 10 } },
            title: { display: true, text: "Cumulative points", color: "#94a3b8" },
            beginAtZero: true
          }
        }
      }
    });
  } catch (err) {
    console.warn("Could not render timeline chart:", err);
  }
}
