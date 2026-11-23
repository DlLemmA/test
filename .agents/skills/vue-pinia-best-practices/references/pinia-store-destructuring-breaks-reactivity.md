---
title: Store Destructuring Breaks Reactivity
impact: HIGH
impactDescription: Destructuring Pinia store properties loses reactivity - use storeToRefs instead
type: capability
tags: [pinia, reactivity, destructuring, storeToRefs]
---

# Store Destructuring Breaks Reactivity

## Problem

Destructuring a Pinia store directly breaks reactivity because it creates plain values disconnected from the store's reactive system.

## Solution

Use `storeToRefs` from Pinia to destructure while preserving reactivity.

### Incorrect - Direct destructuring

```vue
<script setup>
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// BAD - loses reactivity!
const { name, email, isLoggedIn } = userStore

// Template won't update when store changes
</script>

<template>
  <div>{{ name }}</div> <!-- Stale! -->
</template>
```

### Correct - Use storeToRefs

```vue
<script setup>
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'

const userStore = useUserStore()

// GOOD - preserves reactivity!
const { name, email, isLoggedIn } = storeToRefs(userStore)

// Actions don't need storeToRefs
const { login, logout } = userStore
</script>

<template>
  <div>{{ name }}</div> <!-- Reactive! -->
  <button @click="login(userData)">Login</button>
</template>
```

### What storeToRefs does

- Converts each property to a `ref` that stays connected to the store
- Works for `state`, `getters`, and `computed` properties
- **Don't** use for actions (methods) - they're already functions

### When you DON'T need storeToRefs

```vue
<script setup>
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// Fine - using store directly
<div>{{ userStore.name }}</div>

// Fine - calling actions
<button @click="userStore.login(data)">Login</button>

// Fine - destructuring actions only
const { login, logout } = userStore
</script>
```

### In templates with v-for

```vue
<script setup>
import { useProductStore } from '@/stores/product'
import { storeToRefs } from 'pinia'

const productStore = useProductStore()
const { products, loading } = storeToRefs(productStore)
</script>

<template>
  <div v-if="loading">Loading...</div>
  <ul>
    <li v-for="product in products" :key="product.id">
      {{ product.name }}
    </li>
  </ul>
</template>
```

### TypeScript note

```ts
import { useUserStore } from '@/stores/user'
import { storeToRefs } from 'pinia'

const userStore = useUserStore()
// Type inferred correctly
const { name, email, isLoggedIn } = storeToRefs(userStore)
// name: Ref<string>, email: Ref<string>, isLoggedIn: Ref<boolean>
```

### Summary

| Usage | Reactive? |
|-------|-----------|
| `store.name` | ✅ Yes |
| `const { name } = store` | ❌ No |
| `const { name } = storeToRefs(store)` | ✅ Yes |
| `const { action } = store` | ✅ Yes (functions) |