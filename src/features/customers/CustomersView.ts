import { customerRepository } from "./infrastructure";
import { customerService } from "@/features/shared/services";
import { drawer, confirmDrawer, closeDrawer } from "@/core/drawer";
import { on } from "@/core/listeners";
import { uiState, toastState } from "@/core/state";
import { I, esc } from "@/core/utils";

// ============================================
// Customers View Component
// ============================================

export async function renderCustomersView(): Promise<void> {
  const root = document.getElementById("peopleView");
  if (!root) return;

  const customers = await customerRepository.findAll();

  root.innerHTML = `
    <div class="panel">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h2>Заказчики</h2>
        <button class="btn-secondary" id="addCustomer">${I.plus} Добавить</button>
      </div>
      ${
        customers.length
          ? customers
              .map(
                (c) => `
        <div class="item flex items-center justify-between gap-3">
          <div><b>${esc(c.name)}${c.isSelf ? " (я)" : ""}</b></div>
          <div class="flex gap-2">
            <button class="btn-secondary" data-edit-customer="${c.id}">Изменить</button>
            <button class="btn-danger" data-del-customer="${c.id}">${I.trash} Удалить</button>
          </div>
        </div>
      `,
              )
              .join("")
          : '<div class="empty">Нет заказчиков</div>'
      }
    </div>
  `;

  bindActions();
}

function bindActions(): void {
  const addBtn = document.getElementById("addCustomer");
  if (addBtn) {
    on(addBtn, "click", () => openCustomerForm());
  }

  document.querySelectorAll("[data-edit-customer]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", () => openCustomerForm(parseInt(b.dataset.editCustomer!)));
  });

  document.querySelectorAll("[data-del-customer]").forEach((btn) => {
    const b = btn as HTMLElement;
    on(b, "click", async () => {
      const id = parseInt(b.dataset.delCustomer!);
      await deleteCustomer(id);
    });
  });
}

function openCustomerForm(id?: number): void {
  if (id) {
    // Fetch and open
    customerRepository.findById(id).then((c) => {
      if (c) renderCustomerForm(c, false);
    });
  } else {
    renderCustomerForm(null, true);
  }
}

function renderCustomerForm(
  customer: { id: number; name: string; isSelf: boolean } | null,
  isNew: boolean,
): void {
  drawer(
    isNew ? "Новый заказчик" : "Редактировать заказчика",
    `
    <form id="customerForm" novalidate>
      <div class="field"><label>Имя *</label><input name="name" required autocomplete="name" autofocus value="${esc(customer?.name || "")}" placeholder="Иван"></div>
      <div class="field"><label><input name="is_self" type="checkbox" ${customer?.isSelf ? "checked" : ""}> Это я</label></div>
      <div class="actions"><button type="submit">${isNew ? "Добавить" : "Сохранить"}</button></div>
    </form>
  `,
  );

  const form = document.getElementById("customerForm") as HTMLFormElement;
  if (form) {
    on(form, "submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const name = formData.get("name")?.toString().trim() || "";
      const isSelf = formData.get("is_self") === "on";

      if (!name) return;

      try {
        if (isNew) {
          await customerService.validateUniqueName(name);
          await customerRepository.save(
            (await import("@/features/customers/domain.js")).Customer.create({ name, isSelf }),
          );
        } else if (customer) {
          await customerService.validateUniqueName(name, customer.id);
          const updated = (await import("@/features/customers/domain.js")).Customer.fromPersistence(
            {
              id: customer.id,
              name,
              isSelf,
            },
          );
          await customerRepository.save(updated);
        }
        closeDrawer();
        renderCustomersView();
        toastState.add({ message: "Заказчик сохранён", type: "success" });
      } catch (err) {
        toastState.add({ message: err instanceof Error ? err.message : "Ошибка", type: "error" });
      }
    });
  }
}

async function deleteCustomer(id: number): Promise<void> {
  confirmDrawer("Удалить заказчика", "Заказчик будет удалён.", "Удалить", async () => {
    await customerRepository.delete(id);
    renderCustomersView();
    toastState.add({ message: "Заказчик удалён", type: "success" });
  });
}

// Auto-render when tab becomes active
uiState.subscribeTab((tab) => {
  if (tab === "people") renderCustomersView();
});
