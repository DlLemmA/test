---
title: Stale Data When Navigating Between Same Route
impact: HIGH
impactDescription: Vue Router doesn't remount components when navigating between same route with different params, causing stale data
type: capability
tags: [vue-router, params, lifecycle, stale-data, component-reuse]
---

# Stale Data When Navigating Between Same Route

## Problem

When navigating between the same route with different params (e.g., `/user/1` → `/user/2`), Vue Router reuses the component instance. Standard lifecycle hooks (`onMounted`, `onCreated`) don't fire again, causing stale data.

## Solution

### Option 1: Watch route params (Composition API)

```vue
<script setup>
import { watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const userData = ref(null)

const fetchUser = async (id) => {
  userData.value = await api.getUser(id)
}

watch(() => route.params.id, (newId) => {
  fetchUser(newId)
}, { immediate: true })
</script>
```

### Option 2: Use `onBeforeRouteUpdate` (Composition API)

```vue
<script setup>
import { onBeforeRouteUpdate } from 'vue-router'
import { useRoute } from 'vue-router'

const route = useRoute()
const userData = ref(null)

const fetchUser = async (id) => {
  userData.value = await api.getUser(id)
}

onBeforeRouteUpdate(async (to, from) => {
  await fetchUser(to.params.id)
})

// Also fetch on initial load
onMounted(() => fetchUser(route.params.id))
</script>
```

### Option 3: Force remount with `key` on router-view

```vue
<template>
  <router-view :key="route.fullPath" />
</template>

<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>
```

This forces a full remount on every navigation, triggering all lifecycle hooks.

### Option 4: Options API - `beforeRouteUpdate`

```js
export default {
  data() {
    return { userData: null }
  },
  async beforeRouteEnter(to, from, next) {
    const data = await api.getUser(to.params.id)
    next(vm => { vm.userData = data })
  },
  async beforeRouteUpdate(to, from, next) {
    this.userData = await api.getUser(to.params.id)
    next()
  }
}
```

## When to use each

| Approach | Use case |
|----------|----------|
| Watch params | Simple data fetching, want to keep component state |
| `onBeforeRouteUpdate` | Need to do cleanup or await before loading new data |
| `:key="route.fullPath"` | Want full reset, simple but loses all component state |
| Options API guards | Legacy codebase using Options API |