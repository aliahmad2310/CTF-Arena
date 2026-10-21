/**
 * CTF Arena - UI Toolkit & Micro-components
 * File: frontend/js/ui.js
 * Strictly zero emoji anywhere in this file.
 */

import { Icons } from "./icons.js";
import { escapeHtml } from "./utils.js";

/**
 * Displays a toast notification in the viewport.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 * @param {number} durationMs
 */
export function showToast(message, type = "info", durationMs = 4000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");

  let iconSvg = "";
  if (type === "success") {
    iconSvg = `<span class="text-green" style="display:flex;">${Icons.check(16)}</span>`;
  } else if (type === "error") {
    iconSvg = `<span class="text-danger" style="display:flex;">${Icons.cross(16)}</span>`;
  } else {
    iconSvg = `<span class="text-cyan" style="display:flex;">${Icons.activity(16)}</span>`;
  }

  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.5rem;">
      ${iconSvg}
      <span>${escapeHtml(message)}</span>
    </div>
    <button type="button" class="btn btn-sm btn-secondary" style="padding:0.1rem 0.4rem; border:none; background:transparent; color:var(--text-muted);" aria-label="Close notification">
      ${Icons.cross(14)}
    </button>
  `;

  const closeBtn = toast.querySelector("button");
  closeBtn.addEventListener("click", () => toast.remove());

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.isConnected) {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 200ms ease";
      setTimeout(() => toast.remove(), 200);
    }
  }, durationMs);
}

/**
 * Opens a modal dialog with custom header, body content, and action handlers.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.contentHtml
 * @param {string} [options.confirmText]
 * @param {string} [options.cancelText]
 * @param {Function} [options.onConfirm]
 */
export function showModal({ title, contentHtml, confirmText = "Confirm", cancelText = "Cancel", onConfirm }) {
  closeModal();

  const backdrop = document.createElement("div");
  backdrop.id = "active-modal-backdrop";
  backdrop.className = "modal-backdrop";

  backdrop.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="card-header">
        <h3 id="modal-title" style="margin:0; font-size:var(--text-base);">${escapeHtml(title)}</h3>
        <button type="button" id="modal-close-btn" class="btn btn-sm btn-secondary" style="border:none; background:transparent;" aria-label="Close modal">
          ${Icons.cross(16)}
        </button>
      </div>
      <div class="card-body">
        ${contentHtml}
      </div>
      <div class="card-footer" style="display:flex; justify-content:flex-end; gap:0.5rem;">
        <button type="button" id="modal-cancel-btn" class="btn btn-secondary">${escapeHtml(cancelText)}</button>
        ${onConfirm ? `<button type="button" id="modal-confirm-btn" class="btn btn-primary">${escapeHtml(confirmText)}</button>` : ""}
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeBtn = backdrop.querySelector("#modal-close-btn");
  const cancelBtn = backdrop.querySelector("#modal-cancel-btn");
  const confirmBtn = backdrop.querySelector("#modal-confirm-btn");

  const close = () => closeModal();
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  if (confirmBtn && onConfirm) {
    confirmBtn.addEventListener("click", async () => {
      const form = backdrop.querySelector("form");
      if (form && !form.reportValidity()) return;

      confirmBtn.disabled = true;
      confirmBtn.textContent = "Processing...";
      try {
        const shouldClose = await onConfirm();
        if (shouldClose !== false) {
          closeModal();
          return;
        }

        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmText;
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = confirmText;
        showToast(err.message || "Action failed", "error");
      }
    });
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });
}

/**
 * Closes any currently active modal.
 */
export function closeModal() {
  const activeModal = document.getElementById("active-modal-backdrop");
  if (activeModal) activeModal.remove();
}

/**
 * Renders a color-coded text status badge for labs, users, and events.
 * Strictly avoids emoji.
 * @param {"completed"|"in_progress"|"not_started"|"solved"|"wrong"|"online"|"offline"|"banned"} status
 * @returns {string}
 */
export function renderStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "completed":
    case "solved":
    case "online":
      return `<span class="badge badge-green">${escapeHtml(s === "completed" ? "Completed" : s === "solved" ? "Solved" : "Online")}</span>`;

    case "in_progress":
      return `<span class="badge badge-amber">In progress</span>`;

    case "not_started":
      return `<span class="badge badge-grey">Not started</span>`;

    case "banned":
    case "offline":
    case "wrong":
      return `<span class="badge badge-red">${escapeHtml(s === "banned" ? "Banned" : s === "offline" ? "Offline" : "Wrong")}</span>`;

    default:
      return `<span class="badge badge-grey">${escapeHtml(status || "Unknown")}</span>`;
  }
}

/**
 * Renders a table skeleton during data loading states.
 * @param {number} rows
 * @param {number} cols
 * @returns {string}
 */
export function renderSkeletonTable(rows = 5, cols = 4) {
  let html = "";
  for (let r = 0; r < rows; r++) {
    html += "<tr>";
    for (let c = 0; c < cols; c++) {
      html += `<td><div class="skeleton" style="height:18px; width:80%;"></div></td>`;
    }
    html += "</tr>";
  }
  return html;
}
