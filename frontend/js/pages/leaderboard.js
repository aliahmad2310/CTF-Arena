/**
 * CTF Arena leaderboard controller.
 */
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { getUserProfile, requireAdmin } from "../auth.js";
import { escapeHtml, debounce } from "../utils.js";
import { showToast } from "../ui.js";

let activeTab = "teams";
let currentProfile = null;
let isAdmin = false;
let refreshInterval = 15;
let remainingSeconds = 15;
let countdownTimer = null;
let serverTimeOffsetMs = 0;
let observedRefreshSlot = null;
let displayedCountdownSecond = null;
let currentPage = 1;
let totalPages = 1;
let totalEntries = 0;
let refreshRequestId = 0;
const PAGE_SIZE = 6;

function updateCountdownDisplay() {
  const secEl = document.getElementById("leaderboard-countdown-sec");
  if (secEl) {
    secEl.textContent = String(remainingSeconds);
  }
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  observedRefreshSlot = getRefreshSlot();
  updateCountdownFromServerClock();

  countdownTimer = setInterval(() => {
    const currentSlot = getRefreshSlot();
    updateCountdownFromServerClock();
    if (document.hidden || currentSlot === observedRefreshSlot) return;

    observedRefreshSlot = currentSlot;
    void refreshAtGlobalBoundary();
  }, 250);
}

function getServerNowMs() {
  return Date.now() + serverTimeOffsetMs;
}

function getRefreshSlot() {
  return Math.floor(getServerNowMs() / (refreshInterval * 1000));
}

function updateCountdownFromServerClock() {
  const intervalMs = refreshInterval * 1000;
  const remainder = getServerNowMs() % intervalMs;
  remainingSeconds = Math.max(1, Math.ceil((intervalMs - remainder) / 1000));
  if (remainingSeconds !== displayedCountdownSecond) {
    displayedCountdownSecond = remainingSeconds;
    updateCountdownDisplay();
  }
}

function applyServerSchedule(status, clientReferenceMs = Date.now()) {
  if (Number.isInteger(status?.leaderboard_refresh_seconds) && status.leaderboard_refresh_seconds >= 1) {
    refreshInterval = status.leaderboard_refresh_seconds;
  }
  const serverTimeMs = Date.parse(status?.server_time || "");
  if (Number.isFinite(serverTimeMs)) serverTimeOffsetMs = serverTimeMs - clientReferenceMs;
  observedRefreshSlot = getRefreshSlot();
  displayedCountdownSecond = null;
  updateCountdownFromServerClock();
}

async function synchronizeServerSchedule() {
  const requestStartedAt = Date.now();
  const status = await api.get("/ctf/status", undefined, { skipPublicCache: true });
  const requestCompletedAt = Date.now();
  const requestMidpoint = requestStartedAt + ((requestCompletedAt - requestStartedAt) / 2);
  applyServerSchedule(status, requestMidpoint);
  return status;
}

async function refreshAtGlobalBoundary() {
  let previousRefreshInterval = refreshInterval;
  try {
    // The API is the source of truth for both interval changes and the UTC clock anchor.
    await synchronizeServerSchedule();
  } catch (err) {
    console.warn("Could not synchronize the leaderboard refresh schedule:", err);
  }
  if (previousRefreshInterval !== refreshInterval) {
    observedRefreshSlot = getRefreshSlot();
    return;
  }
  await refreshLeaderboard(true);
}

document.addEventListener("DOMContentLoaded", async () => {
  currentProfile = await getUserProfile();
  isAdmin = currentProfile?.role === "admin";
  await initLayout();
  if (isAdmin) {
    try {
      await requireAdmin();
      document.getElementById("leaderboard-search").placeholder = "Search team or user...";
    } catch {
      isAdmin = false;
    }
  }
  bindTabs();
  bindSearch();
  bindPagination();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refreshLeaderboard(true);
  });
  updateHeader();
  if (isAdmin) {
    const subtitle = document.getElementById("leaderboard-subtitle");
    if (subtitle) subtitle.textContent = "Admin view: click a user or team to inspect lab progress and activity.";
    initAdminRefreshControl();
  }

  try {
    const status = await synchronizeServerSchedule();
    if (status) {
      const input = document.getElementById("admin-refresh-input");
      if (input) input.value = refreshInterval;
    }
  } catch (err) {
    console.warn("Could not query CTF status for scoreboard refresh interval:", err);
  }

  await refreshLeaderboard();
  startCountdown();
});

