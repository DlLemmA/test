---
title: Building Production App Without DevTools or Conventions
impact: MEDIUM
impactDescription: Large Vue apps benefit from Pinia conventions for maintainability, DevTools, and team collaboration
type: best-practice
tags: [pinia, architecture, conventions, devtools, large-app, organization]
---

# Building Production App with Pinia Conventions

## Problem

Large apps without consistent Pinia patterns suffer from inconsistent store structures, poor DevTools experience, and difficult maintenance.

## Solution

Follow established conventions for store organization, naming, and structure.

### Store file organization

```
src/
├── stores/
│   ├── index.ts           # Barrel export
│   ├── auth.ts            # Authentication
│   ├── user.ts            # User profile
│   ├── cart.ts            # Shopping cart
│   ├── products/          # Feature-based folder
│   │   ├── index.ts
│   │   ├── catalog.ts
│   │   ├── search.ts
│   │   └── filters.ts
│   └── ui/                # UI state
│       ├── sidebar.ts
│       ├── modals.ts
│       └── toasts.ts
```

### Barrel export (stores/index.ts)

```ts
export { useAuthStore } from './auth'
export { useUserStore } from './user'
export { useCartStore } from './cart'
export * from './products'
export * from './ui'
```

### Consistent store structure

```ts
// stores/products/catalog.ts
import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { Product, ProductFilters } from '@/types/product'

export const useProductCatalogStore = defineStore('product-catalog', () => {
  // ─── State ───
  const items = shallowRef<Product[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const filters = ref<ProductFilters>({ category: '', sort: 'name' })
  const pagination = ref({ page: 1, pageSize: 20, total: 0 })
  
  // ─── Getters (computed) ───
  const filteredItems = computed(() => 
    items.value.filter(/* ... */)
  )
  
  const featuredItems = computed(() => 
    items.value.filter(p => p.featured)
  )
  
  // ─── Actions ───
  async function fetchProducts() {
    loading.value = true
    error.value = null
    try {
      const response = await api.getProducts(filters.value, pagination.value)
      items.value = response.data
      pagination.value.total = response.total
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }
  
  function setFilters(newFilters: Partial<ProductFilters>) {
    filters.value = { ...filters.value, ...newFilters }
    pagination.value.page = 1 // Reset page on filter change
  }
  
  function setPage(page: number) {
    pagination.value.page = page
  }
  
  function clearError() {
    error.value = null
  }
  
  // ─── Return ───
  return {
    // State
    items,
    loading,
    error,
    filters,
    pagination,
    // Getters
    filteredItems,
    featuredItems,
    // Actions
    fetchProducts,
    setFilters,
    setPage,
    clearError
  }
})
```

### Store naming conventions

| Pattern | Example |
|---------|---------|
| Feature + domain | `useProductCatalogStore` |
| Domain + feature | `useAuthStore` |
| UI component | `useSidebarStore` |
| Cross-cutting | `useNotificationStore` |

### TypeScript: Typed store composition

```ts
// types/stores.ts
import type { StoreDefinition } from 'pinia'

export interface StoreMap {
  auth: StoreDefinition<'auth', AuthState, AuthGetters, AuthActions>
  user: StoreDefinition<'user', UserState, UserGetters, UserActions>
  cart: StoreDefinition<'cart', CartState, CartGetters, CartActions>
}

// Usage in components
import type { StoreMap } from '@/types/stores'

function useStores<K extends keyof StoreMap>(...keys: K[]) {
  // Type-safe store access
}
```

### DevTools optimization

```ts
// Use $id for clear DevTools labeling
export const useProductStore = defineStore('product', () => {
  // ...
}, {
  // Optional: customize DevTools display
  // persist: true // with pinia-plugin-persistedstate
})
```

### Modular store registration (for code splitting)

```ts
// stores/products/index.ts
import { defineStore } from 'pinia'

export const useProductCatalogStore = defineStore('product-catalog', () => {
  // ...
})

export const useProductSearchStore = defineStore('product-search', () => {
  // ...
})

// Lazy load feature stores
export async function loadProductStores() {
  await Promise.all([
    import('./catalog'),
    import('./search'),
    import('./filters')
  ])
}
```

### Testing conventions

```ts
// tests/utils/pinia.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, vi } from 'vitest'

export function createTestingPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

export function resetStores() {
  // Reset all stores to initial state
  // Use store.$reset() if available
}
```

### Production checklist

- [ ] Consistent store structure (state → getters → actions → return)
- [ ] All state returned from setup stores
- [ ] Use `shallowRef` for large arrays/objects
- [ ] TypeScript types for all stores
- [ ] Barrel exports for clean imports
- [ ] Feature-based folder organization
- [ ] DevTools-friendly store names (`defineStore('feature-name', ...)`)
- [ ] Pinia plugins for persistence/URL sync if needed
- [ ] Testing utilities for store reset
- [ ] SSR hydration handled correctly