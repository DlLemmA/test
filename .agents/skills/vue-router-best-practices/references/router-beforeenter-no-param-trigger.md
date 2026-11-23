---
title: Navigation Between Same Route with Different Params
impact: HIGH
impactDescription: Vue Router's beforeEnter guards don't trigger when navigating between the same route with different params
type: capability
tags: [vue-router, navigation-guards, params, beforeEnter]
---

# Navigation Between Same Route with Different Params

## Problem

When navigating between the same route with different params (e.g., `/user/1` → `/user/2`), the `beforeEnter` guard does **not** fire because Vue Router considers it the same route.

## Solution

Use `beforeRouteUpdate` guard inside the component or watch the route params.

### Option 1: Use `beforeRouteUpdate` guard (Options API)

```js
export default {
  beforeRouteUpdate(to, from, next) {
    // React to param changes
    this.fetchUser(to.params.id)
    next()
  }
}
```

### Option 2: Use `watch` on route params (Composition API)

```vue
<script setup>
import { watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

watch(() => route.params.id, (newId) => {
  fetchUser(newId)
}, { immediate: true })
</script>
```

### Option 3: Use `key` on router-view to force remount

```vue
<router-view :key="route.fullPath" />
```

This forces the component to remount on every navigation, triggering all lifecycle hooks.