function initAdminRefreshControl() {
  const box = document.getElementById("admin-refresh-box");
  const input = document.getElementById("admin-refresh-input");
  const saveBtn = document.getElementById("admin-refresh-save-btn");
  if (!box || !input || !saveBtn) return;

  box.style.display = "inline-flex";
  input.value = refreshInterval;

  saveBtn.onclick = async () => {
    const newSec = parseInt(input.value, 10);
    if (isNaN(newSec) || newSec < 1 || newSec > 3600) {
      showToast("Refresh interval must be between 1 and 3600 seconds", "error");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await api.patch("/admin/settings", { leaderboard_refresh_seconds: newSec });
      await synchronizeServerSchedule();
      showToast(`Scoreboard auto-refresh interval updated to ${newSec}s`, "success");
    } catch (err) {
      showToast(err.message || "Failed to update interval", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Set Sec";
    }
  };
}

window.addEventListener("beforeunload", () => {
  if (countdownTimer) clearInterval(countdownTimer);
});

function bindTabs() {
  document.getElementById("tab-teams").addEventListener("click", async () => {
    if (activeTab === "teams") return;
    activeTab = "teams";
    currentPage = 1;
    setActiveTab("tab-teams", "tab-users");
    updateHeader();
    await refreshLeaderboard();
  });
  document.getElementById("tab-users").addEventListener("click", async () => {
    if (activeTab === "users") return;
    activeTab = "users";
    currentPage = 1;
    setActiveTab("tab-users", "tab-teams");
    updateHeader();
    await refreshLeaderboard();
  });
}

function setActiveTab(activeId, inactiveId) {
  const active = document.getElementById(activeId);
  const inactive = document.getElementById(inactiveId);
  active.style.background = "var(--bg-card)";
  active.style.color = "var(--accent-green)";
  active.style.borderBottomColor = "var(--accent-green)";
  inactive.style.background = "var(--bg-surface)";
  inactive.style.color = "var(--text-muted)";
  inactive.style.borderBottomColor = "transparent";
}

function bindSearch() {
  const input = document.getElementById("leaderboard-search");
  input.addEventListener("input", debounce(() => {
    currentPage = 1;
    void refreshLeaderboard();
  }, 300));
}

function bindPagination() {
  document.getElementById("leaderboard-prev")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      void refreshLeaderboard();
    }
  });
  document.getElementById("leaderboard-next")?.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      void refreshLeaderboard();
    }
  });
}

function updateHeader() {
  const head = document.getElementById("leaderboard-thead");
  if (activeTab === "teams" && isAdmin) {
    head.innerHTML = "<tr><th>Rank</th><th>Team</th><th>Members</th><th>Current Labs</th><th>Completed Labs</th><th>Score</th></tr>";
  } else if (activeTab === "teams") {
    head.innerHTML = "<tr><th>Rank</th><th>Team</th><th>Members</th><th>Solves</th><th>Score</th></tr>";
  } else {
    head.innerHTML = `<tr><th>Rank</th><th>Name</th>${isAdmin ? "<th>Team</th>" : ""}<th>Solves</th><th>Score</th></tr>`;
  }
}

async function refreshLeaderboard(background = false) {
  const requestId = ++refreshRequestId;
  if (!background) {
    remainingSeconds = refreshInterval;
    updateCountdownDisplay();
  }
  const body = document.getElementById("leaderboard-tbody");
  const columns = activeTab === "teams" ? (isAdmin ? 6 : 5) : (isAdmin ? 5 : 4);
  if (!background) body.innerHTML = `<tr><td colspan="${columns}" style="text-align:center;padding:var(--space-6);">Loading standings...</td></tr>`;
  setPaginationLoading(true);
  const query = document.getElementById("leaderboard-search").value.trim();
  try {
    if (activeTab === "teams") {
      const response = await api.get("/leaderboard/teams", { page: currentPage, page_size: PAGE_SIZE, q: query }, { skipPublicCache: true });
      if (requestId !== refreshRequestId) return;
      if (!updatePagination(response.total, response.entries?.length || 0, "teams")) return;
      if (isAdmin) {
        try {
          const details = await api.get("/admin/monitor/teams", { page: currentPage, page_size: PAGE_SIZE });
          if (requestId !== refreshRequestId) return;
          renderAdminTeams(response.entries || [], details.teams || []);
        } catch (error) {
          if (requestId !== refreshRequestId) return;
          console.warn("Admin team progress is unavailable; displaying scoreboard standings only.", error);
          renderAdminTeams(response.entries || [], []);
        }
      } else {
        renderTeams(response.entries || []);
      }
    } else {
      const response = await api.get("/leaderboard/users", { page: currentPage, page_size: PAGE_SIZE, q: query }, { skipPublicCache: true });
      if (requestId !== refreshRequestId) return;
      if (!updatePagination(response.total, response.entries?.length || 0, "accounts")) return;
      renderUsers(response.entries || []);
    }
  } catch (error) {
    if (requestId !== refreshRequestId) return;
    body.innerHTML = `<tr><td colspan="${columns}" style="text-align:center;color:var(--status-red-text);padding:var(--space-6);">${escapeHtml(error.message || "Unable to load leaderboard")}</td></tr>`;
  } finally {
    if (requestId === refreshRequestId) setPaginationLoading(false);
  }
}

