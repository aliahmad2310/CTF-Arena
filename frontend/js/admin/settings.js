/**
 * CTF Arena - Admin Settings Controller
 * File: frontend/js/admin/settings.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast } from "../ui.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();

  await loadSettings();
  initFormSubmit();
});

async function loadSettings() {
  try {
    const config = await api.get("/admin/settings");

    document.getElementById("cs-title").value = config.title || "";
    document.getElementById("cs-max-team").value = config.max_team_size || 4;
    document.getElementById("cs-leaderboard-refresh").value = config.leaderboard_refresh_seconds !== undefined ? config.leaderboard_refresh_seconds : 15;

    if (config.start_time) {
      document.getElementById("cs-start").value = formatForDateTimeInput(config.start_time);
    }
    if (config.end_time) {
      document.getElementById("cs-end").value = formatForDateTimeInput(config.end_time);
    }

    document.getElementById("cs-active").checked = !!config.is_active;
    document.getElementById("cs-freeze").checked = !!config.freeze_leaderboard;
    document.getElementById("cs-dynamic").checked = !!config.dynamic_scoring;

    const badge = document.getElementById("cs-state-badge");
    if (!config.is_active) {
      badge.className = "badge badge-red";
      badge.textContent = "Disabled";
    } else if (config.freeze_leaderboard) {
      badge.className = "badge badge-amber";
      badge.textContent = "Active (Frozen)";
    } else {
      badge.className = "badge badge-green";
      badge.textContent = "Active";
    }
  } catch (err) {
    showToast(err.message || "Failed to load competition settings", "error");
  }
}

function formatForDateTimeInput(isoStr) {
  const d = new Date(isoStr);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initFormSubmit() {
  const form = document.getElementById("ctf-settings-form");
  const saveBtn = document.getElementById("save-settings-btn");

  form.onsubmit = async (e) => {
    e.preventDefault();

    const title = document.getElementById("cs-title").value.trim();
    const max_team_size = parseInt(document.getElementById("cs-max-team").value, 10);
    const leaderboard_refresh_seconds = parseInt(document.getElementById("cs-leaderboard-refresh").value, 10);
    const startVal = document.getElementById("cs-start").value;
    const endVal = document.getElementById("cs-end").value;

    const is_active = document.getElementById("cs-active").checked;
    const freeze_leaderboard = document.getElementById("cs-freeze").checked;
    const dynamic_scoring = document.getElementById("cs-dynamic").checked;

    if (isNaN(leaderboard_refresh_seconds) || leaderboard_refresh_seconds < 1) {
      showToast("Leaderboard auto-refresh interval must be at least 1 second", "error");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving Configuration...";

    try {
      await api.patch("/admin/settings", {
        title,
        max_team_size,
        leaderboard_refresh_seconds: isNaN(leaderboard_refresh_seconds) ? 15 : leaderboard_refresh_seconds,
        start_time: startVal ? new Date(startVal).toISOString() : null,
        end_time: endVal ? new Date(endVal).toISOString() : null,
        is_active,
        freeze_leaderboard,
        dynamic_scoring
      });

      showToast("Competition configuration updated successfully", "success");
      await loadSettings();
    } catch (err) {
      showToast(err.message || "Failed to save settings", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Configuration Changes";
    }
  };
}
