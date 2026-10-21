/**
 * CTF Arena - Team Page Controller
 * File: frontend/js/pages/team.js
 * Strictly zero emoji.
 */

import { requireAuth, startHeartbeat } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { escapeHtml } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  let profile;
  try {
    profile = await requireAuth();
  } catch {
    return;
  }

  await initLayout();
  startHeartbeat();

  await loadTeamState(profile);
});

async function loadTeamState(profile) {
  const noTeamView = document.getElementById("no-team-view");
  const activeTeamView = document.getElementById("active-team-view");

  try {
    const team = await api.get("/teams/me");
    noTeamView?.classList.add("hidden");
    activeTeamView?.classList.remove("hidden");
    renderActiveTeam(team, profile);
  } catch (err) {
    activeTeamView?.classList.add("hidden");
    noTeamView?.classList.remove("hidden");
  }
}

function renderActiveTeam(team, profile) {
  const nameEl = document.getElementById("team-name");
  const scoreEl = document.getElementById("team-score");
  const rankEl = document.getElementById("team-rank");
  const countEl = document.getElementById("team-member-count");

  if (nameEl) nameEl.textContent = team.name || "--";
  if (scoreEl) scoreEl.textContent = Number(team.score || 0).toLocaleString();
  if (rankEl) rankEl.textContent = team.rank ? `#${team.rank}` : "Unranked";
  if (countEl) countEl.textContent = `${(team.members || []).length} members`;

  // Render Roster: Member, Labs Solved, Points
  const tbody = document.getElementById("roster-tbody");
  if (!tbody) return;

  if (!team.members || team.members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">No operatives assigned yet.</td></tr>`;
    return;
  }

  let rowsHtml = "";
  team.members.forEach((member) => {
    const isSelf = String(member.id) === String(profile?.id);
    rowsHtml += `
      <tr>
        <td>
          <a href="/profile.html?username=${encodeURIComponent(member.username)}" class="text-bold">
            ${escapeHtml(member.username)}
          </a>
          ${isSelf ? '<span class="text-dim text-xs" style="margin-left: var(--space-2);">(You)</span>' : ""}
          ${member.display_name && member.display_name !== member.username ? `<div class="text-dim text-xs">${escapeHtml(member.display_name)}</div>` : ""}
        </td>
        <td class="text-mono">${member.solves_count !== undefined ? member.solves_count : 0}</td>
        <td class="text-green text-mono font-bold" style="text-align: right;">${Number(member.score || 0).toLocaleString()}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
}
