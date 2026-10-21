/**
 * CTF Arena - Login Page Controller
 * File: frontend/js/pages/login.js
 * Strictly zero emoji.
 */

import { supabase } from "../supabaseClient.js";
import { showToast } from "../ui.js";
import { initLayout } from "../layout.js";
import { getSession, getUserProfile } from "../auth.js";
import { api } from "../api.js";

function getSafeRedirectUrl() {
  const requestedUrl = new URLSearchParams(window.location.search).get("redirect");
  return requestedUrl && requestedUrl.startsWith("/") && !requestedUrl.startsWith("//")
    ? requestedUrl
    : "/";
}

document.addEventListener("DOMContentLoaded", async () => {
  await initLayout();

  // If already authenticated, redirect
  const session = await getSession();
  if (session) {
    // Only leave the login page when both Supabase auth and the API profile
    // check succeed. A session alone can be stale or the API may be offline.
    const profile = await getUserProfile();
    if (profile) {
      window.location.replace(getSafeRedirectUrl());
      return;
    }
    showToast("Your session could not be verified. Check the API connection, then sign in again.", "error", 8000);
  }

  const form = document.getElementById("login-form");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying Credentials...";

    try {
      const data = await api.post("/auth/login", {
        username,
        password
      });

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });
      if (sessionError) throw sessionError;

      showToast("Login successful. Redirecting...", "success");

      const redirectUrl = getSafeRedirectUrl();

      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 800);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
      showToast(err.message || "Invalid email or password", "error");
    }
  });
});
