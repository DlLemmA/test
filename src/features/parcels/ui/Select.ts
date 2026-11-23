import { esc } from "@/core/utils";
import { pickerCaretHtml } from "./Picker";

export type SelectOption = {
  value: string | number;
  label: string;
  selected?: boolean;
};

export type SelectProps = {
  options: SelectOption[];
  id?: string;
  name?: string;
  required?: boolean;
  attrs?: Record<string, string>;
};

export function selectHtml({ options, id, name, required, attrs }: SelectProps): string {
  const attributes = [
    id ? `id="${esc(id)}"` : "",
    name ? `name="${esc(name)}"` : "",
    required ? "required" : "",
    ...Object.entries(attrs ?? {}).map(([key, value]) => `${key}="${esc(value)}"`),
  ]
    .filter(Boolean)
    .join(" ");

  const optionHtml = options
    .map(
      (option) =>
        `<option value="${esc(String(option.value))}"${option.selected ? " selected" : ""}>${esc(option.label)}</option>`,
    )
    .join("");

  return `
    <div class="picker">
      <select class="picker__control" ${attributes}>${optionHtml}</select>
      ${pickerCaretHtml}
    </div>
  `;
}
