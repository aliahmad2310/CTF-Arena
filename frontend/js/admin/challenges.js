/**
 * CTF Arena - Admin Challenges Controller
 * File: frontend/js/admin/challenges.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast, showModal, closeModal } from "../ui.js";
import { escapeHtml } from "../utils.js";

let challengesList = [];
let availableRooms = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();

  await Promise.all([
    loadRooms(),
    loadChallenges()
  ]);

  initCreateButton();
});

async function loadRooms() {
  try {
    availableRooms = await api.get("/rooms");
  } catch (err) {
    console.error("Failed to load rooms:", err);
  }
}

async function loadChallenges() {
  const tbody = document.getElementById("challenges-tbody");
  try {
    challengesList = await api.get("/admin/challenges");
    renderChallenges(challengesList);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderChallenges(challenges) {
  const tbody = document.getElementById("challenges-tbody");

  if (!challenges || challenges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">No challenges configured yet.</td></tr>`;
    return;
  }

  let html = "";
  challenges.forEach((ch) => {
    const roomInfo = ch.rooms || {};
    const roomTitle = roomInfo.title || "Unassigned Lab";

    let diffBadge = "badge-grey";
    if (ch.difficulty === "Easy") diffBadge = "badge-green";
    else if (ch.difficulty === "Medium") diffBadge = "badge-amber";
    else diffBadge = "badge-red";

    html += `
      <tr>
        <td>
          <a href="/challenge.html?id=${encodeURIComponent(ch.id)}" target="_blank" class="text-bold">
            ${escapeHtml(ch.title)}
          </a>
        </td>
        <td><span class="text-dim text-xs">${escapeHtml(roomTitle)}</span></td>
        <td><span class="badge badge-grey">${escapeHtml(ch.category)}</span></td>
        <td class="text-mono text-green font-bold">+${ch.points}</td>
        <td><span class="badge ${diffBadge}">${escapeHtml(ch.difficulty)}</span></td>
        <td>
          ${ch.is_published 
            ? `<span class="badge badge-green">Published</span>` 
            : `<span class="badge badge-grey">Draft</span>`
          }
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-sm btn-secondary edit-ch-btn" data-id="${ch.id}">
            Edit / Flag
          </button>
          <button type="button" class="btn btn-sm btn-danger delete-ch-btn" data-id="${ch.id}" data-title="${escapeHtml(ch.title)}">
            Delete
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Bind edit handlers
  tbody.querySelectorAll(".edit-ch-btn").forEach((btn) => {
    btn.onclick = () => {
      const chId = btn.getAttribute("data-id");
      const ch = challengesList.find(c => c.id === chId);
      if (ch) openEditModal(ch);
    };
  });

  // Bind delete handlers
  tbody.querySelectorAll(".delete-ch-btn").forEach((btn) => {
    btn.onclick = () => {
      const chId = btn.getAttribute("data-id");
      const chTitle = btn.getAttribute("data-title");
      showModal({
        title: "Delete Challenge",
        contentHtml: `<p style="color:var(--status-red-text); font-weight:600;">Permanently delete challenge "${chTitle}"? Solves and submissions will also be deleted.</p>`,
        confirmText: "Permanently Delete",
        onConfirm: async () => {
          await api.delete(`/admin/challenges/${chId}`);
          showToast(`Challenge '${chTitle}' deleted`, "info");
          await loadChallenges();
        }
      });
    };
  });
}

function initCreateButton() {
  const btn = document.getElementById("create-challenge-btn");
  btn.onclick = () => {
    const roomOptions = availableRooms.map(r => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join("");

    showModal({
      title: "Create New Challenge",
      contentHtml: `
        <form id="create-ch-form">
          <div class="form-group">
            <label class="form-label" for="mc-room">Parent Lab</label>
            <select id="mc-room" class="form-select" required>
              ${roomOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="mc-title">Challenge Title</label>
            <input type="text" id="mc-title" class="form-input" required minlength="3" maxlength="120" placeholder="JWT Signature Bypass">
          </div>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label" for="mc-cat">Category</label>
              <select id="mc-cat" class="form-select">
                <option value="Web">Web</option>
                <option value="Crypto">Crypto</option>
                <option value="Forensics">Forensics</option>
                <option value="Pwn">Pwn</option>
                <option value="Reverse">Reverse</option>
                <option value="OSINT">OSINT</option>
                <option value="Stego">Stego</option>
                <option value="Misc">Misc</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="mc-pts">Points Value</label>
              <input type="number" id="mc-pts" class="form-input form-input-mono" value="100" min="0" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="mc-diff">Difficulty</label>
            <select id="mc-diff" class="form-select">
              <option value="Easy">Easy</option>
              <option value="Medium" selected>Medium</option>
              <option value="Hard">Hard</option>
              <option value="Insane">Insane</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="mc-flag">Secret Flag</label>
            <input type="text" id="mc-flag" class="form-input form-input-mono text-green" required placeholder="CTF{flag_secret_string_here}">
            <div class="form-helper">Hashed with salt and server pepper on save. Never stored in plaintext.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="mc-link">External Target Link / Command (Optional)</label>
            <input type="text" id="mc-link" class="form-input form-input-mono" placeholder="http://target.local:8080 or nc host 9000">
          </div>
          <div class="form-group">
            <label class="form-label" for="mc-desc">Description (Markdown Supported)</label>
            <textarea id="mc-desc" class="form-textarea" rows="4" placeholder="Analyze the vulnerable service running on the target port..."></textarea>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
            <input type="checkbox" id="mc-published" checked>
            <label for="mc-published" class="text-sm">Publish immediately</label>
          </div>
        </form>
      `,
      confirmText: "Create Challenge",
      onConfirm: async () => {
        const room_id = document.getElementById("mc-room").value;
        const title = document.getElementById("mc-title").value.trim();
        const category = document.getElementById("mc-cat").value;
        const points = parseInt(document.getElementById("mc-pts").value, 10) || 100;
        const difficulty = document.getElementById("mc-diff").value;
        const flag = document.getElementById("mc-flag").value.trim();
        const external_link = document.getElementById("mc-link").value.trim() || null;
        const description = document.getElementById("mc-desc").value.trim();
        const is_published = document.getElementById("mc-published").checked;

        await api.post("/admin/challenges", {
          room_id, title, category, points, difficulty, flag, external_link, description, is_published,
          is_case_sensitive: true, display_order: 1
        });

        showToast(`Challenge '${title}' created successfully`, "success");
        await loadChallenges();
      }
    });
  };
}

function openEditModal(ch) {
  showModal({
    title: `Edit Challenge: ${ch.title}`,
    contentHtml: `
      <form id="edit-ch-form">
        <div class="form-group">
          <label class="form-label" for="ec-title">Title</label>
          <input type="text" id="ec-title" class="form-input" value="${escapeHtml(ch.title)}" required>
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label" for="ec-cat">Category</label>
            <select id="ec-cat" class="form-select">
              <option value="Web" ${ch.category === "Web" ? "selected" : ""}>Web</option>
              <option value="Crypto" ${ch.category === "Crypto" ? "selected" : ""}>Crypto</option>
              <option value="Forensics" ${ch.category === "Forensics" ? "selected" : ""}>Forensics</option>
              <option value="Pwn" ${ch.category === "Pwn" ? "selected" : ""}>Pwn</option>
              <option value="Reverse" ${ch.category === "Reverse" ? "selected" : ""}>Reverse</option>
              <option value="OSINT" ${ch.category === "OSINT" ? "selected" : ""}>OSINT</option>
              <option value="Stego" ${ch.category === "Stego" ? "selected" : ""}>Stego</option>
              <option value="Misc" ${ch.category === "Misc" ? "selected" : ""}>Misc</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="ec-pts">Points Value</label>
            <input type="number" id="ec-pts" class="form-input form-input-mono" value="${ch.points}" min="0" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="ec-flag">Rotate Flag (Leave empty to keep current flag)</label>
          <input type="text" id="ec-flag" class="form-input form-input-mono text-green" placeholder="CTF{new_flag_string_here}">
          <div class="form-helper">Entering a new flag will re-hash and overwrite the stored salt and hash.</div>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
          <input type="checkbox" id="ec-published" ${ch.is_published ? "checked" : ""}>
          <label for="ec-published" class="text-sm">Published (visible to competitors)</label>
        </div>
      </form>
    `,
    confirmText: "Save Changes",
    onConfirm: async () => {
      const title = document.getElementById("ec-title").value.trim();
      const category = document.getElementById("ec-cat").value;
      const points = parseInt(document.getElementById("ec-pts").value, 10);
      const flagInput = document.getElementById("ec-flag").value.trim();
      const is_published = document.getElementById("ec-published").checked;

      const payload = { title, category, points, is_published };
      if (flagInput) {
        payload.flag = flagInput;
      }

      await api.patch(`/admin/challenges/${ch.id}`, payload);
      showToast("Challenge updated successfully", "success");
      await loadChallenges();
    }
  });
}
