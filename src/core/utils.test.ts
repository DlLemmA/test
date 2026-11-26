import { describe, expect, it } from "vitest";
import { byn, cny, formatMoney } from "./utils";

const NBSP = "\u00a0";

describe("currency formatting", () => {
  it("formats BYN with the Russian locale and currency code", () => {
    expect(byn(13.65)).toBe(`13,65${NBSP}BYN`);
    expect(byn(0)).toBe(`0,00${NBSP}BYN`);
    expect(byn(null)).toBe(`0,00${NBSP}BYN`);
    expect(byn(1234.5)).toBe(`1${NBSP}234,50${NBSP}BYN`);
  });

  it("formats CNY through the same formatter", () => {
    expect(cny(13.65)).toBe(`13,65${NBSP}CNY`);
    expect(cny(0)).toBe(`0,00${NBSP}CNY`);
    expect(cny(1234.5)).toBe(`1${NBSP}234,50${NBSP}CNY`);
    expect(formatMoney(13.65, "USD")).toBe(`13,65${NBSP}USD`);
  });

  it("rounds decimals using Intl rather than toFixed", () => {
    expect(byn(1.005)).toBe(`1,01${NBSP}BYN`);
    expect(cny(2.675)).toBe(`2,68${NBSP}CNY`);
  });
});
