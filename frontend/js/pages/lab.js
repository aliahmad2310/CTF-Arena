import { CONFIG } from "../config.js";
import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { requireAuth, startHeartbeat } from "../auth.js";
import { escapeHtml } from "../utils.js";
import { renderStatusBadge, showToast } from "../ui.js";

let currentRoomId = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth();
  } catch {
    return;
  }
  await initLayout();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || params.get("id");

  if (!slug) {
    document.getElementById("lab-title").textContent = "Lab Not Specified";
    document.getElementById("lab-description").textContent = "Missing lab identifier in query string.";
    return;
  }

  await loadLab(slug);
});

async function loadLab(slug) {
  try {
    const lab = await api.get(`/rooms/${encodeURIComponent(slug)}`);
    currentRoomId = lab.id;

    // Start heartbeat tracking for this active lab
    startHeartbeat(() => currentRoomId, () => null);

    renderLabHeader(lab);
    renderLabMaterial(lab);
    bindFlagSubmission(slug, lab);
  } catch (err) {
    document.getElementById("lab-title").textContent = "Lab Unavailable";
    document.getElementById("lab-description").textContent = err.message || "Failed to load lab data";
  }
}

function renderLabHeader(lab) {
  document.getElementById("breadcrumb-title").textContent = lab.title;
  document.getElementById("lab-title").textContent = lab.title;
  document.getElementById("lab-description").textContent = lab.description;
  document.getElementById("lab-points-total").textContent = `${lab.total_points} PTS TOTAL`;

  const diffBadge = document.getElementById("lab-difficulty");
  diffBadge.textContent = lab.difficulty;
  if (lab.difficulty === "Easy") diffBadge.className = "badge badge-green";
  else if (lab.difficulty === "Medium") diffBadge.className = "badge badge-amber";
  else diffBadge.className = "badge badge-red";

  document.getElementById("lab-status-badge").innerHTML = renderStatusBadge(lab.user_status);

  // Tags
  const tagsContainer = document.getElementById("lab-tags");
  if (lab.tags && lab.tags.length > 0) {
    tagsContainer.innerHTML = lab.tags.map(t => `<span class="badge badge-grey">#${escapeHtml(t)}</span>`).join(" ");
  }
}

function renderLabMaterial(lab) {
  const section = document.getElementById("lab-material-section");
  if (!section) return;

  if (lab.cover_image_url) {
    section.style.display = "block";
    const downloadBtn = document.getElementById("material-download-btn");
    const filenameEl = document.getElementById("material-filename");

    // Extract filename from URL
    try {
      const urlParts = lab.cover_image_url.split("/");
      const rawName = urlParts[urlParts.length - 1].split("?")[0];
      filenameEl.textContent = decodeURIComponent(rawName) || "Lab Artifact File";
    } catch {
      filenameEl.textContent = "Lab Target Material";
    }

    const downloadUrl = lab.cover_image_url.startsWith("http")
      ? lab.cover_image_url
      : `${CONFIG.API_BASE_URL}${lab.cover_image_url.startsWith("/") ? "" : "/"}${lab.cover_image_url}`;
    downloadBtn.href = downloadUrl;
    downloadBtn.setAttribute("download", "");
  } else {
    section.style.display = "none";
  }
}

function bindFlagSubmission(slug, lab) {
  const form = document.getElementById("lab-flag-form");
  const flagInput = document.getElementById("lab-flag-input");
  const submitBtn = document.getElementById("lab-flag-submit-btn");
  const indicator = document.getElementById("submission-status-indicator");
  const feedback = document.getElementById("flag-feedback-msg");

  if (!form || !flagInput || !submitBtn) return;

  if (lab.user_status === "completed") {
    indicator.className = "badge badge-green font-mono";
    indicator.textContent = "Captured";
    flagInput.value = "[FLAG SOLVED]";
    flagInput.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Lab Completed";
    feedback.className = "text-xs font-mono";
    feedback.style.background = "rgba(0, 255, 157, 0.1)";
    feedback.style.color = "var(--accent-green)";
    feedback.style.border = "1px solid var(--accent-green)";
    feedback.textContent = "Flag confirmed! All lab points awarded to you and your squad.";
    return;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const flag = flagInput.value.trim();
    if (!flag) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying...";
    feedback.className = "text-xs font-mono hidden";

    try {
      const res = await api.post(`/rooms/${encodeURIComponent(slug)}/submit`, { flag });

      if (res.is_correct) {
        showToast(res.message || "Flag accepted! Lab solved.", "success");
        indicator.className = `badge ${res.lab_completed ? "badge-green" : "badge-amber"} font-mono`;
        indicator.textContent = res.lab_completed ? "Lab Completed" : "Flag Captured";

        if (res.lab_completed) {
          document.getElementById("lab-status-badge").innerHTML = renderStatusBadge("completed");
          flagInput.disabled = true;
          submitBtn.disabled = true;
          submitBtn.textContent = "Lab Completed";
        } else {
          document.getElementById("lab-status-badge").innerHTML = renderStatusBadge("in_progress");
          flagInput.value = "";
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Next Flag";
        }

        feedback.className = "text-xs font-mono";
        feedback.style.background = "rgba(0, 255, 157, 0.1)";
        feedback.style.color = "var(--accent-green)";
        feedback.style.border = "1px solid var(--accent-green)";
        feedback.textContent = res.message || (res.lab_completed
          ? "Flag accepted. All lab challenges are complete."
          : "Flag accepted and points recorded. Continue with the remaining lab challenges.");
      } else {
        showToast(res.message || "Incorrect flag", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Confirm & Submit Flag";

        feedback.className = "text-xs font-mono";
        feedback.style.background = "rgba(255, 75, 75, 0.1)";
        feedback.style.color = "var(--status-red-text)";
        feedback.style.border = "1px solid var(--status-red-text)";
        feedback.textContent = res.message || "Incorrect flag. Check your methodology and try again.";
      }
    } catch (err) {
      showToast(err.message || "Flag submission failed", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirm & Submit Flag";

      feedback.className = "text-xs font-mono";
      feedback.style.background = "rgba(255, 75, 75, 0.1)";
      feedback.style.color = "var(--status-red-text)";
      feedback.style.border = "1px solid var(--status-red-text)";
      feedback.textContent = err.message || "Submission failed. Please try again.";
    }
  };
}
