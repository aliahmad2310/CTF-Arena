/**
 * CTF Arena - Signup Page Controller
 * File: frontend/js/pages/signup.js
 * Strictly zero emoji.
 */

import { supabase } from "../supabaseClient.js";
import { showToast } from "../ui.js";
import { initLayout } from "../layout.js";
import { getSession } from "../auth.js";

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  // If already authenticated, redirect to dashboard
  const session = await getSession();
  if (session) {
    window.location.replace("/");
    return;
  }

  const form = document.getElementById("signup-form");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const displayName = document.getElementById("display-name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password !== confirmPassword) {
      showToast("Passwords do not match", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating Account...";

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName
          }
        }
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        showToast("Registration successful! Redirecting...", "success");
        setTimeout(() => {
          window.location.replace("/");
        }, 1000);
      } else {
        // Email confirmation is required by Supabase project settings
        showToast("Registration initiated. Please check your email to confirm your account.", "info", 8000);
        form.reset();
        submitBtn.disabled = false;
        submitBtn.textContent = "Initialize Account";
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Initialize Account";
      showToast(err.message || "Registration failed. Please check inputs.", "error");
    }
  });
});
