---
title: Async Operations Overwriting with Stale Data
impact: HIGH
impactDescription: Rapid watcher triggers cause race conditions - use onCleanup to cancel previous async work
type: capability
tags: [vue3, watch, async, cleanup, abortcontroller, race-condition]
---

# Async Operations Overwriting with Stale Data

## Problem

Rapid changes trigger multiple async operations that complete out of order, showing stale data.

## The Issue

```js
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q) => {
  const data = await fetch(`/api/search?q=${q}`)
  results.value = data // ❌ Stale request may overwrite newer results
})
```

## Solution: Use onCleanup with AbortController

```js
import { ref, watch } from 'vue'

const query = ref('')
const results = ref([])

watch(query, async (q, _prev, onCleanup) => {
  const controller = new AbortController()
  
  // Cancel previous request on next trigger
  onCleanup(() => controller.abort())
  
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal
    })
    const data = await res.json()
    results.value = data
  } catch (e) {
    if (e.name !== 'AbortError') throw e // Ignore abort errors
  }
})
```

## Alternative: Debounce the source

```js
import { ref, watch, debounce } from 'vue'

const query = ref('')
const debouncedQuery = debounce(query, 300)

watch(debouncedQuery, async (q) => {
  const data = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
  results.value = data
})
```

## watchEffect Version

```js
import { ref, watchEffect } from 'vue'

const query = ref('')
const results = ref([])

watchEffect(async (onCleanup) => {
  const q = query.value
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
    signal: controller.signal
  })
  results.value = await res.json()
})
```

## Key Points

- `onCleanup` runs before next effect execution
- `AbortController` cancels fetch requests
- Always check for `AbortError` in catch block
- Works with any cancellable async operation