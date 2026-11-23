---
title: Navigation Guard Using Deprecated next() Function
impact: MEDIUM
impactDescription: Vue Router 4 deprecated the `next()` callback in favor of returning values
type: capability
tags: [vue-router, navigation-guards, next, deprecated, migration]
---

# Navigation Guard Using Deprecated next() Function

## Problem

Vue Router 4 deprecated the `next()` callback API in favor of returning values. Using `next()` still works but shows deprecation warnings.

## Solution

Migrate to the return-based API.

### Old API (Deprecated)

```js
router.beforeEach((to, from, next) => {
  if (isAuthenticated) {
    next()
  } else {
    next('/login')
  }
})

// Component guards
export default {
  beforeRouteEnter(to, from, next) {
    fetchData().then(data => {
      next(vm => { vm.data = data })
    })
  },
  beforeRouteUpdate(to, from, next) {
    this.fetchData().then(() => next())
  }
}
```

### New API (Vue Router 4+)

```js
// Global guards
router.beforeEach((to, from) => {
  if (isAuthenticated) {
    return true // Continue navigation
  }
  return '/login' // Redirect
})

// Or async
router.beforeEach(async (to, from) => {
  const user = await getUser()
  if (!user && to.path !== '/login') {
    return '/login'
  }
})

// Component guards (Options API)
export default {
  async beforeRouteEnter(to, from) {
    const data = await fetchData(to.params.id)
    return data // Passed to next(vm => ...) callback
  },
  
  async beforeRouteUpdate(to, from) {
    await this.fetchData(to.params.id)
    // Return nothing (or true) to continue
  }
}

// Component guards (Composition API)
<script setup>
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

onBeforeRouteLeave(async (to, from) => {
  await saveDraft()
  // Return nothing to continue
})

onBeforeRouteUpdate(async (to, from) => {
  await loadData(to.params.id)
})
</script>
```

### Return value types

| Return value | Behavior |
|--------------|----------|
| `undefined` / `true` | Continue navigation |
| `false` | Cancel navigation |
| `string` (path) | Redirect to path |
| `RouteLocationRaw` object | Redirect to route location |
| `Error` | Trigger navigation error |

### Migration tips

1. **Remove `next` parameter** from guard functions
2. **Return instead of calling `next()`**
3. **For `beforeRouteEnter` with callback**: Return the value you want to pass to the callback
4. **For async guards**: Just make the function `async` and `return` the result