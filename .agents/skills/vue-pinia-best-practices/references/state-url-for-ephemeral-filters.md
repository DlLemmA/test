---
title: Filters Reset on Refresh or Can't Be Shared
impact: MEDIUM
impactDescription: Ephemeral UI state (filters, sorting, pagination) should sync to URL for persistence and shareability
type: best-practice
tags: [pinia, state, url, filters, pagination, shareable]
---

# Filters Reset on Refresh or Can't Be Shared

## Problem

Filter, sort, and pagination state stored only in Pinia resets on page refresh and can't be shared via URL.

## Solution

Sync ephemeral UI state to the URL using `useRoute` and `useRouter`, or use a composable that handles this.

### Basic pattern with watchers

```vue
<script setup>
import { useRoute, useRouter } from 'vue-router'
import { watch, computed } from 'vue'
import { useProductStore } from '@/stores/product'

const route = useRoute()
const router = useRouter()
const store = useProductStore()

// Initialize store from URL on mount
onMounted(() => {
  store.filters.category = route.query.category || ''
  store.filters.sort = route.query.sort || 'name'
  store.pagination.page = Number(route.query.page) || 1
})

// Sync store to URL when it changes
watch(() => store.filters.category, (val) => {
  router.replace({ query: { ...route.query, category: val || undefined } })
})

watch(() => store.filters.sort, (val) => {
  router.replace({ query: { ...route.query, sort: val || undefined } })
})

watch(() => store.pagination.page, (val) => {
  router.replace({ query: { ...route.query, page: val > 1 ? val : undefined } })
})
</script>
```

### Reusable composable

```ts
// useUrlSync.ts
import { useRoute, useRouter } from 'vue-router'
import { watch, ref, type Ref } from 'vue'

export function useUrlSync<T extends Record<string, any>>(
  storeState: T,
  options: { 
    keys: (keyof T)[]
    replace?: boolean 
  } = { keys: [], replace: true }
) {
  const route = useRoute()
  const router = useRouter()
  
  // Initialize from URL
  for (const key of options.keys) {
    const queryVal = route.query[key as string]
    if (queryVal !== undefined) {
      storeState[key] = queryVal as any
    }
  }
  
  // Sync to URL
  for (const key of options.keys) {
    watch(
      () => storeState[key],
      (val) => {
        const query = { ...route.query }
        if (val === '' || val === null || val === undefined) {
          delete query[key as string]
        } else {
          query[key as string] = String(val)
        }
        router[options.replace ? 'replace' : 'push']({ query })
      }
    )
  }
}
```

```vue
<!-- Usage -->
<script setup>
import { useProductStore } from '@/stores/product'
import { useUrlSync } from '@/composables/useUrlSync'

const store = useProductStore()

useUrlSync(store.filters, { keys: ['category', 'sort'] })
useUrlSync(store.pagination, { keys: ['page'] })
</script>
```

### With Pinia plugins (for multiple stores)

```ts
// pinia-url-plugin.ts
import { MutationType } from 'pinia'

export function piniaUrlPlugin({ store, options }) {
  if (!options?.syncToUrl) return
  
  const route = useRoute()
  const router = useRouter()
  
  // Initial sync
  for (const key of options.syncToUrl) {
    if (route.query[key]) {
      store[key] = route.query[key]
    }
  }
  
  // Watch mutations
  store.$subscribe((mutation) => {
    if (options.syncToUrl.includes(mutation.events[0].key as string)) {
      const query = { ...route.query }
      const val = store[mutation.events[0].key]
      if (val === '' || val === null) {
        delete query[mutation.events[0].key]
      } else {
        query[mutation.events[0].key] = String(val)
      }
      router.replace({ query })
    }
  }, { detached: true })
}
```

```ts
// main.ts
import { createPinia } from 'pinia'
import { piniaUrlPlugin } from './pinia-url-plugin'

const pinia = createPinia()
pinia.use(piniaUrlPlugin)
```

```ts
// Store with plugin options
export const useProductStore = defineStore('product', {
  state: () => ({
    filters: { category: '', sort: 'name' },
    pagination: { page: 1, pageSize: 20 }
  }),
  _pinia: { // plugin options
    syncToUrl: ['filters.category', 'filters.sort', 'pagination.page']
  }
})
```

### Benefits

| Feature | With URL sync |
|---------|---------------|
| Page refresh | ✅ State preserved |
| Share link | ✅ Others see same view |
| Browser back/forward | ✅ Works naturally |
| Bookmark | ✅ Saves filter state |
| SSR | ✅ Initial state from URL |