---
title: "getActivePinia was called with no active Pinia" Error
impact: HIGH
impactDescription: Pinia requires an active Pinia instance before stores can be used
type: capability
tags: [pinia, setup, error, active-pinia, initialization]
---

# "getActivePinia was called with no active Pinia" Error

## Problem

This error occurs when trying to use a Pinia store before the Pinia instance is installed on the app.

## Solution

Ensure Pinia is installed **before** any store is used.

### Correct setup order (main.ts)

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia) // ← Must be before mount
app.mount('#app')
```

### Common causes

**1. Using store outside setup()**

```ts
// BAD - store used at module level
import { useUserStore } from '@/stores/user'
const userStore = useUserStore() // Error! No active Pinia yet

export function someFunction() {
  return userStore.name
}
```

```ts
// GOOD - use store inside function/component
import { useUserStore } from '@/stores/user'

export function someFunction() {
  const userStore = useUserStore() // OK - called after Pinia installed
  return userStore.name
}
```

**2. Using store in router guards before Pinia installed**

```ts
// router/index.ts - BAD
import { createRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth' // Error!

const router = createRouter({...})

router.beforeEach(() => {
  const auth = useAuthStore() // Pinia not ready yet
})
```

```ts
// router/index.ts - GOOD
import { createRouter } from 'vue-router'

const router = createRouter({...})

router.beforeEach(() => {
  // Import inside guard - Pinia will be ready by then
  const { useAuthStore } = await import('@/stores/auth')
  const auth = useAuthStore()
})
```

**3. Using store in composables at module level**

```ts
// BAD
import { useCartStore } from '@/stores/cart'
const cart = useCartStore() // Module level - too early!

export function useCartTotal() {
  return computed(() => cart.total)
}
```

```ts
// GOOD
import { useCartStore } from '@/stores/cart'

export function useCartTotal() {
  const cart = useCartStore() // Called when composable is used
  return computed(() => cart.total)
}
```

**4. Testing without Pinia**

```ts
// test.spec.ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Component from './Component.vue'

describe('Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia()) // Create fresh Pinia for each test
  })
  
  it('works', () => {
    const wrapper = mount(Component)
    // ...
  })
})
```

### SSR with Nuxt

```ts
// plugins/pinia.ts (Nuxt 3)
import { createPinia } from 'pinia'

export default defineNuxtPlugin((nuxtApp) => {
  const pinia = createPinia()
  nuxtApp.vueApp.use(pinia)
})
```