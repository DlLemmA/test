---
title: Event Listeners Persisting After Component Unmounts
impact: HIGH
impactDescription: Event listeners added in components must be cleaned up on unmount to prevent memory leaks and duplicate handlers
type: capability
tags: [vue-router, cleanup, event-listeners, memory-leaks, onUnmounted]
---

# Event Listeners Persisting After Component Unmounts

## Problem

Event listeners added in components (window, document, or custom events) persist after the component unmounts, causing memory leaks, duplicate handlers, and unexpected behavior when navigating back.

## Solution

Always clean up event listeners in `onUnmounted` or use composables that handle cleanup automatically.

### Basic cleanup pattern

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue'

let handler

onMounted(() => {
  handler = (event) => {
    console.log('Resize:', event)
  }
  window.addEventListener('resize', handler)
})

onUnmounted(() => {
  window.removeEventListener('resize', handler)
})
</script>
```

### Using a composable for automatic cleanup

```ts
// useEventListener.ts
import { onMounted, onUnmounted } from 'vue'

export function useEventListener(target, event, handler, options) {
  onMounted(() => {
    target.addEventListener(event, handler, options)
  })
  
  onUnmounted(() => {
    target.removeEventListener(event, handler, options)
  })
}
```

```vue
<script setup>
import { useEventListener } from './useEventListener'
import { useRoute } from 'vue-router'

const route = useRoute()

useEventListener(window, 'resize', () => {
  // Handle resize
})

useEventListener(document, 'keydown', (e) => {
  if (e.key === 'Escape') closeModal()
})

// Automatically cleaned up on unmount
</script>
```

### Cleanup for route-specific subscriptions

```vue
<script setup>
import { onBeforeRouteLeave, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
let unsubscribe

onMounted(() => {
  unsubscribe = subscribeToUser(route.params.id, (user) => {
    currentUser.value = user
  })
})

// Clean up when leaving this route (even if component stays alive)
onBeforeRouteLeave(() => {
  unsubscribe?.()
})

// Also clean up on full unmount
onUnmounted(() => {
  unsubscribe?.()
})
</script>
```

### Cleanup for WebSocket / EventSource

```vue
<script setup>
import { onMounted, onUnmounted, shallowRef } from 'vue'

const ws = shallowRef(null)
const messages = ref([])

onMounted(() => {
  ws.value = new WebSocket('wss://api.example.com/ws')
  
  ws.value.onmessage = (event) => {
    messages.value.push(JSON.parse(event.data))
  }
  
  ws.value.onclose = () => {
    // Handle reconnection if needed
  }
})

onUnmounted(() => {
  ws.value?.close()
  ws.value = null
})
</script>
```

### Common patterns that need cleanup

| Pattern | Cleanup needed |
|---------|----------------|
| `window.addEventListener` | `window.removeEventListener` |
| `document.addEventListener` | `document.removeEventListener` |
| `setInterval` / `setTimeout` | `clearInterval` / `clearTimeout` |
| WebSocket | `ws.close()` |
| EventSource | `eventSource.close()` |
| IntersectionObserver | `observer.disconnect()` |
| ResizeObserver | `observer.disconnect()` |
| Custom pub/sub | `unsubscribe()` |
| Pinia store subscriptions | `store.$subscribe(...)` returns unsubscribe fn |