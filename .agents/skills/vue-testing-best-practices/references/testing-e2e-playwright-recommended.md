---
title: Choosing End-to-End Testing Framework for Vue Apps
impact: MEDIUM
impactDescription: Playwright is the recommended E2E testing framework for modern Vue applications
type: best-practice
tags: [testing, e2e, playwright, cypress, vue]
---

# Choosing End-to-End Testing Framework for Vue Apps

## Recommendation: Playwright

Playwright is the recommended E2E testing framework for Vue 3 apps due to:
- Native multi-browser support (Chromium, Firefox, WebKit)
- Auto-waiting for elements
- Built-in test runner with parallelization
- Excellent debugging tools (trace viewer, UI mode)
- Network interception and mocking
- Mobile emulation

## Quick Start

```bash
npm init playwright@latest
# Select: TypeScript, tests folder, add GitHub Actions
```

## Basic Configuration (playwright.config.ts)

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } }
  ],
  
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
```

## Basic Test

```ts
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })
  
  test('logs in successfully', async ({ page }) => {
    await page.fill('[name="email"]', 'user@example.com')
    await page.fill('[name="password"]', 'password123')
    await page.click('button[type="submit"]')
    
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('text=Welcome')).toBeVisible()
  })
  
  test('shows error for invalid credentials', async ({ page }) => {
    await page.fill('[name="email"]', 'wrong@example.com')
    await page.fill('[name="password"]', 'wrong')
    await page.click('button[type="submit"]')
    
    await expect(page.locator('[role="alert"]')).toContainText('Invalid')
  })
})
```

## Vue-Specific Patterns

### Testing with data-testid (recommended)

```vue
<!-- Component.vue -->
<template>
  <button data-testid="submit-btn" @click="submit">
    Submit
  </button>
</template>
```

```ts
// Test
await page.click('[data-testid="submit-btn"]')
```

### Testing Vue Router navigation

```ts
test('navigates via router links', async ({ page }) => {
  await page.goto('/')
  
  await page.click('[data-testid="nav-about"]')
  await expect(page).toHaveURL('/about')
  
  await page.click('[data-testid="nav-contact"]')
  await expect(page).toHaveURL('/contact')
})
```

### Testing Pinia state persistence

```ts
test('cart persists across navigation', async ({ page }) => {
  await page.goto('/products')
  await page.click('[data-testid="add-to-cart-1"]')
  
  await page.goto('/cart')
  await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1)
  
  await page.goto('/products')
  await page.goto('/cart')
  await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1)
})
```

### Testing component interactions

```ts
test('modal opens and closes', async ({ page }) => {
  await page.goto('/dashboard')
  
  await page.click('[data-testid="open-modal"]')
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  
  await page.click('[data-testid="close-modal"]')
  await expect(page.locator('[role="dialog"]')).toBeHidden()
})
```

## Page Object Model

```ts
// tests/e2e/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}
  
  async goto() {
    await this.page.goto('/login')
  }
  
  async login(email: string, password: string) {
    await this.page.fill('[name="email"]', email)
    await this.page.fill('[name="password"]', password)
    await this.page.click('button[type="submit"]')
  }
  
  async expectError(message: string) {
    await expect(this.page.locator('[role="alert"]')).toContainText(message)
  }
}
```

```ts
// Usage
test('login flow', async ({ page }) => {
  const login = new LoginPage(page)
  await login.goto()
  await login.login('user@example.com', 'password')
  await expect(page).toHaveURL('/dashboard')
})
```

## Debugging Tools

```bash
# Run with UI mode
npx playwright test --ui

# Debug specific test
npx playwright test --debug auth.spec.ts

# View trace after failure
npx playwright show-trace trace.zip

# Generate code from actions
npx playwright codegen http://localhost:5173
```

## CI Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Playwright vs Cypress

| Feature | Playwright | Cypress |
|---------|------------|---------|
| Multi-browser | ✅ Native | ⚠️ Limited |
| Parallel tests | ✅ Built-in | ✅ Paid |
| Network mocking | ✅ Full | ✅ Full |
| Iframe support | ✅ Native | ⚠️ Limited |
| Mobile testing | ✅ Native | ⚠️ Limited |
| TypeScript | ✅ First-class | ✅ Good |
| Debugging | ✅ Trace viewer | ✅ Time-travel |

## When to use E2E vs Unit

| Test type | Use for |
|-----------|---------|
| Unit (Vitest) | Logic, composables, utils, pure components |
| Component (Vitest + VTU) | Component behavior, props, events, slots |
| E2E (Playwright) | User flows, cross-page, auth, payments, integrations |