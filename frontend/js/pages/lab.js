/**
 * CTF Arena - Lab Room Page Controller
 * File: frontend/js/pages/lab.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { startHeartbeat } from "../auth.js";
import { escapeHtml } from "../utils.js";
import { renderStatusBadge } from "../ui.js";

let currentRoomId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug") || params.get("id");

  if (!slug) {
    document.getElementById("lab-title").textContent = "Lab Not Specified";
    document.getElementById("challenges-container").innerHTML = `
      <div class="card" style="padding: var(--space-6); text-align: center;">
        <p class="text-danger">Missing lab parameter in query string.</p>
        <a href="/labs.html" class="btn btn-sm btn-secondary">Return to Labs Catalog</a>
      </div>
    `;
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
    renderChallenges(lab.challenges);
  } catch (err) {
    document.getElementById("lab-title").textContent = "Lab Unavailable";
    document.getElementById("challenges-container").innerHTML = `
      <div class="card" style="padding: var(--space-6); text-align: center;">
        <p class="text-danger">${escapeHtml(err.message || "Failed to load lab data")}</p>
        <a href="/labs.html" class="btn btn-sm btn-secondary">Back to Labs Catalog</a>
      </div>
    `;
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

  // Progress Bar
  const percent = lab.challenge_count > 0 
    ? Math.round((lab.user_solved_count / lab.challenge_count) * 100) 
    : 0;

  document.getElementById("progress-text").textContent = `${lab.user_solved_count} / ${lab.challenge_count} SOLVED (${percent}%)`;
  document.getElementById("progress-bar-fill").style.width = `${percent}%`;

  // Tags
  const tagsContainer = document.getElementById("lab-tags");
  if (lab.tags && lab.tags.length > 0) {
    tagsContainer.innerHTML = lab.tags.map(t => `<span class="badge badge-grey">#${escapeHtml(t)}</span>`).join(" ");
  }

  document.getElementById("challenges-count-badge").textContent = `${lab.challenge_count} Challenges`;
}

function renderChallenges(challenges) {
  const container = document.getElementById("challenges-container");

  if (!challenges || challenges.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: var(--space-6); text-align: center;">
        <p class="text-dim">No published challenges are currently active in this lab.</p>
      </div>
    `;
    return;
  }

  let html = "";
  challenges.forEach((ch, idx) => {
    const isSolved = ch.is_solved_by_user;
    const isTeamSolved = ch.is_solved_by_team;

    let solveBadge = `<span class="badge badge-grey">Unsolved</span>`;
    if (isSolved) {
      solveBadge = `<span class="badge badge-green">Solved</span>`;
    } else if (isTeamSolved) {
      solveBadge = `<span class="badge badge-amber">Solved by Teammate</span>`;
    }

    html += `
      <div class="card" style="border-left: 4px solid ${isSolved ? "var(--accent-green)" : isTeamSolved ? "var(--status-amber-text)" : "var(--border-subtle)"};">
        <div class="card-body" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4);">
          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <div style="font-family: var(--font-mono); font-size: var(--text-lg); font-weight: 700; color: var(--text-dim); min-width: 2rem;">
              0${idx + 1}
            </div>

            <div>
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
                <a href="/challenge.html?id=${encodeURIComponent(ch.id)}" style="font-size: var(--text-base); font-weight: 700; color: #ffffff;">
                  ${escapeHtml(ch.title)}
                </a>
                <span class="badge badge-grey">${escapeHtml(ch.category)}</span>
              </div>
              <div style="font-size: var(--text-xs); color: var(--text-dim); font-family: var(--font-mono);">
                Difficulty: ${escapeHtml(ch.difficulty)} | Solves: ${ch.solves_count}
              </div>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: var(--space-4);">
            <span class="text-mono text-green text-sm" style="font-weight: 700;">+${ch.points} PTS</span>
            ${solveBadge}
            <a href="/challenge.html?id=${encodeURIComponent(ch.id)}" class="btn btn-sm ${isSolved ? "btn-secondary" : "btn-primary"}">
              ${isSolved ? "Review" : "Launch"}
            </a>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
