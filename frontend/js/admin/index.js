/**
 * CTF Arena - Admin Landing Hub Controller
 * File: frontend/js/admin/index.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast } from "../ui.js";

let ctfConfig = null;
let countdownInterval = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();
  document.documentElement.classList.remove("protected-route-pending", "admin-route-pending");
  document.getElementById("navbar-root")?.classList.add("championship-admin-navbar");
  await loadCountdown();
  bindEditor();
});

async function loadCountdown() {
  try {
    ctfConfig = await api.get("/ctf/status");
    document.getElementById("ctf-title").textContent = ctfConfig.title || "CTF Championship";
    const target = getTargetDate(ctfConfig);
    const status = document.getElementById("championship-status");
    if (!target) {
      status.className = "badge badge-grey";
      status.textContent = "Schedule not set";
      setCountdown(null);
      return;
    }

    const starting = ctfConfig.start_time && new Date(ctfConfig.start_time).getTime() > Date.now();
    status.className = starting ? "badge badge-amber" : "badge badge-green";
    status.textContent = starting ? "Starting Soon" : "Competition Active";
    setCountdown(target);
  } catch (err) {
    showToast(err.message || "Unable to load championship schedule", "error");
  }
}

function getTargetDate(config) {
  if (config.start_time && new Date(config.start_time).getTime() > Date.now()) return new Date(config.start_time);
  if (config.end_time && new Date(config.end_time).getTime() > Date.now()) return new Date(config.end_time);
  return null;
}

function setCountdown(target) {
  if (countdownInterval) clearInterval(countdownInterval);
  const update = () => {
    const remaining = target ? Math.max(0, target.getTime() - Date.now()) : 0;
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    document.getElementById("countdown-days").textContent = String(days).padStart(2, "0");
    document.getElementById("countdown-hours").textContent = String(hours).padStart(2, "0");
    document.getElementById("countdown-minutes").textContent = String(minutes).padStart(2, "0");
    document.getElementById("countdown-seconds").textContent = String(seconds).padStart(2, "0");
    if (!target || remaining === 0) {
      if (countdownInterval) clearInterval(countdownInterval);
    }
  };
  update();
  if (target) countdownInterval = setInterval(update, 1000);
}

function bindEditor() {
  const form = document.getElementById("countdown-editor");
  const targetSelect = document.getElementById("editor-target");
  const dateInput = document.getElementById("editor-date");
  const dateLabel = document.getElementById("editor-date-label");

  const openEditor = () => {
    if (!ctfConfig) return;
    document.getElementById("editor-title").value = ctfConfig.title || "CTF Championship";
    const targetKey = ctfConfig.start_time && new Date(ctfConfig.start_time).getTime() > Date.now() ? "start_time" : "end_time";
    targetSelect.value = targetKey;
    dateInput.value = toLocalInputValue(ctfConfig[targetKey]);
    dateLabel.textContent = targetKey === "start_time" ? "Start date and time" : "End date and time";
    form.classList.remove("hidden");
    dateInput.focus();
  };

  document.getElementById("ctf-title").addEventListener("dblclick", () => {
    openEditor();
    document.getElementById("editor-title").focus();
    document.getElementById("editor-title").select();
  });
  document.querySelectorAll(".championship-countdown-block").forEach((part) => {
    part.addEventListener("dblclick", () => {
      openEditor();
      if (part.dataset.countdownPart === "days" || part.dataset.countdownPart === "hours") {
        targetSelect.value = "start_time";
      } else {
        targetSelect.value = "end_time";
      }
      dateLabel.textContent = targetSelect.value === "start_time" ? "Start date and time" : "End date and time";
      dateInput.value = toLocalInputValue(ctfConfig?.[targetSelect.value]);
    });
  });
  targetSelect.addEventListener("change", () => {
    const key = targetSelect.value;
    dateLabel.textContent = key === "start_time" ? "Start date and time" : "End date and time";
    dateInput.value = toLocalInputValue(ctfConfig?.[key]) || toLocalInputValue(ctfConfig?.[key === "start_time" ? "end_time" : "start_time"]);
  });
  document.getElementById("cancel-countdown-edit").addEventListener("click", () => {
    form.reset();
    form.classList.add("hidden");
  });
  form.addEventListener("reset", () => {
    form.classList.add("hidden");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.getElementById("editor-title").value.trim();
    const targetKey = targetSelect.value;
    const targetDate = new Date(dateInput.value);
    if (!title || Number.isNaN(targetDate.getTime())) {
      showToast("Enter a championship title and valid date/time", "error");
      return;
    }
    const saveButton = document.getElementById("save-countdown-edit");
    saveButton.disabled = true;
    const startDate = targetKey === "start_time" ? targetDate : (ctfConfig.start_time ? new Date(ctfConfig.start_time) : null);
    const endDate = targetKey === "end_time" ? targetDate : (ctfConfig.end_time ? new Date(ctfConfig.end_time) : null);
    if (startDate && endDate && endDate <= startDate) {
      showToast("Championship end time must be after its start time", "error");
      saveButton.disabled = false;
      return;
    }
    try {
      await api.patch("/admin/settings", { title, [targetKey]: targetDate.toISOString() });
      ctfConfig.title = title;
      ctfConfig[targetKey] = targetDate.toISOString();
      form.classList.add("hidden");
      showToast("Championship schedule saved", "success");
      await loadCountdown();
    } catch (err) {
      showToast(err.message || "Unable to save championship schedule", "error");
    } finally {
      saveButton.disabled = false;
    }
  });
}

function toLocalInputValue(isoValue) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
