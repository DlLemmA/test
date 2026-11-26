// ============================================
// Shared UI Helpers
// ============================================

/** Escape HTML special characters */
export function esc(s: string | number | null | undefined): string {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c] ?? c;
  });
}

/** Format weight: grams -> "X.XXX" kg string */
export function kg(g: number | null | undefined): string {
  return g == null ? "\u2014" : (g / 1000).toFixed(3);
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/** Format money for the current locale, with the currency code after the amount. */
export function formatMoney(v: number | null | undefined, currency: string): string {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ru-BY", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(v || 0);
}

/** Format BYN */
export function byn(v: number | null | undefined): string {
  return formatMoney(v, "BYN");
}

/** Format CNY */
export function cny(v: number | null | undefined): string {
  return formatMoney(v, "CNY");
}

/** ISO date string for "now" */
export function dateNow(): string {
  return new Date().toISOString();
}

/**
 * Russian pluralization in the i18n `t` style. Pass four pipe-separated forms:
 * zero | one | few | many. Put `{count}` into a form where the number should
 * appear; without it the form is returned as-is (handy for a bare noun).
 *
 * const forms = "нет предметов | {count} предмет | {count} предмета | {count} предметов";
 * t(forms, 0) // "нет предметов"
 * t(forms, 1) // "1 предмет"
 * t(forms, 3) // "3 предмета"
 * t(forms, 5) // "5 предметов"
 */
export function t(forms: string, count: number): string {
  const parts = forms.split("|").map((part) => part.trim());
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  let index = 3;
  if (n === 0) index = 0;
  else if (mod10 === 1 && mod100 !== 11) index = 1;
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) index = 2;
  const form = parts[index] ?? parts[parts.length - 1] ?? "";
  return form.split("{count}").join(String(count));
}

// === Icons (lucide, 16px, stroke 1.5) ===
const icon = (d: string) =>
  `<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const I = {
  x: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  pencil: icon(
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.849 16.17a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  ),
  sheet: icon(
    '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M9 6h1"/><path d="M15 18h-6"/><path d="M15 14h-6"/><path d="M9 10h1"/>',
  ),
  plus: icon('<path d="M5 12h14"/><path d="M12 5v14"/>'),
  camera: icon(
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  ),
  stop: icon('<rect width="12" height="12" x="6" y="6" rx="2"/>'),
  download: icon('<path d="M12 3v12"/><path d="m18 11-6 6-6-6"/><path d="M21 21H3"/>'),
  upload: icon('<path d="M12 15V3"/><path d="m18 9-6-6-6 6"/><path d="M21 21H3"/>'),
  home: icon(
    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  ),
  package: icon(
    '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  ),
  users: icon(
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  ),
  history: icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  trash: icon(
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  ),
  arrowRight: icon('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
  check: icon('<polyline points="20 6 9 17 4 12"/>'),
  checkCircle: icon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  info: icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  alertTriangle: icon(
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ),
  xCircle: icon('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  scan: icon(
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 5h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M5 19H3a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/><line x1="12" x2="12" y1="7" y2="17"/>',
  ),
  creditcard: icon(
    '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  ),
  copy: icon(
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ),
  user: icon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  mail: icon('<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m2 7 10 6 10-6"/>'),
  logOut: icon(
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  ),
  search: icon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  flaskConical: icon(
    '<path d="M9 3h6"/><path d="M10 3v5.3L4.6 17.4a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8.3V3"/><path d="M6.3 17h11.4"/>',
  ),
  chevronLeft: icon('<path d="m15 18-6-6 6-6"/>'),
  chevronRight: icon('<path d="m9 18 6-6-6-6"/>'),
  inbox: icon(
    '<rect width="22" height="11" x="1" y="3" rx="2" ry="2"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V3z"/><polyline points="22 12 16 12 14 15 12 12 2 12"/>',
  ),
};
