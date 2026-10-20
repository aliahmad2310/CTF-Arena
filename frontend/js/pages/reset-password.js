/**
 * CTF Arena - Reset Password Controller
 * File: frontend/js/pages/reset-password.js
 * Strictly zero emoji.
 */

import { supabase } from "../supabaseClient.js";
import { showToast } from "../ui.js";
import { initLayout } from "../layout.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  const form = document.getElementById("reset-form");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";

    try {
      const { error } = await supabase.auth.updateUser({
        password
      });

      if (error) throw error;

      showToast("Password updated successfully. Redirecting to dashboard...", "success");
      setTimeout(() => {
        window.location.href = "/dashboard.html";
      }, 1000);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Store New Password";
      showToast(err.message || "Failed to update password", "error");
    }
  });
});
