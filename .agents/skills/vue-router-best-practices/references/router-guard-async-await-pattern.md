---
title: Navigation Guard Making API Calls Without Awaiting
impact: HIGH
impactDescription: Navigation guards must await async operations or they complete before the API call finishes
type: capability
tags: [vue-router, navigation-guards, async, await, api-calls]
---

# Navigation Guard Making API Calls Without Awaiting

## Problem

Navigation guards with async operations must `await` them, otherwise navigation completes before the API call finishes, leading to race conditions and stale data.

## Solution

Always `await` async operations in navigation guards.

### Before (Broken)

```js
router.beforeEach((to, from, next) => {
  fetchUserData() // Missing await!
  next()
})
```

### After (Fixed)

```js
router.beforeEach(async (to, from, next) => {
  await fetchUserData() // Properly awaited
  next()
})
```

### Using return instead of next (Vue Router 4+)

```js
router.beforeEach(async (to, from) => {
  await fetchUserData()
  // No next() needed - return true or nothing to continue
  // Return false or a route location to redirect
})
```

### In component guards

```js
export default {
  async beforeRouteEnter(to, from, next) {
    const data = await fetchData(to.params.id)
    next(vm => {
      vm.data = data
    })
  },
  
  async beforeRouteUpdate(to, from, next) {
    this.data = await fetchData(to.params.id)
    next()
  }
}
```

### Composition API

```vue
<script setup>
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

onBeforeRouteLeave(async (to, from, next) => {
  await saveDraft()
  next()
})

onBeforeRouteUpdate(async (to, from, next) => {
  await loadData(to.params.id)
  next()
})
</script>
```