// header.component.js — Header button bindings (static, bound once at startup)
import { seedDemo } from '../core/demo-seed.js';
import { renderAll } from '../core/render.js';
import { notify } from '../core/utils.js';
import { openBackupModal } from './events.js';

export function bindHeader() {
  const demoBtn = document.getElementById('demoBtn');
  const backupBtn = document.getElementById('backupBtn');

  demoBtn?.addEventListener('click', async () => {
    await seedDemo();
    renderAll();
    notify('Демо данные загружены');
  });
  

  backupBtn?.addEventListener('click', openBackupModal);
}
