/**
 * CTF Arena - Forgot Password Controller
 * File: frontend/js/pages/forgot-password.js
 * Strictly zero emoji.
 */

import { supabase } from "../supabaseClient.js";
import { showToast } from "../ui.js";
import { initLayout } from "../layout.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  const form = document.getElementById("forgot-form");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    submitBtn.disabled = true;
    submitBtn.textContent = "Dispatching...";

    try {
      const redirectUrl = `${window.location.origin}/reset-password.html`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl
      });

      if (error) throw error;

      showToast("Password reset link has been dispatched to your email address.", "info", 8000);
      form.reset();
      submitBtn.disabled = false;
      submitBtn.textContent = "Dispatch Reset Email";
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Dispatch Reset Email";
      showToast(err.message || "Unable to send reset instructions", "error");
    }
  });
});
