/**
 * CTF Arena - Chart.js Motherboard Theme Helper
 * File: frontend/js/chartTheme.js
 * Hardware-inspired Cybersecurity Theme matching the Motherboard Reference
 * Strictly zero emoji.
 */

export const ChartTheme = {
  colors: {
    blue300: "#6cc6ff",
    blue400: "#35a8ff",
    blue500: "#1e90ff",
    blue600: "#1470d6",
    cyan400: "#22e0ff",
    green: "#2ee59d",
    amber: "#ffb020",
    red: "#ff4d6d",
    grey: "#6b7a90",
    lineFaint: "rgba(53, 168, 255, 0.08)",
    lineNormal: "rgba(53, 168, 255, 0.25)",
    textMuted: "#6b82a3",
    textPrimary: "#e6f1ff"
  },

  applyDefaults(Chart) {
    if (!Chart || !Chart.defaults) return;

    Chart.defaults.color = this.colors.textMuted;
    Chart.defaults.font.family = "'JetBrains Mono', 'SFMono-Regular', monospace";
    Chart.defaults.font.size = 11;

    // Grid line styling
    if (Chart.defaults.scale) {
      Chart.defaults.scale.grid.color = this.colors.lineFaint;
      Chart.defaults.scale.ticks.color = this.colors.textMuted;
    }

    // Tooltip styling matching hardware panels
    if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
      Chart.defaults.plugins.tooltip.backgroundColor = "#0a1428";
      Chart.defaults.plugins.tooltip.titleColor = "#e6f1ff";
      Chart.defaults.plugins.tooltip.bodyColor = "#9db4d3";
      Chart.defaults.plugins.tooltip.borderColor = "#35a8ff";
      Chart.defaults.plugins.tooltip.borderWidth = 1;
      Chart.defaults.plugins.tooltip.padding = 10;
      Chart.defaults.plugins.tooltip.cornerRadius = 3;
      Chart.defaults.plugins.tooltip.boxShadow = "0 0 10px rgba(53, 168, 255, 0.4)";
    }
  },

  getTimelineDataset(label, data, color = this.colors.blue400) {
    return {
      label: label,
      data: data,
      borderColor: color,
      backgroundColor: "rgba(30, 144, 255, 0.1)",
      borderWidth: 2,
      fill: true,
      tension: 0.3,
      pointBackgroundColor: color,
      pointBorderColor: "#050b18",
      pointRadius: 4,
      pointHoverRadius: 6
    };
  }
};
