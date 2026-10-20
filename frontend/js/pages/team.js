/**
 * CTF Arena - Team Page Controller
 * File: frontend/js/pages/team.js
 * Strictly zero emoji.
 */

import { requireAuth, startHeartbeat } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast, showModal, closeModal } from "../ui.js";
import { escapeHtml, formatRelativeTime, formatDate } from "../utils.js";

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
    noTeamView.classList.add("hidden");
    activeTeamView.classList.remove("hidden");
    renderActiveTeam(team, profile);
  } catch (err) {
    // Competitor does not have a team yet
    activeTeamView.classList.add("hidden");
    noTeamView.classList.remove("hidden");
    initNoTeamTabs(profile);
  }
}

function initNoTeamTabs(profile) {
  const tabCreate = document.getElementById("tab-btn-create");
  const tabJoin = document.getElementById("tab-btn-join");
  const formCreate = document.getElementById("create-team-form");
  const formJoin = document.getElementById("join-team-form");

  tabCreate.addEventListener("click", () => {
    tabCreate.style.background = "var(--bg-card)";
    tabCreate.style.color = "var(--accent-green)";
    tabCreate.style.borderBottomColor = "var(--accent-green)";

    tabJoin.style.background = "var(--bg-surface)";
    tabJoin.style.color = "var(--text-muted)";
    tabJoin.style.borderBottomColor = "transparent";

    formCreate.classList.remove("hidden");
    formJoin.classList.add("hidden");
  });

  tabJoin.addEventListener("click", () => {
    tabJoin.style.background = "var(--bg-card)";
    tabJoin.style.color = "var(--accent-green)";
    tabJoin.style.borderBottomColor = "var(--accent-green)";

    tabCreate.style.background = "var(--bg-surface)";
    tabCreate.style.color = "var(--text-muted)";
    tabCreate.style.borderBottomColor = "transparent";

    formJoin.classList.remove("hidden");
    formCreate.classList.add("hidden");
  });

  // Handle Team Creation
  const createBtn = document.getElementById("create-team-btn");
  formCreate.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById("create-team-name").value.trim();

    createBtn.disabled = true;
    createBtn.textContent = "Forming Squad...";

    try {
      await api.post("/teams", { name });
      showToast(`Team '${name}' successfully created!`, "success");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      createBtn.disabled = false;
      createBtn.textContent = "Form Team";
      showToast(err.message || "Failed to create team", "error");
    }
  };

  // Handle Team Join
  const joinBtn = document.getElementById("join-team-btn");
  formJoin.onsubmit = async (e) => {
    e.preventDefault();
    const inviteCode = document.getElementById("join-invite-code").value.trim();

    joinBtn.disabled = true;
    joinBtn.textContent = "Verifying Code...";

    try {
      const joined = await api.post("/teams/join", { invite_code: inviteCode });
      showToast(`Successfully enlisted in team '${joined.name}'!`, "success");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      joinBtn.disabled = false;
      joinBtn.textContent = "Join Existing Team";
      showToast(err.message || "Failed to join team", "error");
    }
  };
}

