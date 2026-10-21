/**
 * CTF Arena - Index Landing Page Controller
 * File: frontend/js/pages/index.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { getUserProfile } from "../auth.js";
import { initializeDashboard } from "./dashboard.js";
import { escapeHtml } from "../utils.js";

let countdownInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await getUserProfile();
  if (profile) {
    await mountAuthenticatedDashboard(profile);
    return;
  }

  await initLayout();

  await Promise.all([
    initCtfCountdown(),
    fetchTopTeamsPreview()
  ]);
});

async function mountAuthenticatedDashboard(profile) {
  try {
    const response = await fetch("/dashboard.html");
    if (!response.ok) throw new Error("Dashboard content could not be loaded");

    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const dashboardMain = page.querySelector("main");
    const currentMain = document.querySelector("main");
    if (!dashboardMain || !currentMain) throw new Error("Dashboard content is unavailable");

    currentMain.replaceWith(document.importNode(dashboardMain, true));
    await initializeDashboard(profile);
  } catch (err) {
    await initLayout();
    const main = document.querySelector("main");
    if (main) {
      main.replaceChildren();
      const message = document.createElement("p");
      message.className = "text-danger";
      message.textContent = "Your dashboard could not be loaded. Refresh the page to try again.";
      main.appendChild(message);
    }
    console.error("Dashboard mount failed:", err);
  }
}

async function initCtfCountdown() {
  try {
    const status = await api.get("/ctf/status");
    document.getElementById("ctf-title").textContent = status.title || "CTF Arena Championship";

    const statusBadge = document.getElementById("ctf-status-badge");
    const freezeBadge = document.getElementById("freeze-badge");

    if (status.freeze_leaderboard) {
      freezeBadge.classList.remove("hidden");
    }

    let targetDate = null;
    const now = new Date();

    if (status.start_time && new Date(status.start_time) > now) {
      statusBadge.className = "badge badge-amber";
      statusBadge.textContent = "Starting Soon";
      targetDate = new Date(status.start_time);
    } else if (status.end_time && new Date(status.end_time) > now) {
      statusBadge.className = "badge badge-green";
      statusBadge.textContent = "Competition Active";
      targetDate = new Date(status.end_time);
    } else if (status.end_time && new Date(status.end_time) <= now) {
      statusBadge.className = "badge badge-red";
      statusBadge.textContent = "Competition Concluded";
    }

    if (targetDate) {
      updateCountdownDisplay(targetDate);
      countdownInterval = setInterval(() => updateCountdownDisplay(targetDate), 1000);
    }
  } catch (err) {
    console.warn("Could not query CTF status:", err);
  }
}

function updateCountdownDisplay(targetDate) {
  const now = new Date().getTime();
  const diff = targetDate.getTime() - now;

  if (diff <= 0) {
    if (countdownInterval) clearInterval(countdownInterval);
    document.getElementById("countdown-days").textContent = "00";
    document.getElementById("countdown-hours").textContent = "00";
    document.getElementById("countdown-minutes").textContent = "00";
    document.getElementById("countdown-seconds").textContent = "00";
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  document.getElementById("countdown-days").textContent = String(days).padStart(2, "0");
  document.getElementById("countdown-hours").textContent = String(hours).padStart(2, "0");
  document.getElementById("countdown-minutes").textContent = String(minutes).padStart(2, "0");
  document.getElementById("countdown-seconds").textContent = String(seconds).padStart(2, "0");
}

async function fetchTopTeamsPreview() {
  const tbody = document.getElementById("top-teams-tbody");

  try {
    const data = await api.get("/leaderboard/teams", { page: 1, page_size: 5 });
    const teams = data.entries || [];

    if (teams.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
            No squads on the scoreboard yet. Be the first to capture a flag!
          </td>
        </tr>
      `;
      return;
    }

    let rowsHtml = "";
    teams.forEach((t) => {
      const rankColor = t.rank === 1 ? "text-green font-bold" : t.rank <= 3 ? "text-cyan font-bold" : "text-mono";

      rowsHtml += `
        <tr>
          <td class="${rankColor}">#${t.rank}</td>
          <td>
            <a href="/team-profile.html?id=${encodeURIComponent(t.team_id)}" class="text-bold">
              ${escapeHtml(t.team_name)}
            </a>
          </td>
          <td class="text-dim text-xs">${t.member_count} Operatives</td>
          <td class="text-mono">${t.solves_count}</td>
          <td class="text-green text-mono font-bold">${t.score.toLocaleString()}</td>
        </tr>
      `;
    });

    tbody.innerHTML = rowsHtml;
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">
          Standings currently unavailable.
        </td>
      </tr>
    `;
  }
}
