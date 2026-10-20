/**
 * CTF Arena - Settings Page Controller
 * File: frontend/js/pages/settings.js
 * Strictly zero emoji.
 */

import { requireAuth, startHeartbeat } from "../auth.js";
import { initLayout } from "../layout.js";
import { api } from "../api.js";
import { supabase } from "../supabaseClient.js";
import { showToast } from "../ui.js";

document.addEventListener("DOMContentLoaded", async () => {
  let profile;
  try {
    profile = await requireAuth();
  } catch {
    return;
  }

  await initLayout();
  startHeartbeat();

  // Populate form with current values
  const usernameInput = document.getElementById("username");
  const emailInput = document.getElementById("email");
  const displayNameInput = document.getElementById("display-name");
  const avatarUrlInput = document.getElementById("avatar-url");
  const roleBadge = document.getElementById("role-badge");

  usernameInput.value = profile.username || "";
  emailInput.value = profile.email || "Confidential";
  displayNameInput.value = profile.display_name || "";
  avatarUrlInput.value = profile.avatar_url || "";

  if (profile.role === "admin") {
    roleBadge.className = "badge badge-green";
    roleBadge.textContent = "Administrator";
  } else {
    roleBadge.className = "badge badge-grey";
    roleBadge.textContent = "Competitor";
  }

  // Profile Form Submission
  const profileForm = document.getElementById("profile-form");
  const saveProfileBtn = document.getElementById("save-profile-btn");

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const displayName = displayNameInput.value.trim();
    const avatarUrl = avatarUrlInput.value.trim();

    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = "Saving...";

    try {
      const updated = await api.patch("/me", {
        display_name: displayName,
        avatar_url: avatarUrl || null
      });

      showToast("Profile updated successfully", "success");
      displayNameInput.value = updated.display_name;
    } catch (err) {
      showToast(err.message || "Failed to update profile", "error");
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = "Save Profile Changes";
    }
  });

  // Password Form Submission
  const passwordForm = document.getElementById("password-form");
  const savePasswordBtn = document.getElementById("save-password-btn");

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-new-password").value;

    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }

    savePasswordBtn.disabled = true;
    savePasswordBtn.textContent = "Updating...";

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      showToast("Passphrase successfully updated", "success");
      passwordForm.reset();
    } catch (err) {
      showToast(err.message || "Failed to update passphrase", "error");
    } finally {
      savePasswordBtn.disabled = false;
      savePasswordBtn.textContent = "Update Passphrase";
    }
  });
});
