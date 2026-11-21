---
title: Components with Async Setup Won't Render in Tests
impact: HIGH
impactDescription: Components using async setup() or Suspense need special handling in tests
type: capability
tags: [testing, suspense, async-setup, async-component, vue-test-utils]
---

# Components with Async Setup Won't Render in Tests

## Problem

Components with `async setup()` or wrapped in `<Suspense>` don't render their content immediately in tests - they show the fallback instead.

## Solution

Use `flushPromises` and `Suspense` wrapper in tests.

### The problem

```vue
<!-- Component.vue -->
<script setup>
const data = await fetchData() // async setup!
</script>

<template>
  <div>{{ data }}</div>
</template>
```

```ts
// BAD - renders empty/fallback
it('renders data', () => {
  const wrapper = mount(Component)
  expect(wrapper.text()).toContain('data') // Fails!
})
```

### Solution 1: Wrap in Suspense + flushPromises

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { Suspense } from 'vue'

it('renders data after async setup', async () => {
  const wrapper = mount({
    components: { Component },
    template: `
      <Suspense>
        <template #default>
          <Component />
        </template>
        <template #fallback>
          <div>Loading...</div>
        </template>
      </Suspense>
    `
  })
  
  await flushPromises()
  
  expect(wrapper.text()).toContain('data')
})
```

### Solution 2: Test the component directly with Suspense

```ts
import { mount, flushPromises } from '@vue/test-utils'

// Helper to mount with Suspense
function mountWithSuspense(component, options = {}) {
  return mount({
    components: { TestComponent: component },
    template: `
      <Suspense>
        <template #default>
          <TestComponent v-bind="$attrs" />
        </template>
        <template #fallback>
          <div data-testid="fallback">Loading...</div>
        </template>
      </Suspense>
    `,
    ...options
  })
}

it('renders async component', async () => {
  const wrapper = mountWithSuspense(AsyncComponent)
  await flushPromises()
  expect(wrapper.text()).toContain('loaded content')
})
```

### Solution 3: Use defineAsyncComponent

```ts
// Component loaded async
const AsyncComponent = defineAsyncComponent(() => import('./Component.vue'))

it('loads async component', async () => {
  const wrapper = mount({
    components: { AsyncComponent },
    template: `
      <Suspense>
        <AsyncComponent />
        <template #fallback>Loading...</template>
      </Suspense>
    `
  })
  
  expect(wrapper.text()).toContain('Loading...')
  
  await flushPromises()
  
  expect(wrapper.text()).toContain('loaded content')
})
```

### Testing Suspense fallback

```ts
it('shows fallback while loading', () => {
  const wrapper = mountWithSuspense(SlowComponent)
  
  // Immediately shows fallback
  expect(wrapper.text()).toContain('Loading...')
})

it('replaces fallback with content after load', async () => {
  const wrapper = mountWithSuspense(SlowComponent)
  
  await flushPromises()
  
  expect(wrapper.text()).not.toContain('Loading...')
  expect(wrapper.text()).toContain('Content')
})
```

### Testing error boundaries with Suspense

```vue
<!-- ErrorBoundary.vue -->
<script setup>
import { onErrorCaptured } from 'vue'

onErrorCaptured((err) => {
  console.error('Caught:', err)
  return false // Prevent propagation
})
</script>

<template>
  <slot />
</template>
```

```ts
it('catches async component errors', async () => {
  const ErrorComponent = defineAsyncComponent(() => 
    Promise.reject(new Error('Load failed'))
  )
  
  const wrapper = mount({
    components: { ErrorComponent, ErrorBoundary },
    template: `
      <ErrorBoundary>
        <Suspense>
          <ErrorComponent />
          <template #fallback>Loading...</template>
        </Suspense>
      </ErrorBoundary>
    `
  })
  
  await flushPromises()
  
  // Error caught by boundary
  expect(wrapper.text()).not.toContain('Loading...')
})
```

### With Router and Suspense

```ts
// router-view is async by default with lazy routes
it('renders lazy route', async () => {
  const router = createRouter({...})
  router.push('/lazy-route')
  await router.isReady()
  
  const wrapper = mount(App, {
    global: { plugins: [router] }
  })
  
  expect(wrapper.text()).toContain('Loading...')
  
  await flushPromises()
  
  expect(wrapper.text()).toContain('Lazy Route Content')
})
```

### Key points

| Scenario | Solution |
|----------|----------|
| `async setup()` | Wrap in `<Suspense>`, `await flushPromises()` |
| `defineAsyncComponent` | Same as above |
| Router lazy routes | `await router.isReady()`, then `flushPromises()` |
| Nested Suspense | Each level needs `flushPromises()` |
| Error in async component | Wrap in error boundary component |

### Minimal test helper

```ts
// test-utils/mountSuspense.ts
import { mount, flushPromises } from '@vue/test-utils'
import { h, Suspense } from 'vue'

export async function mountSuspense(component, options = {}) {
  const wrapper = mount({
    render() {
      return h(Suspense, {
        default: () => h(component, options.props),
        fallback: () => h('div', { 'data-testid': 'fallback' }, 'Loading...')
      })
    },
    global: options.global
  })
  
  await flushPromises()
  return wrapper
}
```

```ts
// Usage
import { mountSuspense } from '@/test-utils/mountSuspense'

it('works', async () => {
  const wrapper = await mountSuspense(AsyncComponent)
  expect(wrapper.text()).toContain('content')
})
```