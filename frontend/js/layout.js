/**
 * CTF Arena - Shared Layout & Navigation Injector
 * File: frontend/js/layout.js
 * Injects responsive navigation bar, mobile menu, admin sub-nav, and footer.
 * Strictly zero emoji.
 */

import { Icons } from "./icons.js";
import { getUserProfile, signOut } from "./auth.js";
import { CONFIG } from "./config.js";
import { escapeHtml } from "./utils.js";

/**
 * Initializes and mounts the common navigation bar and footer.
 */
export async function initLayout({ skipProfile = false } = {}) {
  mountCircuitBackground();
  const profile = skipProfile ? null : await getUserProfile();
  renderNavbar(profile);
  renderFooter();

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

  if (isAdmin && currentPath.startsWith("/admin") && root.closest("body")?.classList.contains("admin-route-pending")) {
    return;
  }

  root.innerHTML = `
    <nav class="site-navbar">
      <div class="container navbar-inner">
        <a href="/" class="navbar-brand">
          <img src="/assets/cyber-jirga-logo.webp" alt="Cyber Jirga logo" class="brand-logo" width="140" height="40">
        </a>

        <ul class="navbar-nav">
          ${isAuth ? `<li><a href="${isAdmin ? "/admin/labs.html" : "/labs.html"}" class="nav-link ${currentPath.includes("/labs.html") || currentPath.includes("/lab.html") ? "active" : ""}">Labs</a></li>` : ""}
          <li><a href="/leaderboard.html" class="nav-link ${currentPath.includes("/leaderboard.html") ? "active" : ""}">Leaderboard</a></li>
          ${isAdmin ? `<li><a href="/admin/users.html" class="nav-link ${currentPath.includes("/admin/users.html") || currentPath.includes("/admin/teams.html") ? "active" : ""}">Accounts</a></li>` : ""}
          ${isAuth && !isAdmin ? `
            <li><a href="/team.html" class="nav-link ${currentPath.includes("/team.html") ? "active" : ""}">Team</a></li>
          ` : ""}
        </ul>

        <div class="navbar-actions">
          ${isAuth ? `
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <a href="${isAdmin ? "/admin/users.html" : `/profile.html?username=${encodeURIComponent(profile.username)}`}" class="btn btn-sm btn-secondary navbar-user-control" style="font-family:var(--font-mono);text-transform:none;letter-spacing:normal;">
                <span class="text-green">${escapeHtml(profile.username)}</span>
                ${isAdmin ? '<span class="text-dim">(Admin)</span>' : `<span class="text-dim">(${profile.total_score !== undefined ? profile.total_score : 0} pts)</span>`}
              </a>
              <button type="button" id="logout-btn" class="btn btn-primary navbar-user-control navbar-signout-button" title="Sign out" aria-label="Sign out">
                ${Icons.logOut(16)}
              </button>
            </div>
          ` : `
            <a href="/login.html" class="btn btn-primary navbar-login-button">Login</a>
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
          ${profile ? '<a href="/labs.html">Labs</a>' : ""}
          <a href="/leaderboard.html">Scoreboard</a>
          <a href="/rules.html">Rules</a>
        </div>
      </div>
    </footer>
  `;
}
