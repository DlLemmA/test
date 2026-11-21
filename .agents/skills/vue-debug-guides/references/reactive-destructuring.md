---
title: State Stops Updating After Destructuring Reactive Objects
impact: HIGH
impactDescription: Destructuring reactive objects breaks reactivity - use toRefs or computed
type: capability
tags: [vue3, reactive, destructuring, toRefs, reactivity]
---

# State Stops Updating After Destructuring Reactive Objects

## Problem

Destructuring a `reactive` object creates plain variables that lose reactivity.

## The Issue

```js
import { reactive } from 'vue'

const state = reactive({ count: 0, name: 'Alice' })

const { count, name } = state // ❌ Loses reactivity!
count++ // Doesn't trigger updates
```

## Solutions

### 1. Use `toRefs` (recommended)

```js
import { reactive, toRefs } from 'vue'

const state = reactive({ count: 0, name: 'Alice' })
const { count, name } = toRefs(state) // ✅ Reactive refs

count.value++ // Triggers updates
```

### 2. Use computed for derived values

```js
import { reactive, computed } from 'vue'

const state = reactive({ count: 0, name: 'Alice' })
const count = computed(() => state.count) // ✅ Reactive
```

### 3. Use refs directly instead of reactive

```js
import { ref } from 'vue'

const count = ref(0)
const name = ref('Alice')

// No destructuring issues
```

### 4. Vue 3.5+: Reactive props destructure

```vue
<script setup lang="ts">
// Vue 3.5+ - destructured props stay reactive!
const { count, name } = defineProps<{ count: number; name: string }>()

// In setup() - use toRefs for reactive objects
const state = reactive({ count: 0, name: 'Alice' })
const { count, name } = toRefs(state)
</script>
```

## In Templates

```vue
<!-- GOOD - use state.property -->
<div>{{ state.count }}</div>

<!-- GOOD - with toRefs -->
<script setup>
const { count } = toRefs(state)
</script>
<div>{{ count }}</div>
```

## Debugging

```js
// Check if it's a ref
import { isRef } from 'vue'
console.log(isRef(count)) // true if reactive

// Vue DevTools shows reactive objects with proxy icon
```