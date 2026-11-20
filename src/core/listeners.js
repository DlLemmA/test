// listeners.js — Simple event listener registry with destroy()
// Решает проблему утечек памяти и дублирования обработчиков при ререндере.

/** @type {Array<{target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions}>} */
const registry = [];

/**
 * Добавляет слушатель и запоминает его для последующей очистки.
 * @param {EventTarget} target
 * @param {string} type
 * @param {EventListener} listener
 * @param {AddEventListenerOptions|boolean} [options]
 */
export function on(target, type, listener, options) {
  target.addEventListener(type, listener, options);
  registry.push({ target, type, listener, options });
}

/**
 * Удаляет ВСЕ зарегистрированные слушатели.
 * Вызывайте перед повторной инициализацией UI (в renderAll, при смене заказа и т.д.)
 */
export function destroy() {
  for (const { target, type, listener, options } of registry) {
    target.removeEventListener(type, listener, options);
  }
  registry.length = 0;
}

/**
 * Удаляет конкретный слушатель (если нужно точечно).
 */
export function off(target, type, listener, options) {
  const idx = registry.findIndex(r => r.target === target && r.type === type && r.listener === listener);
  if (idx >= 0) {
    target.removeEventListener(type, listener, options);
    registry.splice(idx, 1);
  }
}