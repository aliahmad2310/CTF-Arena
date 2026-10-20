/**
 * CTF Arena - Login Page Controller
 * File: frontend/js/pages/login.js
 * Strictly zero emoji.
 */

import { supabase } from "../supabaseClient.js";
import { showToast } from "../ui.js";
import { initLayout } from "../layout.js";
import { getSession } from "../auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  // If already authenticated, redirect
  const session = await getSession();
  if (session) {
    const params = new URLSearchParams(window.location.search);
    const redirectUrl = params.get("redirect") || "/dashboard.html";
    window.location.href = redirectUrl;
    return;
  }

  const form = document.getElementById("login-form");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying Credentials...";

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      showToast("Authentication successful. Redirecting...", "success");

      const params = new URLSearchParams(window.location.search);
      const redirectUrl = params.get("redirect") || "/dashboard.html";

      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 800);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Authenticate";
      showToast(err.message || "Invalid email or password", "error");
    }
  });
});
