---
title: Setting Up Test Infrastructure for Vue 3 Projects
impact: HIGH
impactDescription: Vitest is the recommended test runner for Vue 3 projects with Vite
type: best-practice
tags: [testing, vitest, vue3, vite, setup, infrastructure]
---

# Setting Up Test Infrastructure for Vue 3 Projects

## Recommended Stack

- **Test Runner**: Vitest (native Vite integration)
- **Component Testing**: Vue Test Utils + @vue/test-utils
- **E2E Testing**: Playwright
- **Mocking**: vi (Vitest's built-in mocking)

## Installation

```bash
npm install -D vitest @vue/test-utils jsdom @vitest/coverage-v8
npm install -D playwright @playwright/test  # For E2E
```

## Vitest Config (vitest.config.ts)

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.{test,spec}.{js,ts,vue}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    },
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '@': '/src'
    }
  }
})
```

## Test Setup (tests/setup.ts)

```ts
import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// Global mocks
vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
  useRouter: vi.fn(),
  RouterLink: { template: '<a><slot /></a>' },
  RouterView: { template: '<slot />' }
}))

vi.mock('pinia', () => ({
  useStore: vi.fn(),
  storeToRefs: vi.fn((store) => store)
}))

// Vue Test Utils config
config.global.stubs = {
  'router-link': true,
  'router-view': true
}

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks()
})
```

## Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test"
  }
}
```

## Basic Component Test

```ts
// Component.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import Button from '@/components/Button.vue'

describe('Button.vue', () => {
  it('renders slot content', () => {
    const wrapper = mount(Button, {
      slots: { default: 'Click me' }
    })
    expect(wrapper.text()).toBe('Click me')
  })

  it('emits click event', async () => {
    const wrapper = mount(Button)
    await wrapper.trigger('click')
    expect(wrapper.emitted()).toHaveProperty('click')
  })

  it('applies variant classes', () => {
    const wrapper = mount(Button, {
      props: { variant: 'primary' }
    })
    expect(wrapper.classes()).toContain('btn-primary')
  })
})
```

## Testing Composables

```ts
// useCounter.spec.ts
import { describe, it, expect } from 'vitest'
import { useCounter } from '@/composables/useCounter'

describe('useCounter', () => {
  it('increments counter', () => {
    const { count, increment } = useCounter({ initial: 0 })
    expect(count.value).toBe(0)
    increment()
    expect(count.value).toBe(1)
  })

  it('respects min/max bounds', () => {
    const { count, increment, decrement } = useCounter({ 
      initial: 5, 
      min: 0, 
      max: 10 
    })
    
    for (let i = 0; i < 10; i++) increment()
    expect(count.value).toBe(10)
    
    for (let i = 0; i < 15; i++) decrement()
    expect(count.value).toBe(0)
  })
})
```

## Testing with Pinia

```ts
// stores/cart.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, it, expect } from 'vitest'
import { useCartStore } from '@/stores/cart'

describe('Cart Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds items', () => {
    const cart = useCartStore()
    cart.addItem({ id: 1, name: 'Widget', price: 10 })
    expect(cart.items).toHaveLength(1)
    expect(cart.total).toBe(10)
  })
})
```

## Key Vitest Features for Vue

| Feature | Usage |
|---------|-------|
| `vi.fn()` | Create mock functions |
| `vi.mock()` | Mock modules |
| `vi.spyOn()` | Spy on existing functions |
| `vi.useFakeTimers()` | Control time in tests |
| `expect().toHaveBeenCalledWith()` | Assert mock calls |
| `--ui` flag | Visual test runner |
| `--coverage` | Code coverage reports |