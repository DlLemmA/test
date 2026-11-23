// ============================================
// Customer form dialog
// The drawer is app-level imperative infrastructure; this module owns only
// the dialog's own listeners. The caller supplies an AbortSignal so the Vue
// view can tear them down with its own lifetime.
// ============================================

import { closeDrawer, drawer } from "@/core/drawer";
import { toastState } from "@/core/state";
import { esc } from "@/core/utils";
import { customerService } from "@/features/shared/wiring";

type CustomerDraft = { id: number; name: string; isSelf: boolean };

export function openCustomerForm(
  id: number | undefined,
  signal: AbortSignal,
  refresh: () => void,
): void {
  if (id === undefined) {
    renderCustomerForm(null, true, signal, refresh);
    return;
  }
  void customerService.findById(id).then((customer) => {
    if (!customer || signal.aborted) return;
    renderCustomerForm(customer, false, signal, refresh);
  });
}

function renderCustomerForm(
  customer: CustomerDraft | null,
  isNew: boolean,
  signal: AbortSignal,
  refresh: () => void,
): void {
  const title = isNew ? "Новый заказчик" : "Редактировать заказчика";
  drawer(
    title,
    `
    <form id="customerForm" novalidate aria-label="${title}">
      <div class="field">
        <label for="customerName">Имя *</label>
        <input id="customerName" name="name" type="text" required autocomplete="name" autofocus
          enterkeyhint="done" aria-describedby="customerNameError"
          value="${esc(customer?.name || "")}" placeholder="Иван">
        <span id="customerNameError" class="field-error" hidden></span>
      </div>
      <div class="field field-check">
        <input id="customerSelf" name="is_self" type="checkbox" ${customer?.isSelf ? "checked" : ""}>
        <label for="customerSelf">Это я</label>
      </div>
      <div class="form-actions"><button type="submit" class="btn-primary w-full">${isNew ? "Добавить" : "Сохранить"}</button></div>
    </form>
  `,
  );

  const form = document.getElementById("customerForm") as HTMLFormElement | null;
  const nameInput = document.getElementById("customerName") as HTMLInputElement | null;
  const nameError = document.getElementById("customerNameError") as HTMLElement | null;
  if (!form || !nameInput || !nameError) return;

  const showNameError = (message: string): void => {
    nameInput.setCustomValidity(message);
    nameInput.setAttribute("aria-invalid", "true");
    nameError.textContent = message;
    nameError.hidden = false;
    nameInput.focus();
  };
  const clearNameError = (): void => {
    nameInput.setCustomValidity("");
    nameInput.removeAttribute("aria-invalid");
    nameError.textContent = "";
    nameError.hidden = true;
  };

  nameInput.addEventListener("input", clearNameError, { signal });
  nameInput.addEventListener("change", clearNameError, { signal });

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = data.get("name")?.toString().trim() || "";
      const isSelf = data.get("is_self") === "on";

      if (!name) {
        showNameError("Укажите имя заказчика");
        return;
      }

      try {
        if (isNew) {
          await customerService.createCustomer({ name, isSelf });
        } else if (customer) {
          await customerService.updateCustomer(customer.id, { name, isSelf });
        }
        closeDrawer();
        refresh();
        toastState.add({ message: "Заказчик сохранён", type: "success" });
      } catch (error) {
        showNameError(error instanceof Error ? error.message : "Не удалось сохранить заказчика");
      }
    },
    { signal },
  );
}
