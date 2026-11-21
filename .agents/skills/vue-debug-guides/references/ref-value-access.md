---
title: Ref Values Not Updating Due to Missing .value Access
impact: HIGH
impactDescription: Forgetting .value when reading/writing refs is the most common Vue 3 reactivity bug
type: capability
tags: [vue3, ref, reactivity, value, debugging]
---

# Ref Values Not Updating Due to Missing .value Access

## Problem

Refs require `.value` to access or modify their value. Forgetting it is the #1 Vue 3 bug.

## Symptoms

- "Value doesn't update" but no error
- Template shows old value
- Computed/watchers don't trigger

## Common Mistakes

```js
import { ref, computed, watch } from 'vue'

const count = ref(0)

function increment() {
  count++ // ❌ WRONG - modifies ref object, not value
  count.value++ // ✅ CORRECT
}

const doubled = computed(() => count * 2) // ❌ WRONG - uses ref object
const doubled = computed(() => count.value * 2) // ✅ CORRECT

watch(count, (newVal) => { // ✅ CORRECT - watch auto-unwraps
  console.log(newVal)
})
```

## In Templates (Auto-unwrapped)

```vue
<template>
  <div>{{ count }}</div>        <!-- ✅ Auto-unwrapped -->
  <input v-model="count" />     <!-- ✅ Auto-unwrapped -->
  <button @click="count++">     <!-- ✅ Auto-unwrapped -->
</template>
```

## Debugging Tips

```js
// 1. Log the ref itself to see if it's a RefImpl
console.log(count) // RefImpl { _value: 0, _rawValue: 0, ... }

// 2. Use Vue DevTools - shows .value in State panel

// 3. TypeScript catches missing .value
const count: Ref<number> = ref(0)
count++ // ❌ TypeScript error: Property 'value' missing
count.value++ // ✅ OK
```

## Quick Checklist

- [ ] In `<script setup>`: always use `.value`
- [ ] In templates: no `.value` needed
- [ ] In `computed` getters: use `.value`
- [ ] In `watch` sources: no `.value` needed (auto-unwraps)
- [ ] In `watchEffect`: use `.value` when reading