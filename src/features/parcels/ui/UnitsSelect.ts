import { selectHtml, type SelectOption, type SelectProps } from "./Select";

const UNITS: SelectOption[] = [
  { value: "pcs", label: "шт" },
  { value: "packs", label: "уп" },
  { value: "pairs", label: "пар" },
];

export function unitsSelectHtml({
  current,
  ...props
}: Omit<SelectProps, "options"> & { current?: string }): string {
  const options = UNITS.map((unit) => ({ ...unit, selected: unit.value === current }));
  return selectHtml({ ...props, options });
}
