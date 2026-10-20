/**
 * CTF Arena - Lightweight Motherboard Canvas Particle Controller
 * File: frontend/js/circuit-bg.js
 * Hardware-inspired Cybersecurity Theme matching the Motherboard Reference
 * Strict Rule: Absolutely zero emoji anywhere in this file.
 */

(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const canvas = document.getElementById("circuit-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let animationId = null;
  let isPaused = false;

  // Maximum particle density capped for performance
  const MAX_PARTICLES = window.innerWidth < 768 ? 16 : 38;
  const particles = [];

  class ElectronParticle {
    constructor() {
      this.reset(true);
    }

    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : height + 10;
      this.radius = Math.random() * 1.5 + 0.5;
      this.speedY = -(Math.random() * 0.4 + 0.15); // Slow upward drift
      this.speedX = (Math.random() - 0.5) * 0.2;
      this.alpha = Math.random() * 0.6 + 0.2;
      this.pulseSpeed = Math.random() * 0.02 + 0.01;
      this.isGlowing = Math.random() > 0.75;
    }

    update() {
      this.y += this.speedY;
      this.x += this.speedX;
      this.alpha += Math.sin(Date.now() * this.pulseSpeed * 0.01) * 0.005;

      if (this.y < -10 || this.x < -10 || this.x > width + 10) {
        this.reset();
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);

      if (this.isGlowing) {
        ctx.fillStyle = `rgba(0, 240, 255, ${Math.max(0.1, Math.min(0.9, this.alpha))})`;
        ctx.shadowColor = "rgba(53, 168, 255, 0.8)";
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = `rgba(53, 168, 255, ${Math.max(0.05, Math.min(0.6, this.alpha))})`;
        ctx.shadowBlur = 0;
      }

      ctx.fill();
    }
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push(new ElectronParticle());
    }
  }

  function render() {
    if (isPaused) return;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }

    animationId = requestAnimationFrame(render);
  }

  function start() {
    if (!animationId && !isPaused) {
      render();
    }
  }

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  // Lifecycle listeners
  window.addEventListener("resize", () => {
    resize();
    initParticles();
  });

  // Automatically pause canvas animation when tab is inactive to preserve battery & CPU
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      isPaused = true;
      stop();
    } else {
      isPaused = false;
      start();
    }
  });

  // Initialize
  resize();
  initParticles();
  start();
})();
