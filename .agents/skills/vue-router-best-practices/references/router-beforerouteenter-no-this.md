---
title: Accessing Component Instance in beforeRouteEnter Guard
impact: HIGH
impactDescription: Cannot access `this` in beforeRouteEnter because component isn't created yet
type: capability
tags: [vue-router, navigation-guards, beforeRouteEnter, this-context]
---

# Accessing Component Instance in beforeRouteEnter Guard

## Problem

In `beforeRouteEnter`, the component instance hasn't been created yet, so `this` is unavailable.

## Solution

Use the `next(vm => {})` callback to access the component instance after it's created.

### Options API

```js
export default {
  beforeRouteEnter(to, from, next) {
    next(vm => {
      // `vm` is the component instance
      vm.fetchData()
    })
  }
}
```

### Composition API (not directly applicable)

With Composition API, prefer using `watch` on route params or `onBeforeRouteUpdate` instead:

```vue
<script setup>
import { onBeforeRouteUpdate } from 'vue-router'
import { useRoute } from 'vue-router'

const route = useRoute()

onBeforeRouteUpdate((to, from, next) => {
  // Access reactive state directly
  fetchData(to.params.id)
  next()
})

// Or watch route params
watch(() => route.params.id, (newId) => {
  fetchData(newId)
}, { immediate: true })
</script>
```