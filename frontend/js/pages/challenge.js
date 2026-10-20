/**
 * CTF Arena - Challenge Page Controller
 * File: frontend/js/pages/challenge.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { startHeartbeat, getSession } from "../auth.js";
import { escapeHtml } from "../utils.js";
import { showToast, showModal } from "../ui.js";

let currentRoomId = null;
let currentChallengeId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  const params = new URLSearchParams(window.location.search);
  const challengeId = params.get("id");

  if (!challengeId) {
    document.getElementById("ch-title").textContent = "Challenge Not Specified";
    document.getElementById("ch-description").innerHTML = `
      <p class="text-danger">Missing challenge parameter in query string.</p>
      <a href="/labs.html" class="btn btn-sm btn-secondary">Return to Labs Catalog</a>
    `;
    return;
  }

  currentChallengeId = challengeId;
  await loadChallenge(challengeId);
});

async function loadChallenge(id) {
  try {
    const ch = await api.get(`/challenges/${encodeURIComponent(id)}`);
    currentRoomId = ch.room_id;

    // Start heartbeat tracking for this active challenge in this lab
    startHeartbeat(() => currentRoomId, () => currentChallengeId);

    renderChallenge(ch);
  } catch (err) {
    document.getElementById("ch-title").textContent = "Challenge Unavailable";
    document.getElementById("ch-description").innerHTML = `
      <p class="text-danger">${escapeHtml(err.message || "Failed to load challenge details")}</p>
      <a href="/labs.html" class="btn btn-sm btn-secondary">Back to Labs Catalog</a>
    `;
  }
}

function renderChallenge(ch) {
  // Breadcrumb
  const labLink = document.getElementById("breadcrumb-lab-link");
  labLink.href = `/lab.html?slug=${encodeURIComponent(ch.room_slug || ch.room_id)}`;
  labLink.textContent = ch.room_title || "Lab";
  document.getElementById("breadcrumb-challenge-title").textContent = ch.title;

  // Header Details
  document.getElementById("ch-title").textContent = ch.title;
  document.getElementById("ch-category").textContent = ch.category;
  document.getElementById("ch-difficulty").textContent = ch.difficulty;
  document.getElementById("ch-points").textContent = `+${ch.points} PTS`;
  document.getElementById("ch-solves-count").textContent = `${ch.solves_count} Solves`;

  const statusBadge = document.getElementById("ch-status-badge");
  if (ch.is_solved_by_user) {
    statusBadge.className = "badge badge-green";
    statusBadge.textContent = "Solved";
  } else if (ch.is_solved_by_team) {
    statusBadge.className = "badge badge-amber";
    statusBadge.textContent = "Solved by Teammate";
  } else {
    statusBadge.className = "badge badge-grey";
    statusBadge.textContent = "Unsolved";
  }

  // Render Markdown Description safely with marked and DOMPurify
  const descEl = document.getElementById("ch-description");
  if (window.marked && window.DOMPurify) {
    const rawHtml = window.marked.parse(ch.description || "");
    descEl.innerHTML = window.DOMPurify.sanitize(rawHtml);
  } else {
    descEl.textContent = ch.description || "";
  }

  // External Target Info
  const targetBox = document.getElementById("ch-target-box");
  if (ch.external_link) {
    targetBox.classList.remove("hidden");
    document.getElementById("ch-target-val").textContent = ch.external_link;
    const targetLink = document.getElementById("ch-target-link");
    if (ch.external_link.startsWith("http://") || ch.external_link.startsWith("https://")) {
      targetLink.href = ch.external_link;
      targetLink.classList.remove("hidden");
    } else {
      targetLink.classList.add("hidden");
    }
  } else {
    targetBox.classList.add("hidden");
  }

  // Attachments
  const filesSection = document.getElementById("ch-files-section");
  const filesList = document.getElementById("ch-files-list");
  if (ch.files && ch.files.length > 0) {
    filesSection.classList.remove("hidden");
    let filesHtml = "";
    ch.files.forEach((f) => {
      filesHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
          <div>
            <span class="text-mono text-bold text-sm" style="color:#ffffff;">${escapeHtml(f.file_name)}</span>
            <span class="text-dim text-xs" style="margin-left: 0.5rem;">(${Math.round(f.file_size / 1024)} KB)</span>
          </div>
          <a href="${CONFIG.API_BASE_URL}${f.download_url}" target="_blank" class="btn btn-sm btn-secondary">
            Download File
          </a>
        </div>
      `;
    });
    filesList.innerHTML = filesHtml;
  } else {
    filesSection.classList.add("hidden");
  }

  // Hints
  renderHints(ch.hints);

  // Bind Flag Submission Form
  bindSubmissionForm(ch);
}

function renderHints(hints) {
  const hintsSection = document.getElementById("ch-hints-section");
  const hintsList = document.getElementById("ch-hints-list");

  if (!hints || hints.length === 0) {
    hintsSection.classList.add("hidden");
    return;
  }

  hintsSection.classList.remove("hidden");
  let hintsHtml = "";

  hints.forEach((h, index) => {
    if (h.is_unlocked) {
      hintsHtml += `
        <div style="background-color: var(--bg-surface); border: 1px solid var(--border-medium); border-left: 4px solid var(--accent-cyan); border-radius: var(--radius-sm); padding: var(--space-4);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2);">
            <span class="text-mono text-xs text-cyan font-bold">HINT 0${index + 1} (UNLOCKED)</span>
            <span class="badge badge-grey">Deducted: ${h.cost} PTS</span>
          </div>
          <div class="text-sm" style="color: var(--text-main); line-height: 1.5;">
            ${escapeHtml(h.content)}
          </div>
        </div>
      `;
    } else {
      hintsHtml += `
        <div style="display: flex; align-items: center; justify-content: space-between; background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: var(--space-3) var(--space-4);">
          <div>
            <span class="text-mono text-xs font-bold" style="color: var(--text-muted);">HINT 0${index + 1}</span>
            <span class="text-dim text-xs" style="margin-left: 0.5rem;">Penalty: -${h.cost} Points</span>
          </div>
          <button type="button" class="btn btn-sm btn-secondary unlock-hint-btn" data-hint-id="${h.id}" data-cost="${h.cost}">
            Unlock Hint (-${h.cost} pts)
          </button>
        </div>
      `;
    }
  });

  hintsList.innerHTML = hintsHtml;

  // Bind Unlock Handlers
  hintsList.querySelectorAll(".unlock-hint-btn").forEach((btn) => {
    btn.onclick = async () => {
      const hintId = btn.getAttribute("data-hint-id");
      const cost = btn.getAttribute("data-cost");

      showModal({
        title: "Unlock Hint",
        contentHtml: `<p>Unlocking this intelligence hint will deduct <strong>${cost} points</strong> from your score. Proceed?</p>`,
        confirmText: "Unlock Hint",
        onConfirm: async () => {
          try {
            await api.post(`/hints/${hintId}/unlock`);
            showToast("Hint unlocked successfully", "success");
            await loadChallenge(currentChallengeId);
          } catch (err) {
            showToast(err.message || "Failed to unlock hint", "error");
          }
        }
      });
    };
  });
}

function bindSubmissionForm(ch) {
  const form = document.getElementById("flag-submit-form");
  const input = document.getElementById("flag-input");
  const submitBtn = document.getElementById("flag-submit-btn");
  const responseMsg = document.getElementById("flag-response-msg");

  if (ch.is_solved_by_user) {
    input.value = "Flag already captured!";
    input.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Solved";
    return;
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const flagStr = input.value.trim();

    if (!flagStr) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying...";
    responseMsg.classList.add("hidden");

    try {
      const res = await api.post(`/challenges/${ch.id}/submit`, { flag: flagStr });

      if (res.is_correct) {
        responseMsg.className = "text-green";
        responseMsg.textContent = res.message || "Flag is correct! Points awarded.";
        responseMsg.classList.remove("hidden");

        // Success animation pulse
        form.classList.add("flag-success-pulse");
        showToast(res.message || "Correct flag! Points awarded.", "success");

        input.disabled = true;
        submitBtn.disabled = true;
        submitBtn.textContent = "Solved";

        setTimeout(() => loadChallenge(ch.id), 1200);
      } else {
        responseMsg.className = "text-danger";
        responseMsg.textContent = res.message || "Incorrect flag. Try again.";
        responseMsg.classList.remove("hidden");
        showToast(res.message || "Incorrect flag", "error");

        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Flag";
      }
    } catch (err) {
      responseMsg.className = "text-danger";
      responseMsg.textContent = err.message || "Submission failed";
      responseMsg.classList.remove("hidden");

      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Flag";
    }
  };
}
