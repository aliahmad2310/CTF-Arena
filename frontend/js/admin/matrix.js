/**
 * CTF Arena - Admin Progress Matrix Controller
 * File: frontend/js/admin/matrix.js
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { showToast } from "../ui.js";

let currentMode = "users"; // "users" | "teams"

async function init() {
  await initLayout();
  const adminUser = await requireAdmin();
  if (!adminUser) return;

  setupListeners();
  await loadMatrixData();
}

function setupListeners() {
  const usersBtn = document.getElementById("mode-users-btn");
  const teamsBtn = document.getElementById("mode-teams-btn");
  const exportBtn = document.getElementById("export-matrix-csv-btn");

  if (usersBtn) {
    usersBtn.addEventListener("click", () => {
      if (currentMode !== "users") {
        currentMode = "users";
        usersBtn.className = "btn btn-primary btn-sm";
        if (teamsBtn) teamsBtn.className = "btn btn-secondary btn-sm";
        loadMatrixData();
      }
    });
  }

  if (teamsBtn) {
    teamsBtn.addEventListener("click", () => {
      if (currentMode !== "teams") {
        currentMode = "teams";
        teamsBtn.className = "btn btn-primary btn-sm";
        if (usersBtn) usersBtn.className = "btn btn-secondary btn-sm";
        loadMatrixData();
      }
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportCsv);
  }
}

async function loadMatrixData() {
  const container = document.getElementById("matrix-container");
  if (!container) return;

  try {
    const data = await api.get(`/admin/monitor/matrix?mode=${currentMode}`);
    renderMatrix(data);
  } catch (err) {
    showToast(err.message || "Failed to load progress matrix", "error");
    container.innerHTML = `
      <div style="padding: var(--space-6); text-align: center; color: var(--status-red-text);">
        Error loading matrix heatmap.
      </div>
    `;
  }
}

function renderMatrix(data) {
  const container = document.getElementById("matrix-container");
  if (!container) return;

  const rooms = data.rooms || [];
  const rows = data.rows || [];

  if (rows.length === 0 || rooms.length === 0) {
    container.innerHTML = `
      <div style="padding: var(--space-6); text-align: center; color: var(--text-dim);">
        No data available to display matrix heatmap.
      </div>
    `;
    return;
  }

  let html = `
    <table class="matrix-table">
      <thead>
        <tr>
          <th class="sticky-col">${currentMode === "users" ? "Name" : "Squad"}</th>
  `;

  rooms.forEach(r => {
    html += `
      <th>
        <div>${escapeHtml(r.title)}</div>
        <div class="text-dim text-xs" style="font-weight: 400;">(${escapeHtml(r.slug)})</div>
      </th>
    `;
  });

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(row => {
    const linkTarget = currentMode === "users"
      ? `/admin/user.html?id=${row.id}`
      : `/team-profile.html?id=${row.id}`;

    html += `
      <tr>
        <td class="sticky-col">
          <a href="${linkTarget}" style="color: #ffffff; text-decoration: none;">
            ${escapeHtml(row.name)}
          </a>
          ${row.subtext ? `<div class="text-dim text-xs" style="font-weight: normal;">${escapeHtml(row.subtext)}</div>` : ""}
        </td>
    `;

    rooms.forEach(r => {
      const cell = row.cells ? row.cells[r.id] : null;
      let statusClass = "matrix-cell-not-started";
      let statusText = "0/0";
      let titleTooltip = "Not Started";

      if (cell) {
        if (cell.status === "completed") {
          statusClass = "matrix-cell-completed";
          statusText = `${cell.solved_count}/${cell.total_count}`;
          titleTooltip = `Completed - Solved ${cell.solved_count}/${cell.total_count} (${cell.points_earned} pts)`;
        } else if (cell.status === "in_progress") {
          statusClass = "matrix-cell-in-progress";
          statusText = `${cell.solved_count}/${cell.total_count}`;
          titleTooltip = `In Progress - Solved ${cell.solved_count}/${cell.total_count} (${cell.points_earned} pts)`;
        } else {
          statusClass = "matrix-cell-not-started";
          statusText = `0/${cell.total_count}`;
          titleTooltip = "Not Started";
        }
      }

      html += `
        <td>
          <div class="matrix-cell ${statusClass}" title="${escapeHtml(titleTooltip)}">
            <div>${statusText}</div>
            <div style="font-size: 9px; opacity: 0.85;">${cell ? cell.status.replace("_", " ").toUpperCase() : "NOT STARTED"}</div>
          </div>
        </td>
      `;
    });

    html += `
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

async function handleExportCsv() {
  try {
    showToast("Generating matrix CSV...", "info");
    const response = await fetch(`${api.baseUrl || ""}/admin/monitor/export/matrix.csv?mode=${currentMode}`, {
      headers: {
        Authorization: `Bearer ${await api.getToken()}`
      }
    });

    if (!response.ok) {
      throw new Error("Matrix export failed");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `progress_matrix_${currentMode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("Matrix CSV downloaded successfully", "success");
  } catch (err) {
    showToast(err.message || "Matrix export failed", "error");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", init);
