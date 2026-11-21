---
title: "Injection Symbol(pinia) not found" Errors in Tests
impact: HIGH
impactDescription: Pinia stores require an active Pinia instance in tests
type: capability
tags: [testing, pinia, injection, setup, active-pinia]
---

# "Injection Symbol(pinia) not found" Errors in Tests

## Problem

Pinia stores throw "injection Symbol(pinia) not found" when used in tests without a Pinia instance installed.

## Solution

Create and activate a Pinia instance before each test.

### Basic setup

```ts
// tests/setup.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach } from 'vitest'

beforeEach(() => {
  setActivePinia(createPinia())
})
```

### With Vue Test Utils mount

```ts
// Option 1: Global setup (in vitest.config.ts setupFiles)
import { createPinia } from 'pinia'
import { config } from '@vue/test-utils'

config.global.plugins = [createPinia()]
```

```ts
// Option 2: Per-test setup
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import Component from '@/components/Component.vue'

it('uses store', () => {
  const pinia = createPinia()
  const wrapper = mount(Component, {
    global: { plugins: [pinia] }
  })
  
  const store = useUserStore()
  expect(store.name).toBe('')
})
```

### Testing stores directly

```ts
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
  
  it('removes items', () => {
    const cart = useCartStore()
    cart.addItem({ id: 1, name: 'Widget', price: 10 })
    cart.removeItem(1)
    
    expect(cart.items).toHaveLength(0)
    expect(cart.total).toBe(0)
  })
})
```

### Testing components with stores

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, it, expect } from 'vitest'
import CartWidget from '@/components/CartWidget.vue'
import { useCartStore } from '@/stores/cart'

describe('CartWidget', () => {
  let pinia
  
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })
  
  it('shows cart total', () => {
    const store = useCartStore()
    store.addItem({ id: 1, price: 25 })
    store.addItem({ id: 2, price: 15 })
    
    const wrapper = mount(CartWidget, {
      global: { plugins: [pinia] }
    })
    
    expect(wrapper.text()).toContain('40')
  })
  
  it('calls store action on button click', async () => {
    const wrapper = mount(CartWidget, {
      global: { plugins: [pinia] }
    })
    
    await wrapper.get('button').trigger('click')
    
    const store = useCartStore()
    expect(store.checkout).toHaveBeenCalled()
  })
})
```

### Testing with store state initialization

```ts
it('initializes with prefilled state', () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  
  const store = useCartStore()
  // Directly set state for testing
  store.$state.items = [{ id: 1, price: 10, quantity: 2 }]
  
  const wrapper = mount(CartWidget, {
    global: { plugins: [pinia] }
  })
  
  expect(wrapper.text()).toContain('20')
})
```

### Testing store plugins (persistedstate, etc.)

```ts
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const createTestingPinia = () => {
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  return pinia
}

// In test
const pinia = createTestingPinia()
const wrapper = mount(Component, {
  global: { plugins: [pinia] }
})
```

### Common mistakes

```ts
// BAD - creating Pinia inside component mount
mount(Component, {
  global: { plugins: [createPinia()] } // New instance each mount!
})

// GOOD - reuse same Pinia instance
const pinia = createPinia()
mount(Component, { global: { plugins: [pinia] } })
mount(OtherComponent, { global: { plugins: [pinia] } })
```

```ts
// BAD - not setting active Pinia for direct store use
import { useStore } from '@/stores/store'
const store = useStore() // Error! No active Pinia

// GOOD
setActivePinia(createPinia())
const store = useStore() // Works
```

### Reset stores between tests

```ts
// tests/setup.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach } from 'vitest'

let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  // Optional: reset all stores
  for (const store of pinia._s.values()) {
    store.$reset?.()
  }
})
```