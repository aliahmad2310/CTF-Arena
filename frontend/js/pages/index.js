/**
 * CTF Arena - Index Landing Page Controller
 * File: frontend/js/pages/index.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { getUserProfile } from "../auth.js";
import { escapeHtml } from "../utils.js";
import { requireAdmin } from "../auth.js";
import { showModal, showToast } from "../ui.js";
import { supabase } from "../supabaseClient.js";
import { Icons } from "../icons.js";

let countdownInterval = null;
let isAdminRoute = false;
let isHomepageEditMode = false;

const homepageEditableFields = {
  hero_heading: { label: "Homepage heading", maxLength: 200 },
  hero_description: { label: "Homepage introduction", maxLength: 1000 },
  enter_labs_button: { label: "Enter Labs button text", maxLength: 80 },
  scoreboard_button: { label: "Scoreboard button text", maxLength: 80 },
  leaderboard_title: { label: "Leaderboard preview heading", maxLength: 120 },
  leaderboard_view_link: { label: "Leaderboard link text", maxLength: 80 },
  features_heading: { label: "Features heading", maxLength: 120 },
  features_description: { label: "Features introduction", maxLength: 500 },
  feature_labs_title: { label: "Interactive Labs heading", maxLength: 120 },
  feature_labs_description: { label: "Interactive Labs description", maxLength: 500 },
  feature_team_title: { label: "Squad Collaboration heading", maxLength: 120 },
  feature_team_description: { label: "Squad Collaboration description", maxLength: 500 },
  feature_monitor_title: { label: "Administrative Monitor heading", maxLength: 120 },
  feature_monitor_description: { label: "Administrative Monitor description", maxLength: 500 },
};

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await getUserProfile();
  const canEditChampionship = profile?.role === "admin";
  const enterLabsButton = document.getElementById("enter-labs-btn");
  const scoreboardButton = document.getElementById("scoreboard-cta-btn");
  if (enterLabsButton) {
    if (profile) {
      enterLabsButton.href = canEditChampionship ? "/admin/labs.html" : "/labs.html";
      enterLabsButton.classList.remove("hidden");
    } else {
      enterLabsButton.classList.add("hidden");
    }
  }
  if (scoreboardButton) {
    scoreboardButton.className = `btn btn-lg ${profile ? "btn-secondary" : "btn-primary"}`;
  }
  isAdminRoute = window.location.pathname.startsWith("/admin");
  if (isAdminRoute && !canEditChampionship) {
    await redirectAdminRouteToHome();
    return;
  }
  if (isAdminRoute) {
    if (canEditChampionship) {
      await initLayout();
      document.body.classList.add("championship-admin-navbar");
    }
    document.documentElement.classList.remove("admin-route-pending", "protected-route-pending");
  }

  if (!isAdminRoute) await initLayout();

  await loadHomepageContent();

  await Promise.all([
    initCtfCountdown(),
    fetchTopTeamsPreview()
  ]);

  if (canEditChampionship) {
    try {
      await requireAdmin();
      bindChampionshipEditor();
      bindHomepageEditMode();
    } catch {
      // Display remains public; only editing controls are withheld.
    }
  } else if (isAdminRoute) {
    await redirectAdminRouteToHome();
  }
});

async function loadHomepageContent() {
  try {
    const response = await api.get("/site-content");
    Object.entries(response.content || {}).forEach(([key, value]) => {
      const field = homepageEditableFields[key];
      const element = document.querySelector(`[data-editable-key="${key}"]`);
      if (field && element && typeof value === "string") element.textContent = value;
    });
  } catch (error) {
    console.warn("Could not load saved homepage text; using the built-in copy.", error);
  }
}

function bindHomepageEditMode() {
  const toggle = document.getElementById("homepage-edit-mode-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    isHomepageEditMode = !isHomepageEditMode;
    document.body.classList.toggle("homepage-edit-mode", isHomepageEditMode);
    toggle.setAttribute("aria-pressed", String(isHomepageEditMode));
    toggle.textContent = isHomepageEditMode ? "Exit Edit Mode" : "Edit Mode";
    showToast(isHomepageEditMode ? "Edit Mode enabled. Select homepage text to edit." : "Edit Mode disabled.", "info");
  });

  document.querySelectorAll("[data-editable-key]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (!isHomepageEditMode) return;
      event.preventDefault();
      event.stopPropagation();
      void editHomepageText(element);
    });
  });
}

function editHomepageText(element) {
  const key = element.dataset.editableKey;
  const field = homepageEditableFields[key];
  if (!field) return;

  showModal({
    title: `Edit ${field.label}`,
    contentHtml: `
      <form id="homepage-copy-form">
        <label class="form-label" for="homepage-copy-input">${field.label}</label>
        <textarea id="homepage-copy-input" class="form-input" rows="5" maxlength="${field.maxLength}" required>${escapeHtml(element.textContent.trim())}</textarea>
      </form>
    `,
    confirmText: "Save Text",
    onConfirm: async () => {
      const input = document.getElementById("homepage-copy-input");
      const value = input.value.trim();
      if (!value) {
        showToast("Homepage text cannot be empty.", "error");
        return false;
      }
      const response = await api.patch("/admin/site-content", { [key]: value });
      element.textContent = response.content?.[key] || value;
      showToast(`${field.label} updated.`, "success");
      return true;
    }
  });
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  if (!isAdminRoute) return;
  if (!session) {
    await redirectAdminRouteToHome();
    return;
  }
  const profile = await getUserProfile(true, true);
  if (profile?.role !== "admin") await redirectAdminRouteToHome();
});

let adminRedirectStarted = false;
async function redirectAdminRouteToHome() {
  if (adminRedirectStarted) return;
  adminRedirectStarted = true;
  window.location.replace("/");
}

async function initCtfCountdown() {
  try {
    const status = await api.get("/ctf/status");
    document.getElementById("ctf-title").textContent = status.title || "CTF Championship";
    window.ctfChampionshipConfig = status;

    const statusBadge = document.getElementById("ctf-status-badge");
    const freezeBadge = document.getElementById("freeze-badge");
    if (statusBadge) {
      statusBadge.className = "badge badge-grey";
      statusBadge.textContent = "Schedule not set";
    }

    if (status.freeze_leaderboard) {
      freezeBadge.classList.remove("hidden");
    } else {
      freezeBadge.classList.add("hidden");
    }

    let targetDate = null;
    const now = new Date();

    if (status.start_time && new Date(status.start_time) > now) {
      if (statusBadge) {
        statusBadge.className = "badge badge-amber";
        statusBadge.textContent = "Starting Soon";
      }
      targetDate = new Date(status.start_time);
    } else if (status.end_time && new Date(status.end_time) > now) {
      if (statusBadge) {
        statusBadge.className = "badge badge-green";
        statusBadge.textContent = "Competition Active";
      }
      targetDate = new Date(status.end_time);
    } else if (status.end_time && new Date(status.end_time) <= now) {
      if (statusBadge) {
        statusBadge.className = "badge badge-red";
        statusBadge.textContent = "Competition Concluded";
      }
    }

    if (countdownInterval) clearInterval(countdownInterval);
    if (!targetDate && status.end_time && new Date(status.end_time) <= now) {
      updateCountdownDisplay(new Date(status.end_time));
    } else if (targetDate) {
      updateCountdownDisplay(targetDate);
      countdownInterval = setInterval(() => updateCountdownDisplay(targetDate), 1000);
    } else {
      ["days", "hours", "minutes", "seconds"].forEach((unit) => {
        const element = document.getElementById(`countdown-${unit}`);
        if (element) element.textContent = "00";
      });
    }
  } catch (err) {
    console.warn("Could not query CTF status:", err);
  }
  if (!window.ctfChampionshipConfig) {
    window.ctfChampionshipConfig = { title: "CTF Championship", start_time: null, end_time: null };
  }
}

function bindChampionshipEditor() {
  const form = document.getElementById("countdown-editor");
  const title = document.getElementById("ctf-title");
  if (!form || !title) return;
  const config = window.ctfChampionshipConfig;
  const backdrop = document.getElementById("countdown-editor-backdrop");
  const editButton = document.getElementById("edit-championship-btn");
  editButton.innerHTML = Icons.edit(16);
  editButton.classList.remove("hidden");

  const localInput = (value) => {
    if (!value) return "";
    const date = new Date(value);
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const edit = () => {
    document.getElementById("editor-title").value = config.title || "CTF Championship";
    const target = config.start_time && new Date(config.start_time) > new Date()
      ? new Date(config.start_time)
      : config.end_time ? new Date(config.end_time) : new Date();
    const totalSeconds = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
    document.getElementById("editor-days").value = Math.floor(totalSeconds / 86400);
    document.getElementById("editor-hours").value = Math.floor((totalSeconds % 86400) / 3600);
    document.getElementById("editor-minutes").value = Math.floor((totalSeconds % 3600) / 60);
    document.getElementById("editor-seconds").value = totalSeconds % 60;
    backdrop.classList.remove("hidden");
    document.getElementById("editor-title").focus();
  };
  editButton.addEventListener("click", edit);
  document.getElementById("cancel-countdown-edit").addEventListener("click", () => {
    form.reset();
    backdrop.classList.add("hidden");
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.classList.add("hidden");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newTitle = document.getElementById("editor-title").value.trim();
    const days = Number(document.getElementById("editor-days").value);
    const hours = Number(document.getElementById("editor-hours").value);
    const minutes = Number(document.getElementById("editor-minutes").value);
    const seconds = Number(document.getElementById("editor-seconds").value);

    if (!newTitle || !Number.isInteger(days) || days < 0 || !Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || !Number.isInteger(seconds) || seconds < 0 || seconds > 59) {
      showToast("Enter a championship title and valid countdown values.", "error");
      return;
    }
    try {
      const targetDate = new Date(Date.now() + (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000);
      const targetKey = config.end_time ? "end_time" : "start_time";
      const changes = {
        title: newTitle,
        [targetKey]: targetDate.toISOString()
      };
      if (targetKey === "start_time" && config.end_time && new Date(config.end_time) <= targetDate) {
        showToast("Championship end must be later than the start.", "error");
        return;
      }
      if (targetKey === "end_time" && config.start_time && new Date(config.start_time) >= targetDate) {
        showToast("Championship end must be later than the start.", "error");
        return;
      }
      await api.patch("/admin/settings", changes);
      config.title = newTitle;
      config[targetKey] = targetDate.toISOString();
      backdrop.classList.add("hidden");
      showToast("Championship updated", "success");
      await initCtfCountdown();
    } catch (error) {
      showToast(error.message || "Could not update championship", "error");
    }
  });
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
