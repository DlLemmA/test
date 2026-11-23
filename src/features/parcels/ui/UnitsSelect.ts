import { UNIT_OPTIONS } from "./ParcelPresentation";
import { selectHtml, type SelectProps } from "./Select";

export function unitsSelectHtml({
  current,
  ...props
}: Omit<SelectProps, "options"> & { current?: string }): string {
  const options = UNIT_OPTIONS.map((unit) => ({ ...unit, selected: unit.value === current }));
  return selectHtml({ ...props, options });
}
