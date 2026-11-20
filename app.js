// app.js — main application logic
import initSqlJs from 'sql.js';
import { initApp } from './core/init.js';
import { bindEvents } from './core/events.js';
import { renderAll } from './core/render.js';

// Initialize SQL.js and make it available globally for db.js
async function initSql() {
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
  });
  window.initSqlJs = () => Promise.resolve(SQL);
  return SQL;
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize SQL.js first
  await initSql();
  
  // Initialize app
  await initApp();
  bindEvents();
  renderAll();
});

// Expose for demo/debug
window.app = { renderAll };