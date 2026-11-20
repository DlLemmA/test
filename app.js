// app.js — main application logic
import { initApp } from './core/init.js';
import { renderAll } from './core/render.js';
import { bindEvents } from './core/events.js';

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await initApp();
  bindEvents();
  renderAll();
});

// Expose for demo/debug
window.app = { renderAll };