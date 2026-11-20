// bottombar.component.js — Bottom navigation bar rendering
import { I } from '../core/utils.js';

export function renderBottomBar() {
  const bar = document.getElementById('bottombar');
  if (!bar) return;
  
  bar.innerHTML = `
    <button data-tab="order" class="bottombar-item active" aria-label="Текущий заказ">
      ${I.home}
      <span>Заказ</span>
    </button>
    <button data-tab="items" class="bottombar-item" aria-label="Товары">
      ${I.package}
      <span>Товары</span>
    </button>
    <button data-tab="people" class="bottombar-item" aria-label="Заказчики">
      ${I.users}
      <span>Люди</span>
    </button>
    <button data-tab="history" class="bottombar-item" aria-label="История">
      ${I.history}
      <span>История</span>
    </button>
  `;
}

export function setActiveTab(tab) {
  document.querySelectorAll('.bottombar-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}