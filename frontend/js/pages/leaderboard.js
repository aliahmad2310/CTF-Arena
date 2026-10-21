/**
 * CTF Arena leaderboard controller.
 */
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { getUserProfile, requireAdmin } from "../auth.js";
import { escapeHtml, debounce } from "../utils.js";

let activeTab = "teams";
let currentProfile = null;
let isAdmin = false;
let pollTimer = null;
const PAGE_SIZE = 100;

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
  updateHeader();
  if (isAdmin) {
    const subtitle = document.getElementById("leaderboard-subtitle");
    if (subtitle) subtitle.textContent = "Admin view: click a user or team to inspect lab progress and activity.";
  }
  await refreshLeaderboard();
  pollTimer = setInterval(() => {
    if (!document.hidden) void refreshLeaderboard(true);
  }, 15000);
});

window.addEventListener("beforeunload", () => {
  if (pollTimer) clearInterval(pollTimer);
});

function bindTabs() {
  document.getElementById("tab-teams").addEventListener("click", async () => {
    if (activeTab === "teams") return;
    activeTab = "teams";
    setActiveTab("tab-teams", "tab-users");
    updateHeader();
    await refreshLeaderboard();
  });
  document.getElementById("tab-users").addEventListener("click", async () => {
    if (activeTab === "users") return;
    activeTab = "users";
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
  input.addEventListener("input", debounce(() => refreshLeaderboard(), 300));
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
  const body = document.getElementById("leaderboard-tbody");
  const columns = activeTab === "teams" ? (isAdmin ? 6 : 5) : (isAdmin ? 5 : 4);
  if (!background) body.innerHTML = `<tr><td colspan="${columns}" style="text-align:center;padding:var(--space-6);">Loading standings...</td></tr>`;
  const query = document.getElementById("leaderboard-search").value.trim();
  try {
    if (activeTab === "teams") {
      const response = await api.get("/leaderboard/teams", { page: 1, page_size: PAGE_SIZE, q: query });
      if (isAdmin) {
        const details = await api.get("/admin/monitor/teams", { page: 1, page_size: PAGE_SIZE });
        renderAdminTeams(response.entries || [], details.teams || []);
      } else {
        renderTeams(response.entries || []);
      }
    } else {
      const response = await api.get("/leaderboard/users", { page: 1, page_size: PAGE_SIZE, q: query });
      renderUsers(response.entries || []);
    }
  } catch (error) {
    body.innerHTML = `<tr><td colspan="${columns}" style="text-align:center;color:var(--status-red-text);padding:var(--space-6);">${escapeHtml(error.message || "Unable to load leaderboard")}</td></tr>`;
  }
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
