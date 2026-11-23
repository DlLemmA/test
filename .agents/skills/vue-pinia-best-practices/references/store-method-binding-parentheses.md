---
title: Store Methods Lose Context in Template Calls
impact: MEDIUM
impactDescription: Calling store methods in templates without parentheses can lose `this` context
type: capability
tags: [pinia, methods, template, this-context, binding]
---

# Store Methods Lose Context in Template Calls

## Problem

When calling Pinia store methods in templates, using the method reference without calling it (or with incorrect binding) can lose the `this` context.

## Solution

Always call methods with parentheses in templates, or use arrow functions in the store.

### The issue

```ts
// Store
export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 0 }),
  actions: {
    increment() {
      this.count++ // `this` must point to store
    }
  }
})
```

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'
const store = useCounterStore()
</script>

<template>
  <!-- BAD - passes function reference, loses `this` -->
  <button @click="store.increment">Increment</button>
  
  <!-- BAD - same issue -->
  <button @click="store.increment()">Increment</button>
</template>
```

Wait - actually in Vue 3 with Pinia, both of these work because Pinia binds actions. Let me clarify the actual issue:

### Real issue: Extracting method to variable

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'
const store = useCounterStore()

// BAD - extracts method, loses binding
const increment = store.increment
</script>

<template>
  <button @click="increment">Increment</button> <!-- `this` is undefined! -->
</template>
```

### Solutions

**1. Call directly in template (recommended)**

```vue
<template>
  <button @click="store.increment()">Increment</button>
  <button @click="store.incrementBy(5)">Increment by 5</button>
</template>
```

**2. Use arrow function wrapper**

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'
const store = useCounterStore()

// GOOD - arrow function preserves call context
const increment = () => store.increment()
const incrementBy5 = () => store.incrementBy(5)
</script>

<template>
  <button @click="increment">Increment</button>
  <button @click="incrementBy5">Increment by 5</button>
</template>
```

**3. Use storeToRefs for state, call actions directly**

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'
import { storeToRefs } from 'pinia'

const store = useCounterStore()
const { count } = storeToRefs(store)
</script>

<template>
  <div>Count: {{ count }}</div>
  <button @click="store.increment()">Increment</button>
</template>
```

### Setup stores with arrow functions (auto-bound)

```ts
// Setup store - actions are auto-bound!
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  
  // Arrow function - `this` not needed
  const increment = () => {
    count.value++
  }
  
  const incrementBy = (amount: number) => {
    count.value += amount
  }
  
  return { count, increment, incrementBy }
})
```

In setup stores, methods are just functions - no `this` context issues.

### Summary

| Pattern | Works? |
|---------|--------|
| `@click="store.increment()"` | ✅ Yes |
| `@click="store.increment"` | ✅ Yes (Vue auto-calls) |
| `const fn = store.increment; @click="fn"` | ❌ No (loses binding) |
| `const fn = () => store.increment(); @click="fn"` | ✅ Yes |
| Setup store actions | ✅ Always work |