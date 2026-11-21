import { orderRepository, itemRepository } from "./infrastructure";
import { orderService, itemService } from "@/features/shared/services";
import { customerRepository } from "@/features/customers/infrastructure";
import { historyRepository } from "@/features/history/infrastructure";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners.js";
import { uiState, toastState } from "@/core/state";
import { I, esc, kg, money } from "@/core/utils";
import { Order, Item, calculateOrder, type CustomerSummary } from "./domain";
import type { OrderStatus, ItemStatus } from "@/core/database";
import type { HistoryOrder } from "@/features/history/domain";

// ============================================
// History View (Orders Tab)
// ============================================

export async function renderHistoryView(): Promise<void> {
  const root = document.getElementById("historyView");
  if (!root) return;

  const orders = await historyRepository.findAll();
  const currentOrderId = uiState.currentOrderId;

  root.innerHTML = `
    <div class="panel">
      <div class="row between">
        <h2>История заказов</h2>
        <button class="btn-secondary" id="createOrderBtn">${I.plus} Создать заказ</button>
      </div>
      ${
        orders.length
          ? orders
              .map(
                (o) => `
        <div class="item flex items-center justify-between gap-3">
          <div>
            <b>${formatOrderTitle(o)}</b><br>
            <span class="small muted">${esc(o.derivedStatus)} · ${o.itemCount} товаров</span>
          </div>
          <div class="actions">
            <button class="btn-secondary" data-switch="${o.id}">${o.id === currentOrderId ? "Текущий" : "Открыть"}</button>
            <button class="btn-secondary" data-export="${o.id}">${I.sheet}</button>
            <button class="btn-danger" data-del="${o.id}">${I.trash}</button>
          </div>
        </div>
      `,
              )
              .join("")
          : '<div class="empty">Нет заказов</div>'
      }
    </div>
  `;

  bindHistoryActions();
}

function bindHistoryActions(): void {
  const createBtn = document.getElementById("createOrderBtn");
  if (createBtn) {
    on(createBtn, "click", async () => {
      await createNewOrder();
      uiState.setTab("order");
      renderOrderView();
    });
  }

  document.querySelectorAll("[data-switch]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => {
      const id = parseInt(b.dataset.switch!);
      uiState.setCurrentOrderId(id);
      uiState.setTab("order");
      renderOrderView();
    });
  });

  document.querySelectorAll("[data-export]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      const orderId = parseInt(b.dataset.export!);
      const order = await orderRepository.findById(orderId);
      if (order) exportOrder(order);
    });
  });

  document.querySelectorAll("[data-del]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      await deleteOrder(parseInt(b.dataset.del!));
    });
  });
}

// ============================================
// Order Detail View (Order Tab)
// ============================================