function renderActiveTeam(team, profile) {
  document.getElementById("team-name").textContent = team.name;
  document.getElementById("team-score").textContent = team.score.toLocaleString();
  document.getElementById("team-rank").textContent = team.rank ? `#${team.rank}` : "Unranked";
  document.getElementById("capacity-badge").textContent = `${team.member_count} / ${team.max_team_size} Members`;
  document.getElementById("team-created-at").textContent = formatDate(team.created_at);

  const inviteCodeEl = document.getElementById("team-invite-code");
  inviteCodeEl.textContent = team.invite_code;

  // Copy code button
  const copyBtn = document.getElementById("copy-invite-btn");
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(team.invite_code);
    showToast("Invite code copied to clipboard", "info");
  };

  const isCaptain = (String(profile.id) === String(team.captain_id));
  const captainControls = document.getElementById("captain-controls");
  const memberControls = document.getElementById("member-controls");

  if (isCaptain) {
    captainControls.classList.remove("hidden");
    memberControls.classList.add("hidden");
    bindCaptainActions(team);
  } else {
    captainControls.classList.add("hidden");
    memberControls.classList.remove("hidden");
    bindMemberActions();
  }

  // Render Roster
  const tbody = document.getElementById("roster-tbody");
  let rowsHtml = "";

  team.members.forEach((member) => {
    const isSelf = (String(member.id) === String(profile.id));
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
        <td style="text-align: right;">
          ${isCaptain && !isSelf ? `
            <button type="button" class="btn btn-sm btn-danger kick-btn" data-user-id="${member.id}" data-username="${escapeHtml(member.username)}">
              Kick
            </button>
          ` : isSelf ? `
            <span class="text-dim text-xs">(You)</span>
          ` : `--`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;

  // Bind kick handlers
  tbody.querySelectorAll(".kick-btn").forEach((btn) => {
    btn.onclick = () => {
      const targetId = btn.getAttribute("data-user-id");
      const targetName = btn.getAttribute("data-username");
      showModal({
        title: `Remove Operative`,
        contentHtml: `<p>Are you sure you want to remove <strong>${targetName}</strong> from the team?</p>`,
        confirmText: "Remove Member",
        onConfirm: async () => {
          await api.delete(`/teams/${team.id}/members/${targetId}`);
          showToast(`Operative ${targetName} removed`, "info");
          setTimeout(() => window.location.reload(), 500);
        }
      });
    };
  });
}

function bindCaptainActions(team) {
  // Regenerate Code
  const regenBtn = document.getElementById("regen-code-btn");
  regenBtn.onclick = () => {
    showModal({
      title: "Rotate Recruitment Code",
      contentHtml: "<p>Are you sure you want to rotate the invite code? The previous code will become invalid immediately.</p>",
      confirmText: "Rotate Code",
      onConfirm: async () => {
        const updated = await api.post(`/teams/${team.id}/regenerate-invite`);
        document.getElementById("team-invite-code").textContent = updated.invite_code;
        showToast("New recruitment code generated", "success");
      }
    });
  };

  // Rename Team
  const renameBtn = document.getElementById("rename-team-btn");
  renameBtn.onclick = () => {
    showModal({
      title: "Rename Team",
      contentHtml: `
        <div class="form-group" style="margin-top:0.5rem;">
          <label class="form-label" for="modal-new-name">New Team Name</label>
          <input type="text" id="modal-new-name" class="form-input form-input-mono" value="${escapeHtml(team.name)}" minlength="3" maxlength="30" required>
        </div>
      `,
      confirmText: "Save Name",
      onConfirm: async () => {
        const input = document.getElementById("modal-new-name");
        const newName = input.value.trim();
        await api.patch(`/teams/${team.id}`, { name: newName });
        document.getElementById("team-name").textContent = newName;
        showToast("Team renamed successfully", "success");
      }
    });
  };

  // Disband Team
  const disbandBtn = document.getElementById("disband-team-btn");
  disbandBtn.onclick = () => {
    showModal({
      title: "Disband Team",
      contentHtml: "<p style='color:var(--status-red-text); font-weight:600;'>Warning: This will permanently delete the team and unassign all operatives. This action cannot be reversed.</p>",
      confirmText: "Permanently Disband",
      onConfirm: async () => {
        await api.delete(`/teams/${team.id}`);
        showToast("Team has been disbanded", "info");
        setTimeout(() => window.location.reload(), 600);
      }
    });
  };
}

function bindMemberActions() {
  const leaveBtn = document.getElementById("leave-team-btn");
  leaveBtn.onclick = () => {
    showModal({
      title: "Leave Team",
      contentHtml: "<p>Are you sure you want to leave your squad? Your earned points will remain with your profile.</p>",
      confirmText: "Leave Squad",
      onConfirm: async () => {
        await api.post("/teams/leave");
        showToast("You have left the team", "info");
        setTimeout(() => window.location.reload(), 600);
      }
    });
  };
}
