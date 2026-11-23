// ============================================
// Customer combobox: one mount seam owns its markup, ids and DOM behaviour.
// The caller supplies only a host and receives results through the handle.
// ============================================

import { I, esc } from "@/core/utils";
import { createListenerScope } from "@/core/listeners";
import { toastState } from "@/core/state";
import { customerService } from "@/features/shared/wiring";
import type { Customer } from "@/features/customers/domain";
import {
  customerKey,
  customerLabel,
  findCustomerByName,
  rankCustomers,
} from "@/features/customers/ui/CustomerPresentation";
import { pickerCaretHtml } from "../ui/Picker";

const IDS = {
  wrapper: "customerCombo",
  input: "customerComboInput",
  list: "customerComboList",
  error: "customerComboError",
} as const;
const OPTION_PREFIX = "customerComboOption";
const OPTION_SELECTOR = ".customer-combo__option";
const optionId = (index: number): string => `${OPTION_PREFIX}${index}`;

export type CustomerComboSnapshot = {
  customers: Customer[];
  selectedCustomerId: number | null;
};

export type CustomerComboHandle = {
  /** Commit a typed value: select an existing customer or create a new one. */
  commit: () => Promise<boolean>;
  focus: () => void;
  selectedCustomer: () => Customer | null;
  snapshot: () => CustomerComboSnapshot;
  dispose(): void;
};

function markup(initial: CustomerComboSnapshot): string {
  const selected = initial.customers.find((c) => c.id === initial.selectedCustomerId);
  return `
    <div class="field customer-combo" id="${IDS.wrapper}">
      <label for="${IDS.input}">Заказчик</label>
      <div class="picker">
        <input class="picker__control" id="${IDS.input}" type="text" role="combobox" aria-expanded="false"
          aria-controls="${IDS.list}" aria-autocomplete="list" autocomplete="off"
          placeholder="Выберите или создайте" value="${esc(selected ? customerLabel(selected) : "")}">
        ${pickerCaretHtml}
      </div>
      <div class="customer-combo__list" id="${IDS.list}" role="listbox" hidden></div>
      <span class="customer-combo__error" id="${IDS.error}" hidden></span>
    </div>
  `;
}

export function mountCustomerCombo(
  host: HTMLElement,
  initial: CustomerComboSnapshot,
): CustomerComboHandle {
  let customers = [...initial.customers];
  let selectedCustomerId = initial.selectedCustomerId;
  const scope = createListenerScope();

  const read = {
    selectedCustomer: () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    snapshot: () => ({ customers: [...customers], selectedCustomerId }),
  };
  const unavailable: CustomerComboHandle = {
    ...read,
    commit: async () => false,
    focus: () => {},
    dispose: () => scope.dispose(),
  };

  host.insertAdjacentHTML("afterbegin", markup({ customers, selectedCustomerId }));

  const wrapper = host.querySelector<HTMLElement>(`#${IDS.wrapper}`);
  const input = host.querySelector<HTMLInputElement>(`#${IDS.input}`);
  const list = host.querySelector<HTMLElement>(`#${IDS.list}`);
  const errorEl = host.querySelector<HTMLElement>(`#${IDS.error}`);
  if (!wrapper || !input || !list || !errorEl) return unavailable;
  const control = wrapper.querySelector<HTMLElement>(".picker");
  if (!control) return unavailable;

  // Focus stays in the input; the highlighted option is tracked via aria-activedescendant.
  // `filter` is only set by typing, so opening on a preselected value shows the whole list.
  let activeIndex = -1;
  let filter = "";
  let closeTimer: number | undefined;
  const optionButtons = (): HTMLButtonElement[] => [
    ...list.querySelectorAll<HTMLButtonElement>(OPTION_SELECTOR),
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
    const matches = rankCustomers(customers, name);
    const options = matches
      .map(
        (c, index) => `
          <button type="button" class="customer-combo__option" role="option" id="${optionId(index)}"
            data-customer-id="${c.id}" aria-selected="${c.id === selectedCustomerId}">
            ${esc(customerLabel(c))}
          </button>
        `,
      )
      .join("");
    const create =
      !name || findCustomerByName(customers, name)
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
    if (!customers.some((c) => c.id === customer.id)) customers.push(customer);
    selectedCustomerId = customer.id;
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
    const existing = findCustomerByName(customers, name);
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
      select(customer);
      toastState.add({ message: `Заказчик «${customer.name}» добавлен`, type: "success" });
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : "Не удалось создать заказчика");
      return false;
    }
  };

  // The whole control opens the list; no separate focusable toggle is needed.
  scope.on(control, "click", (e) => {
    if ((e.target as HTMLElement).closest("input")) return;
    if (list.hidden) open();
    input.focus();
  });
  scope.on(input, "focus", open);
  scope.on(input, "click", open);
  scope.on(input, "input", () => {
    clearError();
    filter = input.value;
    const selected = customers.find((c) => c.id === selectedCustomerId);
    if (selected && customerKey(input.value) !== customerKey(customerLabel(selected))) {
      selectedCustomerId = null;
    }
    renderOptions();
    if (list.hidden) open();
  });
  scope.on(input, "keydown", (e) => {
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
  scope.on(list, "pointerdown", cancelClose);
  scope.on(list, "click", (e) => {
    cancelClose();
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(OPTION_SELECTOR);
    if (!button) return;

    const id = button.dataset.customerId;
    if (id) {
      const customer = customers.find((c) => c.id === Number(id));
      if (customer) select(customer);
      return;
    }

    if (button.dataset.create) void commit();
  });
  scope.on(wrapper, "focusout", (e) => {
    if (wrapper.contains(e.relatedTarget as Node | null)) return;
    cancelClose();
    closeTimer = window.setTimeout(() => {
      closeTimer = undefined;
      close();
    }, 150);
  });

  return {
    ...read,
    commit,
    focus: () => input.focus(),
    dispose: () => {
      scope.dispose();
      if (closeTimer !== undefined) clearTimeout(closeTimer);
    },
  };
}