export async function renderOrderView(): Promise<void> {
  const root = document.getElementById("orderView");
  if (!root) return;

  const orderId = uiState.currentOrderId;
  if (!orderId) {
    root.innerHTML = `
      <div class="panel">
        <h2>Нет активного заказа</h2>
        <button class="btn-secondary" id="createFirstOrder">${I.plus} Создать заказ</button>
      </div>
    `;
    const btn = document.getElementById("createFirstOrder");
    if (btn)
      on(btn, "click", async () => {
        await createNewOrder();
        renderOrderView();
      });
    return;
  }

  const result = await getOrderWithCalculation(orderId);
  if (!result) {
    uiState.setCurrentOrderId(null);
    renderOrderView();
    return;
  }

  const { order, items, calculation, customers } = result;
  const orderStatus = order.derivedStatus;
  const statusCls = getStatusClass(orderStatus);

  root.innerHTML = `
    <div class="panel">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2>${formatOrderTitle(order)}</h2>
          <div class="item-meta">Статус: <span class="pill ${statusCls}">${esc(orderStatus)}</span></div>
        </div>
        <div class="actions">
          ${orderStatus === "В сборке" ? `<button class="btn-primary" id="shipOrder">${I.package} Отправить</button>` : ""}
          ${orderStatus === "Отправлен" ? `<button class="btn-primary" id="receiveOrder">${I.check} Получить</button>` : ""}
          ${orderStatus === "Получен" ? `<button class="btn-secondary" id="returnToAssembly">${I.arrowRight} Вернуть в сборку</button>` : ""}
          <button class="btn-secondary" id="editOrder">${I.pencil}</button>
          <button class="btn-secondary" id="exportOrder">${I.sheet}</button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2.5 mb-3 px-4">
      <div class="metric"><b>${kg(calculation.totalWeight)}</b><span>Вес товаров</span></div>
      <div class="metric"><b>${kg(order.boxWeightG)}</b><span>Коробка</span></div>
      <div class="metric"><b>${kg(calculation.freeWeight)}</b><span>Свободный</span></div>
      <div class="metric"><b>${calculation.tariff} BYN/кг</b><span>Тариф</span></div>
    </div>

    <div class="panel">
      <h3>Сводка по заказчикам</h3>
      <div class="tablewrap" role="region" aria-label="Сводка по заказчикам" tabindex="0">
        <table>
          <thead><tr><th scope="col">Заказчик</th><th scope="col">Товаров</th><th scope="col">Доставлено</th><th scope="col" class="hide-mobile">Вес</th><th scope="col" class="hide-mobile">Стоимость</th><th scope="col" class="hide-mobile">Доставка</th><th scope="col">Итого</th></tr></thead>
          <tbody>
            ${
              Array.from(calculation.perCustomer.values())
                .sort((a, b) => a.customer.name.localeCompare(b.customer.name, "ru"))
                .map(
                  (x) => `
              <tr>
                <td>${esc(x.customer.name)}${x.customer.isSelf ? " (я)" : ""}</td>
                <td class="tabular-nums">${x.items.length}</td>
                <td class="tabular-nums">${x.deliveredCount}</td>
                <td class="tabular-nums hide-mobile">${kg(x.weight)}</td>
                <td class="tabular-nums hide-mobile">${money(x.value)}</td>
                <td class="tabular-nums hide-mobile">${money(x.delivery)}</td>
                <td class="tabular-nums font-semibold">${money(x.total)}</td>
              </tr>
            `,
                )
                .join("") ||
              '<tr><td colspan="7" class="text-center py-6 text-slate-400">Нет товаров</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel">
      <div class="flex items-center justify-between gap-3">
        <h3>Товары в заказе</h3>
        ${orderStatus === "В сборке" ? `<button class="btn-secondary" id="addItem">${I.plus} Добавить товар</button>` : ""}
      </div>
      <div id="orderItemsList">${renderItemsList(items, orderStatus, customers)}</div>
    </div>
  `;

  bindOrderActions(order, items, orderStatus);
}

function bindOrderActions(order: Order, _items: Item[], _orderStatus: OrderStatus): void {
  // Ship
  document.getElementById("shipOrder")?.addEventListener("click", async () => {
    const now = new Date().toISOString().split("T")[0];
    await orderRepository.save(order.update({ shippedAt: now }));
    renderOrderView();
    toastState.add({ message: "Заказ отправлен", type: "success" });
  });

  // Receive
  document.getElementById("receiveOrder")?.addEventListener("click", () => {
    openReceiveModal(order);
  });

  // Return to assembly
  document.getElementById("returnToAssembly")?.addEventListener("click", async () => {
    confirmDrawer(
      "Вернуть в сборку",
      "Даты отправления и получения будут очищены. Продолжить?",
      "Вернуть",
      async () => {
        await orderRepository.save(order.update({ shippedAt: null, receivedAt: null }));
        renderOrderView();
        toastState.add({ message: "Заказ возвращен в сборку", type: "success" });
      },
    );
  });

  // Edit order
  on(document.getElementById("editOrder"), "click", () => openOrderForm(order));

  // Export
  on(document.getElementById("exportOrder"), "click", () => exportOrder(order));

  // Add item
  const addItemBtn = document.getElementById("addItem");
  if (addItemBtn) on(addItemBtn, "click", () => openItemForm(null, order.id));

  // Item actions
  const listRoot = document.getElementById("orderItemsList");
  if (listRoot) {
    listRoot.querySelectorAll("[data-edit]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => openItemForm(parseInt(el.dataset.edit!), order.id));
    });
    listRoot.querySelectorAll("[data-move]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => moveItem(parseInt(el.dataset.move!)));
    });
    listRoot.querySelectorAll("[data-weigh]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => weighItem(parseInt(el.dataset.weigh!)));
    });
    listRoot.querySelectorAll("[data-delete]").forEach((b) => {
      const el = b as HTMLElement;
      on(el, "click", () => deleteItem(parseInt(el.dataset.delete!)));
    });
  }
}

