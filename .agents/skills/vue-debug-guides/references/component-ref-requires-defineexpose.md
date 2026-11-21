---
title: Parent Can't Access Child Ref Data in script setup
impact: HIGH
impactDescription: script setup components are closed by default - must use defineExpose
type: capability
tags: [vue3, script-setup, defineExpose, template-ref, parent-child]
---

# Parent Can't Access Child Ref Data in script setup

## Problem

Components using `<script setup>` are closed by default. Parent refs get `null` or empty object.

## Solution

Use `defineExpose` to explicitly expose properties/methods.

### Child Component

```vue
<!-- Child.vue -->
<script setup>
import { ref } from 'vue'

const count = ref(0)
const internal = 'hidden'

function increment() {
  count.value++
}

// Must explicitly expose!
defineExpose({
  count,
  increment
  // internal NOT exposed
})
</script>

<template>
  <div>{{ count }}</div>
</template>
```

### Parent Component

```vue
<!-- Parent.vue -->
<script setup>
import { ref, onMounted } from 'vue'
import Child from './Child.vue'

const childRef = ref(null)

onMounted(() => {
  console.log(childRef.value.count)     // ✅ 0
  console.log(childRef.value.internal)  // ❌ undefined
  childRef.value.increment()            // ✅ Works!
})
</script>

<template>
  <Child ref="childRef" />
</template>
```

### TypeScript Typing

```vue
<!-- Parent.vue -->
<script setup lang="ts">
import { ref, onMounted, useTemplateRef } from 'vue'
import Child from './Child.vue'

// Vue 3.5+
const childRef = useTemplateRef<{ count: number; increment: () => void }>('childRef')

// Before 3.5
// import type { ComponentPublicInstance } from 'vue'
// const childRef = ref<ComponentPublicInstance<{ count: number; increment: () => void }> | null>(null)

onMounted(() => {
  childRef.value?.increment()
})
</script>

<template>
  <Child ref="childRef" />
</template>
```

### Common Mistake: Forgetting defineExpose

```vue
<!-- Child.vue - WRONG -->
<script setup>
const count = ref(0)
</script>

<!-- Parent.vue -->
<script setup>
const childRef = ref(null)
onMounted(() => {
  console.log(childRef.value.count) // undefined! Component is closed.
})
</script>
```

### Exposing Everything (Not Recommended)

```vue
<script setup>
import { ref } from 'vue'

const count = ref(0)
const name = ref('Alice')

// Exposes all top-level bindings
defineExpose()
// Or explicitly:
defineExpose({ count, name })
</script>
```

### With TypeScript Interface

```ts
// types/child.ts
export interface ChildExpose {
  count: number
  increment: () => void
  reset: () => void
}
```

```vue
<!-- Child.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import type { ChildExpose } from '@/types/child'

const count = ref(0)

function increment() { count.value++ }
function reset() { count.value = 0 }

defineExpose<ChildExpose>({
  count,
  increment,
  reset
})
</script>
```