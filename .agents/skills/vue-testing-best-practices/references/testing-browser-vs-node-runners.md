---
title: Tests Need to Verify Computed Styles or Real DOM Events
impact: MEDIUM
impactDescription: JSDOM (Node) lacks real browser rendering - use Playwright for visual/layout testing
type: best-practice
tags: [testing, jsdom, playwright, browser, node, computed-styles, layout]
---

# Tests Need to Verify Computed Styles or Real DOM Events

## Problem

JSDOM (used by Vitest) doesn't compute layout, styles, or handle real browser events. Tests needing visual verification must run in a real browser.

## Solution

Use Playwright for tests requiring computed styles, layout, or real browser behavior.

### What JSDOM CAN'T do

```ts
// These DON'T work reliably in JSDOM/Vitest:

// 1. Computed styles
const wrapper = mount(Component)
expect(wrapper.get('div').element.style.color).toBe('red') // Always ''
expect(getComputedStyle(wrapper.get('div').element).color) // Not computed

// 2. Layout measurements
expect(wrapper.get('div').element.getBoundingClientRect()).toEqual(...) // All zeros

// 3. Real scroll/overflow
expect(wrapper.get('div').element.scrollHeight) // 0

// 4. Focus/selection management
input.focus()
expect(document.activeElement).toBe(input) // May not work

// 5. Real event propagation
await wrapper.trigger('click') // Simulated, not real

// 6. CSS animations/transitions
// 7. IntersectionObserver
// 8. ResizeObserver
// 9. WebGL/Canvas
```

### What Playwright CAN do

```ts
// tests/e2e/visual.spec.ts
import { test, expect } from '@playwright/test'

test('button has correct computed styles', async ({ page }) => {
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Submit' })
  
  // Real computed styles
  await expect(button).toHaveCSS('background-color', 'rgb(0, 123, 255)')
  await expect(button).toHaveCSS('border-radius', '4px')
  await expect(button).toHaveCSS('padding', '8px 16px')
})

test('element is visible in viewport', async ({ page }) => {
  await page.goto('/long-page')
  const footer = page.locator('footer')
  
  // Real layout
  await expect(footer).toBeInViewport()
  
  const box = await footer.boundingBox()
  expect(box.width).toBeGreaterThan(0)
  expect(box.height).toBeGreaterThan(0)
})

test('modal traps focus', async ({ page }) => {
  await page.goto('/')
  await page.click('[data-testid="open-modal"]')
  
  const modal = page.locator('[role="dialog"]')
  await expect(modal).toBeVisible()
  
  // Tab key navigation
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-testid="first-focusable"]')).toBeFocused()
})

test('drag and drop works', async ({ page }) => {
  await page.goto('/kanban')
  const item = page.locator('[data-testid="task-1"]')
  const target = page.locator('[data-testid="column-done"]')
  
  await item.dragTo(target)
  await expect(target.locator('[data-testid="task-1"]')).toBeVisible()
})

test('file upload works', async ({ page }) => {
  await page.goto('/upload')
  await page.setInputFiles('input[type="file"]', 'test.pdf')
  await expect(page.locator('text=test.pdf')).toBeVisible()
})
```

### Decision matrix

| Test need | Tool |
|-----------|------|
| Logic, state, events | Vitest + Vue Test Utils |
| Props/emits/slots | Vitest + Vue Test Utils |
| Computed styles | Playwright |
| Layout/positioning | Playwright |
| Real focus/keyboard | Playwright |
| Drag and drop | Playwright |
| File upload | Playwright |
| Cross-browser | Playwright |
| Visual regression | Playwright + pixelmatch |
| Performance metrics | Playwright + Lighthouse |
| CI speed | Vitest (much faster) |

### Hybrid approach (recommended)

```ts
// vitest.config.ts - unit/component tests
// playwright.config.ts - E2E/visual tests

// Component test (Vitest) - fast, logic-focused
// Counter.spec.ts
it('increments count', () => {
  const { count, increment } = useCounter()
  increment()
  expect(count.value).toBe(1)
})

// Visual test (Playwright) - slow, browser-focused
// Counter.e2e.spec.ts
test('counter displays correctly', async ({ page }) => {
  await page.goto('/counter')
  await expect(page.locator('[data-testid="count"]')).toHaveText('0')
  await page.click('[data-testid="increment"]')
  await expect(page.locator('[data-testid="count"]')).toHaveText('1')
  
  // Visual verification
  await expect(page.locator('[data-testid="count"]')).toHaveCSS('font-size', '24px')
})
```

### Running both in CI

```yaml
# .github/workflows/test.yml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:run  # Vitest
  
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e  # Playwright
```

### Visual regression with Playwright

```ts
test('button matches baseline', async ({ page }) => {
  await page.goto('/buttons')
  await expect(page.locator('.btn-primary')).toHaveScreenshot('btn-primary.png')
})

// Update baselines: npx playwright test --update-snapshots
```

### Summary

> **Default to Vitest.** Only reach for Playwright when you need real browser rendering, layout, or events that JSDOM cannot provide.