/**
 * CTF Arena - Shared Layout & Navigation Injector
 * File: frontend/js/layout.js
 * Injects responsive navigation bar, mobile menu, admin sub-nav, and footer.
 * Strictly zero emoji.
 */

import { Icons } from "./icons.js";
import { getUserProfile, signOut } from "./auth.js";
import { CONFIG } from "./config.js";

/**
 * Initializes and mounts the common navigation bar and footer.
 */
export async function initLayout() {
  mountCircuitBackground();
  const profile = await getUserProfile();
  renderNavbar(profile);
  renderFooter();

  if (window.location.pathname.includes("/admin/")) {
    renderAdminSubNav();
  }
}

function mountCircuitBackground() {
  if (document.querySelector(".circuit-bg-container")) return;

  const bg = document.createElement("div");
  bg.className = "circuit-bg-container";
  bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = `
    <div class="circuit-layer-vignette"></div>
    <div class="circuit-layer-grid"></div>
    <div class="circuit-layer-traces"></div>
    <div class="circuit-layer-wash"></div>
    <div class="circuit-layer-pulses">
      <div class="pulse-line pulse-line-1"></div>
      <div class="pulse-line pulse-line-2"></div>
      <div class="pulse-line pulse-line-3"></div>
      <div class="pulse-line pulse-line-4"></div>
    </div>
    <canvas id="circuit-canvas"></canvas>
  `;
  document.body.prepend(bg);

  // Dynamically load particle controller if not already present
  if (!document.querySelector('script[src*="circuit-bg.js"]')) {
    const script = document.createElement("script");
    script.src = "/js/circuit-bg.js";
    document.body.appendChild(script);
  }
}

function renderNavbar(profile) {
  const root = document.getElementById("navbar-root");
  if (!root) return;

  const currentPath = window.location.pathname;
  const isAuth = !!profile;
  const isAdmin = profile && profile.role === "admin";

  root.innerHTML = `
    <nav class="site-navbar">
      <div class="container navbar-inner">
        <a href="/" class="navbar-brand">
          <img src="/assets/logo.svg" alt="" class="brand-logo" width="28" height="28">
          <span>${CONFIG.PLATFORM_NAME}</span>
        </a>

        <ul class="navbar-nav">
          <li><a href="/labs.html" class="nav-link ${currentPath.includes("/labs.html") || currentPath.includes("/lab.html") ? "active" : ""}">Labs</a></li>
          <li><a href="/leaderboard.html" class="nav-link ${currentPath.includes("/leaderboard.html") ? "active" : ""}">Leaderboard</a></li>
          ${isAuth ? `
            <li><a href="/team.html" class="nav-link ${currentPath.includes("/team.html") ? "active" : ""}">Team</a></li>
            <li><a href="/" class="nav-link ${currentPath === "/" || currentPath === "/index.html" ? "active" : ""}">Dashboard</a></li>
          ` : ""}
          ${isAdmin ? `
            <li><a href="/admin/monitor.html" class="nav-link text-cyan ${currentPath.includes("/admin/") ? "active" : ""}">Admin Console</a></li>
          ` : ""}
        </ul>

        <div class="navbar-actions">
          ${isAuth ? `
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <a href="/profile.html?username=${encodeURIComponent(profile.username)}" class="btn btn-sm btn-secondary" style="font-family:var(--font-mono);">
                <span class="text-green">${profile.username}</span>
                <span class="text-dim">(${profile.total_score !== undefined ? profile.total_score : 0} pts)</span>
              </a>
              <button type="button" id="logout-btn" class="btn btn-sm btn-secondary" title="Sign out" aria-label="Sign out">
                ${Icons.logOut(16)}
              </button>
            </div>
          ` : `
            <a href="/login.html" class="btn btn-sm btn-secondary">Sign In</a>
            <a href="/signup.html" class="btn btn-sm btn-primary">Sign Up</a>
          `}
        </div>
      </div>
    </nav>
  `;

  // Attach logout listener
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => signOut());
  }
}

function renderAdminSubNav() {
  const root = document.getElementById("admin-subnav-root");
  if (!root) return;

  const currentPath = window.location.pathname;

  const tabs = [
    { label: "Overview", path: "/admin/monitor.html" },
    { label: "Live Activity", path: "/admin/live.html" },
    { label: "User Progress", path: "/admin/progress.html" },
    { label: "Matrix Heatmap", path: "/admin/matrix.html" },
    { label: "Manage Labs", path: "/admin/labs.html" },
    { label: "Challenges", path: "/admin/challenges.html" },
    { label: "Users", path: "/admin/users.html" },
    { label: "Teams", path: "/admin/teams.html" },
    { label: "Settings", path: "/admin/settings.html" }
  ];

  let itemsHtml = "";
  tabs.forEach(tab => {
    const isActive = currentPath.includes(tab.path);
    itemsHtml += `
      <a href="${tab.path}" class="admin-nav-item ${isActive ? "active" : ""}">
        ${tab.label}
      </a>
    `;
  });

  root.innerHTML = `
    <div class="admin-nav-bar">
      ${itemsHtml}
    </div>
  `;
}

function renderFooter() {
  const root = document.getElementById("footer-root");
  if (!root) return;

  const year = new Date().getFullYear();
  root.innerHTML = `
    <footer class="site-footer">
      <div class="container footer-inner">
        <div>
          <span>&copy; ${year} ${CONFIG.PLATFORM_NAME}. Built for cyber defense training.</span>
        </div>
        <div style="display:flex; gap:1.5rem;">
          <a href="/labs.html">Labs</a>
          <a href="/leaderboard.html">Scoreboard</a>
          <a href="/index.html">Rules</a>
        </div>
      </div>
    </footer>
  `;
}
