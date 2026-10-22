/**
 * CTF Arena - Labs Catalog Controller
 * File: frontend/js/pages/labs.js
 * Strictly zero emoji.
 */

import { api } from "../api.js";
import { initLayout } from "../layout.js";
import { requireAuth } from "../auth.js";
import { escapeHtml, debounce } from "../utils.js";
import { renderStatusBadge } from "../ui.js";

let allLabs = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth({ redirectTo: "/", revealOnSuccess: true });
  } catch {
    return;
  }
  await initLayout();

  await fetchLabs();
  initFilters();
});

async function fetchLabs() {
  const grid = document.getElementById("labs-grid");
  const emptyState = document.getElementById("empty-state");

  try {
    allLabs = await api.get("/rooms");
    renderLabs(allLabs);
  } catch (err) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: var(--space-6); text-align: center;">
        <p class="text-danger">${escapeHtml(err.message || "Failed to load labs catalog.")}</p>
        <button type="button" class="btn btn-sm btn-secondary" onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
}

function renderLabs(labs) {
  const grid = document.getElementById("labs-grid");
  const emptyState = document.getElementById("empty-state");

  if (!labs || labs.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  let cardsHtml = "";

  labs.forEach((lab) => {
    const percent = lab.challenge_count > 0 
      ? Math.round((lab.user_solved_count / lab.challenge_count) * 100) 
      : 0;

    let difficultyBadgeClass = "badge-grey";
    if (lab.difficulty === "Easy") difficultyBadgeClass = "badge-green";
    else if (lab.difficulty === "Medium") difficultyBadgeClass = "badge-amber";
    else if (lab.difficulty === "Hard" || lab.difficulty === "Insane") difficultyBadgeClass = "badge-red";

    let tagsHtml = "";
    if (lab.tags && lab.tags.length > 0) {
      tagsHtml = lab.tags.map(t => `<span class="badge badge-grey" style="font-size:0.65rem;">#${escapeHtml(t)}</span>`).join(" ");
    }

    cardsHtml += `
      <div class="card">
        <div class="card-header">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge ${difficultyBadgeClass}">${escapeHtml(lab.difficulty)}</span>
            ${renderStatusBadge(lab.user_status)}
          </div>
          <span class="text-mono text-dim text-xs">${lab.total_points} PTS TOTAL</span>
        </div>

        <div class="card-body">
          <h2 style="font-size: var(--text-xl); margin-bottom: var(--space-2);">
            <a href="/lab.html?slug=${encodeURIComponent(lab.slug)}" style="color: #ffffff; text-decoration: none;">
              ${escapeHtml(lab.title)}
            </a>
          </h2>

          <p class="text-dim" style="font-size: var(--text-sm); line-height: 1.5; margin-bottom: var(--space-4); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(lab.description)}
          </p>

          <div style="margin-bottom: var(--space-4);">
            <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); font-family: var(--font-mono); margin-bottom: var(--space-1);">
              <span class="text-dim">PROGRESS</span>
              <span class="text-green">${lab.user_solved_count} / ${lab.challenge_count} SOLVED (${percent}%)</span>
            </div>
            <div class="progress-container">
              <div class="progress-bar" style="width: ${percent}%;"></div>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center;">
            ${tagsHtml}
          </div>
        </div>

        <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center;">
          <span class="text-dim text-mono text-xs">
            ${lab.user_points_earned > 0 ? `<span class="text-green">+${lab.user_points_earned} PTS EARNED</span>` : "0 PTS EARNED"}
          </span>
          <a href="/lab.html?slug=${encodeURIComponent(lab.slug)}" class="btn btn-sm btn-primary">
            Enter Lab
          </a>
        </div>
      </div>
    `;
  });

  grid.innerHTML = cardsHtml;
}

function initFilters() {
  const searchInput = document.getElementById("search-input");
  const diffFilter = document.getElementById("difficulty-filter");
  const resetBtn = document.getElementById("reset-filter-btn");

  const applyFilters = () => {
    const q = searchInput.value.toLowerCase().trim();
    const diff = diffFilter.value;

    const filtered = allLabs.filter((lab) => {
      const matchSearch = !q || 
        lab.title.toLowerCase().includes(q) || 
        lab.description.toLowerCase().includes(q) ||
        (lab.tags && lab.tags.some(t => t.toLowerCase().includes(q)));

      const matchDiff = !diff || lab.difficulty === diff;

      return matchSearch && matchDiff;
    });

    renderLabs(filtered);
  };

  searchInput.addEventListener("input", debounce(applyFilters, 250));
  diffFilter.addEventListener("change", applyFilters);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      searchInput.value = "";
      diffFilter.value = "";
      applyFilters();
    });
  }
}