function updatePagination(total, visibleCount, itemLabel) {
  totalEntries = Number.isFinite(Number(total)) ? Number(total) : 0;
  totalPages = Math.max(1, Math.ceil(totalEntries / PAGE_SIZE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
    void refreshLeaderboard(true);
    return false;
  }

  const start = totalEntries === 0 ? 0 : ((currentPage - 1) * PAGE_SIZE) + 1;
  const end = totalEntries === 0 ? 0 : Math.min(start + visibleCount - 1, totalEntries);
  const info = document.getElementById("leaderboard-page-info");
  if (info) info.textContent = `Showing ${start}-${end} of ${totalEntries} ${itemLabel} · Page ${currentPage} of ${totalPages}`;
  const previous = document.getElementById("leaderboard-prev");
  const next = document.getElementById("leaderboard-next");
  if (previous) previous.disabled = currentPage <= 1;
  if (next) next.disabled = currentPage >= totalPages;
  return true;
}

function setPaginationLoading(isLoading) {
  const previous = document.getElementById("leaderboard-prev");
  const next = document.getElementById("leaderboard-next");
  if (previous) previous.disabled = isLoading || currentPage <= 1;
  if (next) next.disabled = isLoading || currentPage >= totalPages;
}

function renderTeams(teams) {
  const body = document.getElementById("leaderboard-tbody");
  if (!teams.length) {
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:var(--space-6);">No teams found on the scoreboard.</td></tr>';
    return;
  }
  const myTeamId = currentProfile?.team_id;
  body.innerHTML = teams.map((team) => {
    const mine = String(team.team_id) === String(myTeamId);
    const rankClass = team.rank === 1 ? "text-green font-bold" : team.rank <= 3 ? "text-cyan font-bold" : "text-mono";
    return `<tr><td class="${rankClass}">#${team.rank}</td><td><a href="/team-profile.html?id=${encodeURIComponent(team.team_id)}" class="text-bold">${escapeHtml(team.team_name)}</a>${mine ? '<span class="badge badge-green">Your Team</span>' : ""}</td><td>${team.member_count} Operatives</td><td>${team.solves_count}</td><td class="text-green text-mono font-bold">${Number(team.score || 0).toLocaleString()}</td></tr>`;
  }).join("");
}

function renderAdminTeams(teams, progressTeams) {
  const body = document.getElementById("leaderboard-tbody");
  if (!teams.length) {
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--space-6);">No teams found on the scoreboard.</td></tr>';
    return;
  }
  const progressByTeam = new Map(progressTeams.map((team) => [String(team.team_id), team]));
  body.innerHTML = teams.map((team) => {
    const progress = progressByTeam.get(String(team.team_id)) || {};
    const currentLabs = (progress.current_labs || []).map(escapeHtml).join(", ") || "None";
    const completedLabs = (progress.completed_labs || []).map(escapeHtml).join(", ") || "None";
    return `<tr><td>#${team.rank}</td><td><a class="text-bold" href="/admin/team.html?id=${encodeURIComponent(team.team_id)}">${escapeHtml(team.team_name)}</a></td><td>${team.member_count || progress.member_count || 0} / ${progress.max_members || 4} (${progress.members_online || 0} online)</td><td>${currentLabs}</td><td>${completedLabs}</td><td class="text-green text-mono font-bold">${Number(team.score || 0).toLocaleString()}</td></tr>`;
  }).join("");
}

function renderUsers(users) {
  const body = document.getElementById("leaderboard-tbody");
  const columns = isAdmin ? 5 : 4;
  if (!users.length) {
    body.innerHTML = `<tr><td colspan="${columns}" style="text-align:center;padding:var(--space-6);">No competitors ranked yet.</td></tr>`;
    return;
  }
  body.innerHTML = users.map((user) => {
    const nameUrl = isAdmin ? `/admin/user.html?id=${encodeURIComponent(user.user_id)}` : `/profile.html?username=${encodeURIComponent(user.username)}`;
    const userCell = `<a href="${nameUrl}" class="text-bold">${escapeHtml(user.username)}</a><span class="text-dim text-xs"> (${escapeHtml(user.display_name)})</span>`;
    return `<tr><td>#${user.rank}</td><td>${userCell}</td>${isAdmin ? `<td>${escapeHtml(user.team_name || "Solo")}</td>` : ""}<td>${user.solves_count}</td><td class="text-green text-mono font-bold">${Number(user.score || 0).toLocaleString()}</td></tr>`;
  }).join("");
}
