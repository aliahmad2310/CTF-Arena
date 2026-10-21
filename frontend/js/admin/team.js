/**
 * Admin team progress audit page.
 */
import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { escapeHtml } from "../utils.js";
import { showToast } from "../ui.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
    await initLayout();
    const teamId = new URLSearchParams(window.location.search).get("id");
    if (!teamId) throw new Error("No team identifier provided");
    const data = await api.get(`/admin/monitor/teams/${encodeURIComponent(teamId)}`);
    document.getElementById("team-title").textContent = data.team_name;
    document.getElementById("team-summary").textContent = `Rank ${data.rank ? `#${data.rank}` : "Unranked"} | ${data.score.toLocaleString()} points | ${data.member_count} / ${data.max_members} members`;
    document.getElementById("team-members-body").innerHTML = data.members.length ? data.members.map((member) => `
      <tr>
        <td><a class="text-bold" href="/admin/user.html?id=${encodeURIComponent(member.user_id)}">${escapeHtml(member.display_name)}</a><div class="text-dim text-xs">@${escapeHtml(member.username)}</div></td>
        <td><span class="badge ${member.is_online ? "badge-green" : "badge-grey"}">${member.is_online ? "Online" : "Offline"}</span></td>
        <td>${member.current_room_title ? `<a href="/admin/lab.html?id=${encodeURIComponent(member.current_room_id)}">${escapeHtml(member.current_room_title)}</a>` : "Not in a lab"}</td>
        <td>${escapeHtml(member.current_challenge_title || "Not in a challenge")}</td>
      </tr>`).join("") : '<tr><td colspan="4">No user members found.</td></tr>';
    document.getElementById("team-labs-body").innerHTML = data.labs.length ? data.labs.map((lab) => `
      <tr>
        <td>${escapeHtml(lab.title)}</td>
        <td><span class="badge ${lab.status === "completed" ? "badge-green" : lab.status === "in_progress" ? "badge-amber" : "badge-grey"}">${escapeHtml(lab.status.replace("_", " "))}</span></td>
        <td>${lab.solved_count} / ${lab.total_count}</td>
        <td>${lab.points_earned.toLocaleString()}</td>
      </tr>`).join("") : '<tr><td colspan="4">No published labs found.</td></tr>';
  } catch (error) {
    showToast(error.message || "Unable to load team progress", "error");
  }
});
