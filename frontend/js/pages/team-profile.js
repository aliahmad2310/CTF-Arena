/**
 * CTF Arena - Public Team Profile Controller
 * File: frontend/js/pages/team-profile.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { escapeHtml, formatRelativeTime, formatDate } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("id");

  if (!teamId) {
    document.getElementById("public-team-name").textContent = "Team Not Specified";
    document.getElementById("public-roster-tbody").innerHTML = `
      <tr><td colspan="5" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">
        Missing team identifier in query URL.
      </td></tr>
    `;
    return;
  }

  try {
    const team = await api.get(`/teams/${encodeURIComponent(teamId)}`);

    document.getElementById("public-team-name").textContent = team.name;
    document.getElementById("public-team-created").textContent = formatDate(team.created_at);
    document.getElementById("public-team-score").textContent = team.score.toLocaleString();
    document.getElementById("public-team-rank").textContent = team.rank ? `#${team.rank}` : "Unranked";
    document.getElementById("public-team-capacity").textContent = `${team.member_count} Members`;
    document.getElementById("public-roster-count").textContent = `${team.member_count} Members`;

    const tbody = document.getElementById("public-roster-tbody");
    if (!team.members || team.members.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No operatives affiliated with this team.
        </td></tr>
      `;
      return;
    }

    let rowsHtml = "";
    team.members.forEach((member) => {
      rowsHtml += `
        <tr>
          <td>
            <a href="/profile.html?username=${encodeURIComponent(member.username)}" class="text-bold">
              ${escapeHtml(member.username)}
            </a>
            <div class="text-dim text-xs">${escapeHtml(member.display_name)}</div>
          </td>
          <td>
            ${member.is_captain 
              ? `<span class="badge badge-green">Captain</span>` 
              : `<span class="badge badge-grey">Operative</span>`
            }
          </td>
          <td class="text-mono">${member.solves_count}</td>
          <td class="text-green text-mono font-bold">+${member.score}</td>
          <td class="text-dim text-xs text-mono">${formatRelativeTime(member.last_seen_at)}</td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  } catch (err) {
    document.getElementById("public-team-name").textContent = "Team Not Found";
    document.getElementById("public-roster-tbody").innerHTML = `
      <tr><td colspan="5" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">
        ${escapeHtml(err.message || "Unable to retrieve team profile")}
      </td></tr>
    `;
  }
});
