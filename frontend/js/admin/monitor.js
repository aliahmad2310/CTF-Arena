/**
 * CTF Arena - Admin Operations Telemetry Controller
 * File: frontend/js/admin/monitor.js
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

import { requireAdmin } from "../auth.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { showToast } from "../ui.js";

let statusChartInstance = null;
let completionsChartInstance = null;
let labRatesChartInstance = null;
let refreshTimer = null;

async function init() {
  await initLayout();
  const user = await requireAdmin();
  if (!user) return;

  setupListeners();
  await loadTelemetryData();

  // Refresh every 30 seconds while the page is active
  refreshTimer = setInterval(loadTelemetryData, 30000);
}

function setupListeners() {
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Updating...";
      await loadTelemetryData();
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Metrics";
      showToast("Telemetry metrics refreshed", "info");
    });
  }
}

async function loadTelemetryData() {
  try {
    const [overviewData, alertsData] = await Promise.all([
      api.get("/admin/monitor/overview"),
      api.get("/admin/monitor/alerts")
    ]);

    renderStatCards(overviewData);
    renderStatusChart(overviewData.status_distribution || {});
    renderCompletionsChart(overviewData.completions_per_day || []);
    renderLabRatesChart(overviewData.completion_rates_per_lab || []);
    renderAlerts(alertsData || []);
  } catch (err) {
    showToast(err.message || "Failed to load telemetry data", "error");
  }
}

function renderStatCards(data) {
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl("stat-total-users", data.total_users ?? 0);
  setEl("stat-active-now", data.active_now ?? 0);
  setEl("stat-users-in-lab", data.users_in_lab ?? 0);
  setEl("stat-completed-today", data.labs_completed_today ?? 0);
  setEl("stat-avg-completion", `${data.average_completion_percent ?? 0}%`);
  setEl("stat-total-submissions", data.total_submissions ?? 0);
  setEl("stat-failure-rate", `${data.wrong_attempt_rate ?? 0}%`);
}

function renderStatusChart(dist) {
  const canvas = document.getElementById("statusDistributionChart");
  if (!canvas) return;

  const notStarted = dist.not_started || 0;
  const inProgress = dist.in_progress || 0;
  const completed = dist.completed || 0;

  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  statusChartInstance = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Not Started", "In Progress", "Completed"],
      datasets: [{
        data: [notStarted, inProgress, completed],
        backgroundColor: ["#4a5568", "#f59e0b", "#00ff66"],
        borderColor: "#161b22",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#8b949e",
            font: { family: "monospace", size: 11 }
          }
        }
      }
    }
  });
}

function renderCompletionsChart(completions) {
  const canvas = document.getElementById("completionsDailyChart");
  if (!canvas) return;

  const labels = completions.map(c => c.date);
  const counts = completions.map(c => c.count);

  if (completionsChartInstance) {
    completionsChartInstance.destroy();
  }

  completionsChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels.length ? labels : ["No data"],
      datasets: [{
        label: "Labs Completed",
        data: counts.length ? counts : [0],
        borderColor: "#00f0ff",
        backgroundColor: "rgba(0, 240, 255, 0.1)",
        fill: true,
        tension: 0.3,
        pointBackgroundColor: "#00f0ff",
        pointBorderColor: "#161b22",
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#8b949e", font: { family: "monospace", size: 10 } }
        },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: "#8b949e", font: { family: "monospace", size: 10 } },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderLabRatesChart(rates) {
  const canvas = document.getElementById("labCompletionRatesChart");
  if (!canvas) return;

  const labels = rates.map(r => r.room_title || "Unknown");
  const percentages = rates.map(r => r.completion_rate_percent || 0);

  if (labRatesChartInstance) {
    labRatesChartInstance.destroy();
  }

  labRatesChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["No published labs"],
      datasets: [{
        label: "Completion Rate (%)",
        data: percentages.length ? percentages : [0],
        backgroundColor: "rgba(0, 255, 102, 0.3)",
        borderColor: "#00ff66",
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#8b949e", font: { family: "monospace", size: 11 } }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: val => `${val}%`,
            color: "#8b949e",
            font: { family: "monospace", size: 10 }
          },
          grid: { color: "rgba(255, 255, 255, 0.05)" }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderAlerts(alerts) {
  const container = document.getElementById("alerts-container");
  const countBadge = document.getElementById("alerts-count-badge");
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${alerts.length} Alerts`;
    countBadge.className = `badge ${alerts.length > 0 ? "badge-amber" : "badge-grey"}`;
  }

  if (alerts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: var(--space-6); color: var(--text-dim); font-size: var(--text-sm);">
        No active alerts. All monitored competitor telemetry is normal.
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map(a => {
    const isDanger = a.severity === "danger";
    const badgeClass = isDanger ? "badge-red" : "badge-amber";
    const timeStr = a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : "";

    return `
      <div class="alert-card ${isDanger ? "alert-danger" : ""}">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: var(--space-1);">
            <span class="badge ${badgeClass}">${a.alert_type.toUpperCase()}</span>
            <span class="alert-card-title">${escapeHtml(a.title)}</span>
            <span class="text-mono text-dim text-xs" style="margin-left: auto;">${timeStr}</span>
          </div>
          <div class="alert-card-desc">${escapeHtml(a.description)}</div>
          ${a.user_id ? `
            <div style="margin-top: var(--space-2);">
              <a href="/admin/user.html?id=${a.user_id}" class="btn btn-xs btn-outline">Audit Competitor</a>
            </div>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
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
window.addEventListener("beforeunload", () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