// ============================================
// Modals & Forms
// ============================================

async function openOrderForm(order?: Order): Promise<void> {
  const isNew = !order;
  const status = order?.derivedStatus || "В сборке";
  const canReceive = order ? order.canReceive() : false;

  drawer(
    isNew ? "Новый заказ" : "Редактировать заказ",
    `
    <form id="orderForm" novalidate>
      <div class="field"><label>Название заказ *</label><input name="title" required autocomplete="organization-title" autofocus value="${esc(order?.title || "")}" placeholder="Например, Заказ от 20.11.2026"></div>
      
      <div class="field">
        <label>Статус</label>
        <div class="pill ${getStatusClass(status)}" style="width: fit-content; padding: 0.25rem 0.75rem;">${esc(status)}</div>
        <p class="text-xs text-slate-500 mt-1">
          ${status === "В сборке" ? "Укажите дату отправления → станет «Отправлен»" : ""}
          ${status === "Отправлен" ? (canReceive ? "Укажите дату получения → станет «Получен»" : "⚠ Не все товары доставлены/потеряны — заказ нельзя получить") : ""}
          ${status === "Получен" ? "Заказ завершён" : ""}
        </p>
      </div>

      <div class="field"><label>Дата отправления</label><input name="shipped_at" type="date" value="${order?.shippedAt || ""}" ${status === "Получен" ? "readonly" : ""}></div>
      <div class="field"><label>Дата получения</label><input name="received_at" type="date" value="${order?.receivedAt || ""}" ${status !== "Отправлен" || !canReceive ? "readonly" : ""}></div>
      
      ${
        !isNew
          ? `
        <div class="field"><label>Вес коробки (г)</label><input name="box_weight_g" type="number" min="0" step="1" inputmode="numeric" autocomplete="off" value="${order?.boxWeightG ?? ""}" placeholder="Например, 6000"></div>
        <div class="field"><label>Стоимость доставки (BYN)</label><input name="shipping_cost" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" value="${order?.shippingCost ?? ""}" placeholder="Например, 30.00"></div>
      `
          : ""
      }
      <div class="actions"><button type="submit" ${!isNew && status === "Отправлен" && !canReceive ? "disabled" : ""}>${isNew ? "Создать" : "Сохранить"}</button>${!isNew ? '<button type="button" class="danger" id="deleteOrder">${I.trash} Удалить</button>' : ""}</div>
    </form>
  `,
  );

  const form = document.getElementById("orderForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const title = String(formData.get("title") || "").trim();
      const shippedAt = String(formData.get("shipped_at") || "") || null;
      const receivedAt = String(formData.get("received_at") || "") || null;
      const boxWeightGStr = String(formData.get("box_weight_g") || "");
      const shippingCostStr = String(formData.get("shipping_cost") || "");
      const boxWeightG = boxWeightGStr === "" ? null : parseInt(boxWeightGStr);
      const shippingCost = shippingCostStr === "" ? null : parseFloat(shippingCostStr);

      if (isNew) {
        await createNewOrder(title);
      } else if (order) {
        if (receivedAt && !order.canReceive()) {
          toastState.add({
            message: "Нельзя получить заказ: не все товары доставлены или потеряны",
            type: "error",
          });
          return;
        }
        await orderRepository.save(
          order.update({
            title,
            shippedAt,
            receivedAt,
            boxWeightG,
            shippingCost,
          }),
        );
      }
      closeDrawer();
      renderOrderView();
      renderHistoryView(); // Update history tab too
      toastState.add({ message: isNew ? "Заказ создан" : "Заказ сохранён", type: "success" });
    });
  }

  on(document.getElementById("deleteOrder"), "click", async () => {
    if (order) await deleteOrder(order.id);
  });
}

