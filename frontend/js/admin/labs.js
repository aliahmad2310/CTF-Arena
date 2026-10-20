/**
 * CTF Arena - Admin Labs Controller
 * File: frontend/js/admin/labs.js
 * Strictly zero emoji.
 */

import { requireAdmin } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { showToast, showModal, closeModal } from "../ui.js";
import { escapeHtml } from "../utils.js";

let labsList = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAdmin();
  } catch {
    return;
  }

  await initLayout();

  await loadLabs();
  initCreateButton();
});

async function loadLabs() {
  const tbody = document.getElementById("labs-tbody");
  try {
    labsList = await api.get("/rooms");
    renderLabs(labsList);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--status-red-text); padding: var(--space-6);">${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderLabs(labs) {
  const tbody = document.getElementById("labs-tbody");

  if (!labs || labs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: var(--space-6);">No labs configured yet.</td></tr>`;
    return;
  }

  let html = "";
  labs.forEach((lab) => {
    let diffBadge = "badge-grey";
    if (lab.difficulty === "Easy") diffBadge = "badge-green";
    else if (lab.difficulty === "Medium") diffBadge = "badge-amber";
    else diffBadge = "badge-red";

    const tagsStr = (lab.tags || []).map(t => `#${escapeHtml(t)}`).join(", ");

    html += `
      <tr>
        <td class="text-mono font-bold">${lab.display_order}</td>
        <td>
          <a href="/lab.html?slug=${encodeURIComponent(lab.slug)}" target="_blank" class="text-bold">
            ${escapeHtml(lab.title)}
          </a>
        </td>
        <td class="text-mono text-dim text-xs">${escapeHtml(lab.slug)}</td>
        <td><span class="badge ${diffBadge}">${escapeHtml(lab.difficulty)}</span></td>
        <td>
          <span class="badge badge-green">Published</span>
        </td>
        <td class="text-dim text-xs">${tagsStr || "--"}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-sm btn-secondary edit-lab-btn" data-id="${lab.id}">
            Edit
          </button>
          <button type="button" class="btn btn-sm btn-danger delete-lab-btn" data-id="${lab.id}" data-title="${escapeHtml(lab.title)}">
            Delete
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Bind edit handlers
  tbody.querySelectorAll(".edit-lab-btn").forEach((btn) => {
    btn.onclick = () => {
      const labId = btn.getAttribute("data-id");
      const lab = labsList.find(l => l.id === labId);
      if (lab) openEditModal(lab);
    };
  });

  // Bind delete handlers
  tbody.querySelectorAll(".delete-lab-btn").forEach((btn) => {
    btn.onclick = () => {
      const labId = btn.getAttribute("data-id");
      const labTitle = btn.getAttribute("data-title");
      showModal({
        title: "Delete Lab",
        contentHtml: `<p style="color:var(--status-red-text); font-weight:600;">Permanently delete lab "${labTitle}" and all associated challenges and flags? This cannot be undone.</p>`,
        confirmText: "Permanently Delete",
        onConfirm: async () => {
          await api.delete(`/admin/rooms/${labId}`);
          showToast(`Lab '${labTitle}' deleted`, "info");
          await loadLabs();
        }
      });
    };
  });
}

function initCreateButton() {
  const btn = document.getElementById("create-lab-btn");
  btn.onclick = () => {
    showModal({
      title: "Create New Lab",
      contentHtml: `
        <form id="create-lab-modal-form">
          <div class="form-group">
            <label class="form-label" for="ml-title">Title</label>
            <input type="text" id="ml-title" class="form-input" required minlength="3" maxlength="100" placeholder="Active Directory Exploitation">
          </div>
          <div class="form-group">
            <label class="form-label" for="ml-slug">Slug (URL friendly)</label>
            <input type="text" id="ml-slug" class="form-input form-input-mono" required pattern="^[a-z0-9-]+$" placeholder="active-directory-exploitation">
          </div>
          <div class="form-group">
            <label class="form-label" for="ml-difficulty">Difficulty</label>
            <select id="ml-difficulty" class="form-select">
              <option value="Easy">Easy</option>
              <option value="Medium" selected>Medium</option>
              <option value="Hard">Hard</option>
              <option value="Insane">Insane</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="ml-tags">Tags (comma separated)</label>
            <input type="text" id="ml-tags" class="form-input form-input-mono" placeholder="ad, kerberos, ldap">
          </div>
          <div class="form-group">
            <label class="form-label" for="ml-desc">Description</label>
            <textarea id="ml-desc" class="form-textarea" rows="3" placeholder="Overview of the attack vectors simulated in this lab..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="ml-order">Display Order</label>
            <input type="number" id="ml-order" class="form-input form-input-mono" value="1">
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem;">
            <input type="checkbox" id="ml-published" checked>
            <label for="ml-published" class="text-sm">Publish immediately (visible to competitors)</label>
          </div>
        </form>
      `,
      confirmText: "Create Lab",
      onConfirm: async () => {
        const title = document.getElementById("ml-title").value.trim();
        const slug = document.getElementById("ml-slug").value.trim();
        const difficulty = document.getElementById("ml-difficulty").value;
        const tags = document.getElementById("ml-tags").value.split(",").map(t => t.trim()).filter(Boolean);
        const description = document.getElementById("ml-desc").value.trim();
        const display_order = parseInt(document.getElementById("ml-order").value, 10) || 0;
        const is_published = document.getElementById("ml-published").checked;

        await api.post("/admin/rooms", {
          title, slug, difficulty, tags, description, display_order, is_published
        });

        showToast(`Lab '${title}' created successfully`, "success");
        await loadLabs();
      }
    });
  };
}

function openEditModal(lab) {
  showModal({
    title: `Edit Lab: ${lab.title}`,
    contentHtml: `
      <form id="edit-lab-modal-form">
        <div class="form-group">
          <label class="form-label" for="el-title">Title</label>
          <input type="text" id="el-title" class="form-input" value="${escapeHtml(lab.title)}" required minlength="3" maxlength="100">
        </div>
        <div class="form-group">
          <label class="form-label" for="el-slug">Slug</label>
          <input type="text" id="el-slug" class="form-input form-input-mono" value="${escapeHtml(lab.slug)}" required pattern="^[a-z0-9-]+$">
        </div>
        <div class="form-group">
          <label class="form-label" for="el-difficulty">Difficulty</label>
          <select id="el-difficulty" class="form-select">
            <option value="Easy" ${lab.difficulty === "Easy" ? "selected" : ""}>Easy</option>
            <option value="Medium" ${lab.difficulty === "Medium" ? "selected" : ""}>Medium</option>
            <option value="Hard" ${lab.difficulty === "Hard" ? "selected" : ""}>Hard</option>
            <option value="Insane" ${lab.difficulty === "Insane" ? "selected" : ""}>Insane</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="el-tags">Tags (comma separated)</label>
          <input type="text" id="el-tags" class="form-input form-input-mono" value="${escapeHtml((lab.tags || []).join(", "))}">
        </div>
        <div class="form-group">
          <label class="form-label" for="el-desc">Description</label>
          <textarea id="el-desc" class="form-textarea" rows="3">${escapeHtml(lab.description || "")}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label" for="el-order">Display Order</label>
          <input type="number" id="el-order" class="form-input form-input-mono" value="${lab.display_order || 0}">
        </div>
      </form>
    `,
    confirmText: "Save Changes",
    onConfirm: async () => {
      const title = document.getElementById("el-title").value.trim();
      const slug = document.getElementById("el-slug").value.trim();
      const difficulty = document.getElementById("el-difficulty").value;
      const tags = document.getElementById("el-tags").value.split(",").map(t => t.trim()).filter(Boolean);
      const description = document.getElementById("el-desc").value.trim();
      const display_order = parseInt(document.getElementById("el-order").value, 10) || 0;

      await api.patch(`/admin/rooms/${lab.id}`, {
        title, slug, difficulty, tags, description, display_order
      });

      showToast("Lab details updated", "success");
      await loadLabs();
    }
  });
}
