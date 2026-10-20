/**
 * CTF Arena - Public Profile Page Controller
 * File: frontend/js/pages/profile.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { escapeHtml, formatRelativeTime } from "../utils.js";
import { renderStatusBadge } from "../ui.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  const params = new URLSearchParams(window.location.search);
  const username = params.get("username");

  if (!username) {
    document.getElementById("profile-username").textContent = "Competitor Not Specified";
    document.getElementById("solves-tbody").innerHTML = `
      <tr><td colspan="6" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">
        Missing username parameter in query URL.
      </td></tr>
    `;
    return;
  }

  try {
    const user = await api.get(`/users/${encodeURIComponent(username)}`);

    // Render user header
    document.getElementById("profile-username").textContent = user.username;
    document.getElementById("profile-display-name").textContent = user.display_name;
    document.getElementById("profile-score").textContent = user.total_score.toLocaleString();
    document.getElementById("profile-rank").textContent = user.rank ? `#${user.rank}` : "Unranked";

    const avatarBox = document.getElementById("profile-avatar");
    if (user.avatar_url) {
      avatarBox.innerHTML = `<img src="${escapeHtml(user.avatar_url)}" alt="" style="width:100%; height:100%; object-fit:cover; border-radius:inherit;">`;
    } else {
      avatarBox.textContent = user.username.substring(0, 2).toUpperCase();
    }

    const roleBadge = document.getElementById("profile-role-badge");
    if (user.role === "admin") {
      roleBadge.className = "badge badge-green";
      roleBadge.textContent = "Administrator";
    } else {
      roleBadge.className = "badge badge-grey";
      roleBadge.textContent = "Competitor";
    }

    const teamContainer = document.getElementById("profile-team");
    if (user.team_id && user.team_name) {
      teamContainer.innerHTML = `<a href="/team-profile.html?id=${encodeURIComponent(user.team_id)}" class="text-cyan text-bold">${escapeHtml(user.team_name)}</a>`;
    } else {
      teamContainer.textContent = "Solo Operative";
    }

    const solvesBadge = document.getElementById("solves-count-badge");
    solvesBadge.textContent = `${user.solves_count} Solves`;

    // Render solves table
    const tbody = document.getElementById("solves-tbody");
    if (!user.solves || user.solves.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          No challenges solved yet.
        </td></tr>
      `;
      return;
    }

    let rowsHtml = "";
    user.solves.forEach((solve) => {
      rowsHtml += `
        <tr>
          <td>
            <a href="/challenge.html?id=${encodeURIComponent(solve.challenge_id)}" class="text-bold">
              ${escapeHtml(solve.challenge_title)}
            </a>
          </td>
          <td><span class="badge badge-grey">${escapeHtml(solve.challenge_category)}</span></td>
          <td>
            <a href="/lab.html?id=${encodeURIComponent(solve.room_id)}" class="text-muted">
              ${escapeHtml(solve.room_title)}
            </a>
          </td>
          <td class="text-green text-mono">+${solve.points_awarded}</td>
          <td>
            ${solve.is_first_blood 
              ? `<span class="badge badge-red">First Blood</span>` 
              : `<span class="text-dim text-xs">Standard</span>`
            }
          </td>
          <td class="text-dim text-mono text-xs">${formatRelativeTime(solve.solved_at)}</td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  } catch (err) {
    document.getElementById("profile-username").textContent = "Competitor Not Found";
    document.getElementById("solves-tbody").innerHTML = `
      <tr><td colspan="6" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">
        ${escapeHtml(err.message || "Failed to load user profile")}
      </td></tr>
    `;
  }
});