function openItemForm(itemId: number | null, orderId: number): void {
  const isNew = !itemId;

  if (isNew) {
    renderItemForm(null, orderId, true);
  } else {
    itemRepository.findById(itemId).then((item) => {
      if (item) renderItemForm(item, orderId, false);
    });
  }
}

function renderItemForm(item: Item | null, orderId: number, isNew: boolean): void {
  customerRepository.findAll().then((customers) => {
    const customerOptions = customers
      .map(
        (c) =>
          `<option value="${c.id}" ${c.id === item?.customerId ? "selected" : ""}>${esc(c.name)}${c.isSelf ? " (я)" : ""}</option>`,
      )
      .join("");

    drawer(
      isNew ? "Новый товар" : "Редактировать товар",
      `
      <form id="itemForm" novalidate>
        <div class="field"><label>Название *</label><input name="name" required autocomplete="off" autofocus value="${esc(item?.name || "")}"></div>
        <div class="field"><label>Заказчик *</label><select name="customer_id" required>${customerOptions}</select></div>
        <div class="field"><label>Трек-номер</label><input name="track" autocomplete="off" value="${esc(item?.track || "")}"></div>
        <div class="field"><label>Цена Br *</label><input name="price" type="number" step="0.01" required value="${item?.price || ""}"></div>
        <div class="field"><label>Статус</label><select name="status">${["В сборке", "Взвешен", "Ожидает взвешивания", "Потерян", "Пропущен"].map((s) => `<option ${item?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Вес (г)</label><input name="weight_g" type="number" step="1" value="${item?.weightG || ""}"></div>
        <div class="actions"><button type="submit">${isNew ? "Добавить" : "Сохранить"}</button></div>
      </form>
    `,
    );

    const form = document.getElementById("itemForm") as HTMLFormElement;
    if (form) {
      on(form, "submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const trackVal = formData.get("track")?.toString().trim();
        const weightVal = formData.get("weight_g")?.toString().trim();
        const data = {
          orderId,
          name: formData.get("name")?.toString().trim() || "",
          customerId: parseInt(formData.get("customer_id")?.toString() || "0"),
          track: trackVal || undefined,
          price: parseFloat(formData.get("price")?.toString() || "0"),
          status: (formData.get("status")?.toString() as ItemStatus) || "Ожидает взвешивания",
          weightG: weightVal ? parseInt(weightVal) : undefined,
        };

        if (isNew) {
          const newItem = Item.create(data);
          await itemRepository.save(newItem);
        } else if (item) {
          // Remove orderId from data for update
          const { orderId: _, ...updateData } = data;
          const updated = item.update(updateData);
          await itemRepository.save(updated);
        }
        closeDrawer();
        renderOrderView();
        toastState.add({ message: "Товар сохранён", type: "success" });
      });
    }
  });
}

function openReceiveModal(order: Order): void {
  // Reuse the receive logic from events
  import("@/features/shared/receive.js").then((m) => m.openReceiveModal(order));
}

async function weighItem(itemId: number): Promise<void> {
  const item = await itemRepository.findById(itemId);
  if (!item) return;

  drawer(
    "Взвесить товар",
    `
    <form id="weighForm">
      <div class="field"><label>Вес (г) *</label><input name="weight_g" type="number" step="1" required autofocus></div>
      <div class="actions"><button type="submit">Сохранить вес</button></div>
    </form>
  `,
  );

  const form = document.getElementById("weighForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const weightG = parseInt(new FormData(form).get("weight_g")?.toString() || "0");
      await itemService.weighItem(itemId, weightG);
      closeDrawer();
      renderOrderView();
      toastState.add({ message: "Вес сохранён", type: "success" });
    });
  }
}

async function moveItem(itemId: number): Promise<void> {
  await itemService.moveItem(itemId);
  renderOrderView();
}

async function deleteItem(itemId: number): Promise<void> {
  confirmDrawer(
    "Удалить товар",
    "Товар будет удалён. Это действие нельзя отменить.",
    "Удалить",
    async () => {
      await itemRepository.delete(itemId);
      renderOrderView();
      toastState.add({ message: "Товар удалён", type: "success" });
    },
  );
}

async function deleteOrder(orderId: number): Promise<void> {
  confirmDrawer(
    "Удалить заказ",
    "Заказ будет удалён со всеми товарами. Это действие нельзя отменить.",
    "Удалить",
    async () => {
      await orderRepository.delete(orderId);
      if (uiState.currentOrderId === orderId) {
        uiState.setCurrentOrderId(null);
      }
      renderOrderView();
      renderHistoryView();
      toastState.add({ message: "Заказ удалён", type: "success" });
    },
  );
}

async function createNewOrder(title?: string): Promise<Order> {
  const orderTitle =
    title ||
    `Заказ от ${new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  const order = await orderService.createOrder(orderTitle);
  uiState.setCurrentOrderId(order.id);
  return order;
}

async function getOrderWithCalculation(orderId: number) {
  const result = await orderService.getOrderWithItems(orderId);
  if (!result) return null;
  const customers = await customerRepository.findAll();
  return {
    order: result.order,
    items: result.items,
    calculation: calculateOrder(result.order, result.items, customers),
    customers,
  };
}

function renderItemsList(
  items: Item[],
  orderStatus: OrderStatus,
  customers: { id: number; name: string; isSelf: boolean }[],
): string {
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  return (
    items
      .map((i) => {
        const customer = customerMap.get(i.customerId);
        return itemHtml(i, orderStatus, customer?.name || "", customer?.isSelf || false);
      })
      .join("") || '<div class="empty">Нет товаров</div>'
  );
}

function itemHtml(
  item: Item,
  orderStatus: OrderStatus,
  customerName: string,
  isSelf: boolean,
): string {
  const statusCls = item.statusClass;
  return `
    <div class="item">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="font-bold truncate">${esc(item.name)}</div>
          <div class="text-xs text-slate-500 mt-0.5 truncate">${esc(customerName)} ${isSelf ? "(я)" : ""} · трек: ${esc(item.track || "—")}</div>
          <div class="flex items-center gap-2 flex-wrap mt-1.5">
            <span class="pill ${statusCls}">${esc(item.status)}</span>
            ${item.weightG && item.status === "Взвешен" ? `<span class="text-xs text-slate-500 tabular-nums">${item.displayWeight}</span>` : ""}
          </div>
        </div>
        <div class="item-right shrink-0">
          <b class="tabular-nums">${money(item.price)}</b>
          <div class="flex gap-2 justify-end mt-1.5">
            <button class="btn-secondary" data-edit="${item.id}">${I.pencil}</button>
            ${orderStatus === "В сборке" ? `<button class="btn-secondary" data-move="${item.id}">${I.arrowRight}</button>` : ""}
            <button class="btn-secondary" data-weigh="${item.id}">${I.package}</button>
            <button class="btn-danger" data-delete="${item.id}">${I.trash}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function formatOrderTitle(order: Order | HistoryOrder): string {
  return order.formattedTitle;
}

function getStatusClass(status: OrderStatus): string {
  switch (status) {
    case "В сборке":
      return "warn";
    case "Отправлен":
      return "info";
    case "Получен":
      return "good";
    default:
      return "";
  }
}

// ============================================
// Excel Export
// ============================================

interface XLSXStatic {
  utils: {
    book_new: () => any;
    book_append_sheet: (wb: any, ws: any, name: string) => void;
    aoa_to_sheet: (data: (string | number)[][]) => any;
  };
  writeFile: (wb: any, filename: string) => void;
}

declare global {
  interface Window {
    XLSX?: XLSXStatic;
  }
}

async function exportOrder(order: Order): Promise<void> {
  if (!window.XLSX) {
    toastState.add({ message: "Загрузка Excel...", type: "info", duration: 0 });
    try {
      // @ts-ignore - dynamic import from CDN
      await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
    } catch {
      toastState.add({ message: "Библиотека Excel не загрузилась", type: "warn" });
      return;
    }
    toastState.add({ message: "", type: "info", duration: 1 }); // Clear loading
  }

  if (!window.XLSX) return;

  const result = await getOrderWithCalculation(order.id);
  if (!result) return;

  const { order: o, items, calculation } = result;
  const wb = window.XLSX.utils.book_new();
  const rows: (string | number)[][] = [];

  // Summary
  rows.push(["ОБЩАЯ СВОДКА"]);
  rows.push(["Заказ", o.title]);
  rows.push(["Дата отправления", o.shippedAt || "—"]);
  rows.push(["Статус", o.derivedStatus]);
  rows.push(["Вес коробки, кг", kg(o.boxWeightG)]);
  rows.push(["Вес взвешенных товаров, кг", kg(calculation.totalWeight)]);
  rows.push(["Свободный вес, кг", kg(calculation.freeWeight)]);
  rows.push(["Стоимость доставки, BYN", money(o.shippingCost)]);
  rows.push(["Тариф, BYN/кг", calculation.tariff]);
  rows.push(["Распределено доставки, BYN", money(calculation.deliveryTotal)]);
  rows.push(["Всего товаров", items.length]);
  rows.push(["Взвешено", items.filter((i) => i.status === "Взвешен").length]);
  rows.push(["Потеряно", items.filter((i) => i.status === "Потерян").length]);
  rows.push(["Пропущено", items.filter((i) => i.status === "Пропущен").length]);
  rows.push([]);

  // Per customer
  rows.push(["СВОДКА ПО ЗАКАЗЧИКАМ"]);
  rows.push([
    "Заказчик",
    "Товаров взвешено",
    "Вес, кг",
    "Стоимость товаров, BYN",
    "Доставка, BYN",
    "Итого, BYN",
  ]);
  const perCustomerEntries = Array.from(calculation.perCustomer.values()) as CustomerSummary[];
  perCustomerEntries.sort((a, b) => a.customer.name.localeCompare(b.customer.name, "ru"));
  perCustomerEntries.forEach((x) => {
    rows.push([
      x.customer.name,
      x.items.filter((i) => i.status === "Взвешен").length,
      kg(x.weight),
      money(x.value),
      money(x.delivery),
      money(x.total),
    ]);
  });
  rows.push([]);

  // Items
  rows.push(["ТОВАРЫ (СОРТИРОВКА ПО ЗАКАЗЧИКУ)"]);
  rows.push([
    "Заказчик",
    "Товар",
    "Трек-номер",
    "Статус",
    "Вес, кг",
    "Цена, BYN",
    "Доставка, BYN",
    "Итого, BYN",
  ]);

  const deliveryByItem: Record<number, number> = {};
  items.forEach((i) => {
    if (i.weightG && i.status === "Взвешен" && calculation.tariff > 0) {
      deliveryByItem[i.id] = (i.weightG / 1000) * calculation.tariff;
    }
  });

  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  sortedItems.forEach((i) => {
    const d = deliveryByItem[i.id] || 0;
    const customer = calculation.perCustomer.get(i.customerId)?.customer;
    rows.push([
      customer?.name || "",
      i.name,
      i.track || "",
      i.status,
      i.weightG === null ? "" : kg(i.weightG),
      money(i.price),
      money(d),
      money(i.price + d),
    ]);
  });

  window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet(rows), "Заказ");
  window.XLSX.writeFile(
    wb,
    `${o.title.replace(/[\\/:*?"<>|]/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`,
  );
  toastState.add({ message: "Excel сохранён", type: "success" });
}

// Auto-render when tab becomes active
uiState.subscribeTab((tab) => {
  if (tab === "orders") renderHistoryView();
  if (tab === "order") renderOrderView();
});

uiState.subscribeOrder((_orderId) => {
  if (uiState.currentTab === "order") renderOrderView();
});
