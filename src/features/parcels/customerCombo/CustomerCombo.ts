import { I, esc } from "@/core/utils";
import { on } from "@/core/listeners";
import { toastState } from "@/core/state";
import { customerService } from "@/features/shared/wiring";
import type { Customer } from "@/features/customers/domain";
import {
  customerKey,
  customerLabel,
  findCustomerByName,
  rankCustomers,
} from "@/features/customers/ui/CustomerPresentation";
import { pickerCaretHtml } from "../ui/Select";

export type CustomerComboState = {
  customers: Customer[];
  selectedCustomerId: number | null;
};

export type CustomerCombo = {
  // Caller decides when a typed value must be committed (e.g. before batch save).
  commit: () => Promise<boolean>;
};

export function customerComboHtml(selected: Customer | undefined): string {
  return `
    <div class="field customer-combo" id="customerCombo">
      <label for="customerComboInput">Заказчик</label>
      <div class="picker">
        <input class="picker__control" id="customerComboInput" type="text" role="combobox" aria-expanded="false"
          aria-controls="customerComboList" aria-autocomplete="list" autocomplete="off"
          placeholder="Выберите или создайте" value="${esc(selected ? customerLabel(selected) : "")}">
        ${pickerCaretHtml}
      </div>
      <div class="customer-combo__list" id="customerComboList" role="listbox" hidden></div>
      <span class="customer-combo__error" id="customerComboError" hidden></span>
    </div>
  `;
}

export function createCustomerCombo(
  root: HTMLElement,
  state: CustomerComboState,
  customerMap: Map<number, Customer>,
): CustomerCombo {
  const wrapper = root.querySelector<HTMLElement>("#customerCombo");
  const input = root.querySelector<HTMLInputElement>("#customerComboInput");
  const list = root.querySelector<HTMLElement>("#customerComboList");
  const errorEl = root.querySelector<HTMLElement>("#customerComboError");
  if (!wrapper || !input || !list || !errorEl) {
    return { commit: async () => false };
  }
  const control = wrapper.querySelector<HTMLElement>(".picker");
  if (!control) return { commit: async () => false };

  // Focus stays in the input; the highlighted option is tracked via aria-activedescendant.
  // `filter` is only set by typing, so opening on a preselected value shows the whole list.
  let activeIndex = -1;
  let filter = "";
  let closeTimer: number | undefined;
  const optionId = (index: number): string => `customerComboOption${index}`;
  const optionButtons = (): HTMLButtonElement[] => [
    ...list.querySelectorAll<HTMLButtonElement>(".customer-combo__option"),
  ];
  const clearActive = (): void => {
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    for (const button of optionButtons()) button.removeAttribute("data-active");
  };
  const setActive = (index: number): void => {
    const buttons = optionButtons();
    if (buttons.length === 0) return;
    activeIndex = (index + buttons.length) % buttons.length;
    buttons.forEach((button, i) => {
      if (i === activeIndex) button.setAttribute("data-active", "true");
      else button.removeAttribute("data-active");
    });
    input.setAttribute("aria-activedescendant", optionId(activeIndex));
    buttons[activeIndex]!.scrollIntoView({ block: "nearest" });
  };

  const clearError = (): void => {
    errorEl.textContent = "";
    errorEl.hidden = true;
    input.removeAttribute("aria-invalid");
  };
  const showError = (message: string): void => {
    errorEl.textContent = message;
    errorEl.hidden = false;
    input.setAttribute("aria-invalid", "true");
  };

  const renderOptions = (): void => {
    const name = filter.trim();
    const matches = rankCustomers(state.customers, name);
    const options = matches
      .map(
        (c, index) => `
          <button type="button" class="customer-combo__option" role="option" id="${optionId(index)}"
            data-customer-id="${c.id}" aria-selected="${c.id === state.selectedCustomerId}">
            ${esc(customerLabel(c))}
          </button>
        `,
      )
      .join("");
    const create =
      !name || findCustomerByName(state.customers, name)
        ? ""
        : `<button type="button" class="customer-combo__option customer-combo__option--create" role="option" data-create="true" id="${optionId(matches.length)}">
           ${I.plus} Создать «${esc(name)}»
          </button>`;
    list.innerHTML = options + create || '<div class="customer-combo__empty">Нет заказчиков</div>';
    clearActive();
  };

  const close = (): void => {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    clearActive();
  };
  const open = (): void => {
    renderOptions();
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };
  const select = (customer: Customer): void => {
    state.selectedCustomerId = customer.id;
    customerMap.set(customer.id, customer);
    input.value = customerLabel(customer);
    filter = "";
    clearError();
    close();
  };

  // Any typed value is valid: use an exact existing customer or create a new one.
  const commit = async (): Promise<boolean> => {
    const name = input.value.trim();
    if (!name) {
      showError("Укажите заказчика");
      input.focus();
      return false;
    }
    const existing = findCustomerByName(state.customers, name);
    if (existing) {
      select(existing);
      return true;
    }
    if (name.length > 100) {
      showError("Имя заказчика слишком длинное");
      input.focus();
      return false;
    }
    try {
      const customer = await customerService.createCustomer(name);
      state.customers.push(customer);
      select(customer);
      toastState.add({ message: `Заказчик «${customer.name}» добавлен`, type: "success" });
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Не удалось создать заказчика");
      return false;
    }
  };

  // The whole control opens the list; no separate focusable toggle is needed.
  on(control, "click", (e) => {
    if ((e.target as HTMLElement).closest("input")) return;
    if (list.hidden) open();
    input.focus();
  });
  on(input, "focus", open);
  on(input, "click", open);
  on(input, "input", () => {
    clearError();
    filter = input.value;
    const selected = state.customers.find((c) => c.id === state.selectedCustomerId);
    if (selected && customerKey(input.value) !== customerKey(customerLabel(selected))) {
      state.selectedCustomerId = null;
    }
    renderOptions();
    if (list.hidden) open();
  });
  on(input, "keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) {
        open();
        setActive(0);
      } else {
        setActive(activeIndex + (e.key === "ArrowDown" ? 1 : -1));
      }
      return;
    }
    if (e.key === "Escape") {
      if (!list.hidden) e.preventDefault();
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const highlighted = !list.hidden && activeIndex >= 0 ? optionButtons()[activeIndex] : null;
      if (highlighted) highlighted.click();
      else void commit();
    }
  });
  const cancelClose = (): void => {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer);
      closeTimer = undefined;
    }
  };
  // On touch screens tapping an option blurs the input before `click` fires.
  on(list, "pointerdown", cancelClose);
  on(list, "click", (e) => {
    cancelClose();
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(".customer-combo__option");
    if (!button) return;

    const id = button.dataset.customerId;
    if (id) {
      const customer =
        state.customers.find((c) => c.id === Number(id)) ?? customerMap.get(Number(id));
      if (customer) select(customer);
      return;
    }

    if (button.dataset.create) void commit();
  });
  on(wrapper, "focusout", (e) => {
    if (wrapper.contains(e.relatedTarget as Node | null)) return;
    cancelClose();
    closeTimer = window.setTimeout(() => {
      closeTimer = undefined;
      close();
    }, 150);
  });

  return { commit };
}
