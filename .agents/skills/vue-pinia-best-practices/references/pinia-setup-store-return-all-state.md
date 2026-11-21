---
title: Setup Stores Missing State in DevTools or SSR
impact: HIGH
impactDescription: Pinia setup stores must return all state properties for DevTools and SSR serialization
type: capability
tags: [pinia, setup-store, devtools, ssr, return-state]
---

# Setup Stores Missing State in DevTools or SSR

## Problem

Pinia setup stores (using `defineStore` with setup function) must **return** all state properties that should be tracked, serialized, or visible in DevTools. Properties not returned are invisible to DevTools and won't be serialized for SSR.

## Solution

Always return all reactive state from setup stores.

### Incorrect - Missing returns

```ts
// BAD - state not returned
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  const name = ref('') // Not returned!
  const email = ref('')
  const isLoggedIn = computed(() => !!name.value)
  
  function login(user) {
    name.value = user.name
    email.value = user.email
  }
  
  return { login } // Missing name, email, isLoggedIn
})
```

### Correct - Return all state

```ts
// GOOD - all state returned
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  const name = ref('')
  const email = ref('')
  const isLoggedIn = computed(() => !!name.value)
  
  function login(user) {
    name.value = user.name
    email.value = user.email
  }
  
  function logout() {
    name.value = ''
    email.value = ''
  }
  
  // Return ALL state and actions
  return { 
    name, 
    email, 
    isLoggedIn, 
    login, 
    logout 
  }
})
```

### Why this matters

| Feature | Requires return |
|---------|-----------------|
| DevTools inspection | ✅ Yes |
| SSR serialization | ✅ Yes |
| `store.$state` | ✅ Yes |
| `store.$patch()` | ✅ Yes |
| Time-travel debugging | ✅ Yes |
| Hydration | ✅ Yes |

### Pattern for large stores

```ts
// Organize with clear sections
export const useProductStore = defineStore('product', () => {
  // State
  const items = ref([])
  const filters = ref({ category: '', sort: 'name' })
  const loading = ref(false)
  const error = ref(null)
  
  // Computed
  const filteredItems = computed(() => 
    items.value
      .filter(item => !filters.value.category || item.category === filters.value.category)
      .sort((a, b) => a[filters.value.sort].localeCompare(b[filters.value.sort]))
  )
  
  // Actions
  async function fetchProducts() {
    loading.value = true
    error.value = null
    try {
      items.value = await api.getProducts()
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }
  
  function setCategory(category) {
    filters.value.category = category
  }
  
  // Return everything - use object spread for clarity
  return {
    // State
    items,
    filters,
    loading,
    error,
    // Computed
    filteredItems,
    // Actions
    fetchProducts,
    setCategory
  }
})
```

### Option API stores (automatic)

Option API stores don't have this issue - all properties in `state()`, `getters`, `actions` are automatically tracked:

```ts
// Option API - no return needed
export const useUserStore = defineStore('user', {
  state: () => ({
    name: '',
    email: ''
  }),
  getters: {
    isLoggedIn: (state) => !!state.name
  },
  actions: {
    login(user) {
      this.name = user.name
      this.email = user.email
    }
  }
})
```