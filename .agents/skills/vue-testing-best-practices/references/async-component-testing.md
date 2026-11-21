---
title: Testing Components Created with defineAsyncComponent
impact: MEDIUM
impactDescription: Async components need Suspense wrapper and proper awaiting in tests
type: capability
tags: [testing, async-component, defineAsyncComponent, suspense, vue-test-utils]
---

# Testing Components Created with defineAsyncComponent

## Problem

Components loaded with `defineAsyncComponent` don't render immediately in tests - they require `<Suspense>` and `flushPromises`.

## Solution

Wrap in Suspense and await promises, same as async setup components.

### Basic async component

```vue
<!-- HeavyComponent.vue -->
<script setup>
import { ref } from 'vue'

const data = ref('Heavy content loaded')
</script>

<template>
  <div class="heavy">{{ data }}</div>
</template>
```

```ts
// Component that lazy loads
import { defineAsyncComponent } from 'vue'

const HeavyComponent = defineAsyncComponent(() => 
  import('./HeavyComponent.vue')
)
```

### Testing pattern

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { Suspense } from 'vue'

// Parent using async component
const ParentComponent = {
  components: { HeavyComponent },
  template: `
    <Suspense>
      <HeavyComponent />
      <template #fallback>
        <div data-testid="loading">Loading...</div>
      </template>
    </Suspense>
  `
}

it('shows fallback then content', async () => {
  const wrapper = mount(ParentComponent)
  
  // Initially shows fallback
  expect(wrapper.text()).toContain('Loading...')
  
  // Wait for async component to load
  await flushPromises()
  
  // Now shows content
  expect(wrapper.text()).toContain('Heavy content loaded')
  expect(wrapper.find('[data-testid="loading"]').exists()).toBe(false)
})
```

### Testing with delay (simulating slow network)

```ts
// Mock slow import
const SlowComponent = defineAsyncComponent(
  () => new Promise(resolve => 
    setTimeout(() => resolve(import('./HeavyComponent.vue')), 100)
  ),
  {
    delay: 200, // Show fallback after 200ms
    timeout: 3000 // Error after 3s
  }
)

it('shows fallback after delay', async () => {
  const wrapper = mount({
    components: { SlowComponent },
    template: `
      <Suspense>
        <SlowComponent />
        <template #fallback>Loading...</template>
      </Suspense>
    `
  })
  
  expect(wrapper.text()).toContain('Loading...')
  
  // Wait for delay + load
  await flushPromises()
  await new Promise(r => setTimeout(r, 350)) // delay + load time
  
  expect(wrapper.text()).toContain('Heavy content loaded')
})
```

### Testing error state

```ts
const FailingComponent = defineAsyncComponent(
  () => Promise.reject(new Error('Failed to load'))
)

it('shows error boundary fallback', async () => {
  const ErrorBoundary = {
    template: `
      <div>
        <slot />
        <div v-if="error" class="error">{{ error.message }}</div>
      </div>
    `,
    data() { return { error: null } },
    errorCaptured(err) {
      this.error = err
      return false
    }
  }
  
  const wrapper = mount({
    components: { FailingComponent, ErrorBoundary },
    template: `
      <ErrorBoundary>
        <Suspense>
          <FailingComponent />
          <template #fallback>Loading...</template>
        </Suspense>
      </ErrorBoundary>
    `
  })
  
  await flushPromises()
  
  expect(wrapper.text()).toContain('Failed to load')
})
```

### Testing with props

```ts
const AsyncWithProps = defineAsyncComponent(() => import('./AsyncWithProps.vue'))

it('passes props to async component', async () => {
  const wrapper = mount({
    components: { AsyncWithProps },
    template: `
      <Suspense>
        <AsyncWithProps :title="title" :count="5" />
        <template #fallback>Loading...</template>
      </Suspense>
    `,
    data() { return { title: 'Hello' } }
  })
  
  await flushPromises()
  
  expect(wrapper.text()).toContain('Hello')
  expect(wrapper.text()).toContain('5')
})
```

### Testing in router context

```ts
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/async', 
      component: () => import('./AsyncPage.vue') // Lazy route
    }
  ]
})

it('loads lazy route', async () => {
  router.push('/async')
  await router.isReady()
  
  const wrapper = mount(App, {
    global: { plugins: [router] }
  })
  
  // Shows router-view fallback or Suspense fallback
  await flushPromises()
  
  expect(wrapper.text()).toContain('Async Page Content')
})
```

### Test helper for async components

```ts
// test-utils/mountAsync.ts
import { mount, flushPromises } from '@vue/test-utils'
import { h, Suspense, defineAsyncComponent } from 'vue'

export async function mountAsyncComponent(
  loader: () => Promise<{ default: any }>,
  options = {}
) {
  const AsyncComponent = defineAsyncComponent(loader)
  
  const wrapper = mount({
    render() {
      return h(Suspense, {
        default: () => h(AsyncComponent, options.props),
        fallback: () => h('div', { 'data-testid': 'async-fallback' }, options.fallback || 'Loading...')
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
import { mountAsyncComponent } from '@/test-utils/mountAsync'

it('loads async component', async () => {
  const wrapper = await mountAsyncComponent(() => import('./Component.vue'))
  expect(wrapper.text()).toContain('Content')
})
```

### Key points

| Aspect | Requirement |
|--------|-------------|
| Wrapper | `<Suspense>` with fallback |
| Waiting | `await flushPromises()` |
| Props | Pass normally to async component |
| Errors | Wrap in error boundary |
| Router lazy routes | `await router.isReady()` then `flushPromises()` |