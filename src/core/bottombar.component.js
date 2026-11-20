// bottombar.component.js — Bottom navigation bar rendering
import { I } from '../core/utils.js';
import { getCurrentTab } from '../core/init.js';

export function renderBottomBar() {
  const bar = document.getElementById('bottombar');
  if (!bar) return;
  
  const currentTab = getCurrentTab();
  // Show 'orders' as active when viewing order details
  const isOrdersActive = currentTab === 'orders' || currentTab === 'order';
  
  bar.innerHTML = `
    <button data-tab="orders" class="bottombar-item ${isOrdersActive ? 'active' : ''}" aria-label="Заказы">
      ${I.history}
      <span>Заказы</span>
    </button>
    <button data-tab="order" class="bottombar-item ${currentTab === 'order' ? 'active' : ''}" aria-label="Заказ">
      ${I.package}
      <span>Заказ</span>
    </button>
    <button data-tab="people" class="bottombar-item ${currentTab === 'people' ? 'active' : ''}" aria-label="Заказчики">
      ${I.users}
      <span>Люди</span>
    </button>
  `;
}

export function setActiveTab(tab) {
  document.querySelectorAll('.bottombar-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}

// Static tab click listeners — bound once, never destroyed (native addEventListener)
export function bindBottomBar() {
  const bar = document.getElementById('bottombar');
  if (!bar) return;
  bar.addEventListener('click', e => {
    const btn = e.target.closest('.bottombar-item');
    if (!btn?.dataset.tab) return;
    import('./events.js').then(m => m.switchTab(btn.dataset.tab));
  });
}
