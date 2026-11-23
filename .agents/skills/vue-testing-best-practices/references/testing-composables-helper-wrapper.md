---
title: Composables Using Lifecycle Hooks or Inject Fail to Test
impact: HIGH
impactDescription: Composables with onMounted, provide/inject need a component wrapper for testing
type: capability
tags: [testing, composables, lifecycle, inject, wrapper, vue-test-utils]
---

# Composables Using Lifecycle Hooks or Inject Fail to Test

## Problem

Composables that use lifecycle hooks (`onMounted`, `onUnmounted`) or `inject`/`provide` cannot be tested directly - they must be called within a component's `setup()`.

## Solution

Create a test wrapper component that uses the composable.

### Basic wrapper pattern

```ts
// test-utils/composable-wrapper.vue
<script setup>
import { defineProps, provide } from 'vue'

const props = defineProps<{
  composable: () => any
  provide?: Record<string, any>
}>()

// Provide dependencies if needed
if (props.provide) {
  for (const [key, value] of Object.entries(props.provide)) {
    provide(key, value)
  }
}

// Call the composable
const result = props.composable()

// Expose result for testing
defineExpose({ result })
</script>

<template>
  <div><!-- Mount point for lifecycle --></div>
</template>
```

### Usage in tests

```ts
import { mount } from '@vue/test-utils'
import ComposableWrapper from './test-utils/composable-wrapper.vue'
import { useMyComposable } from '@/composables/useMyComposable'
import { describe, it, expect } from 'vitest'

describe('useMyComposable', () => {
  it('returns expected values', () => {
    const wrapper = mount(ComposableWrapper, {
      props: {
        composable: useMyComposable
      }
    })
    
    const { result } = wrapper.vm
    expect(result.someValue).toBe('expected')
  })
  
  it('handles lifecycle', async () => {
    const onMountedSpy = vi.fn()
    const onUnmountedSpy = vi.fn()
    
    // Mock the composable to track lifecycle
    const testComposable = () => {
      onMounted(onMountedSpy)
      onUnmounted(onUnmountedSpy)
      return { value: 'test' }
    }
    
    const wrapper = mount(ComposableWrapper, {
      props: { composable: testComposable }
    })
    
    expect(onMountedSpy).toHaveBeenCalled()
    
    wrapper.unmount()
    expect(onUnmountedSpy).toHaveBeenCalled()
  })
  
  it('works with provide/inject', () => {
    const MY_KEY = Symbol('my-key')
    const providedValue = { data: 'injected' }
    
    const testComposable = () => {
      const injected = inject(MY_KEY)
      return { injected }
    }
    
    const wrapper = mount(ComposableWrapper, {
      props: {
        composable: testComposable,
        provide: { [MY_KEY]: providedValue }
      }
    })
    
    expect(wrapper.vm.result.injected).toEqual(providedValue)
  })
})
```

### Reusable test helper

```ts
// test-utils/testComposable.ts
import { mount } from '@vue/test-utils'
import ComposableWrapper from './composable-wrapper.vue'

export function testComposable<T>(
  composable: () => T,
  options: {
    provide?: Record<string, any>
    props?: Record<string, any>
  } = {}
) {
  const wrapper = mount(ComposableWrapper, {
    props: {
      composable,
      provide: options.provide
    },
    global: {
      provide: options.provide // Also provide globally for nested inject
    }
  })
  
  return {
    result: wrapper.vm.result,
    wrapper,
    unmount: () => wrapper.unmount()
  }
}
```

```ts
// Usage
import { testComposable } from '@/test-utils/testComposable'

describe('useAuth', () => {
  it('provides user state', () => {
    const { result } = testComposable(useAuth, {
      provide: { 
        [AUTH_KEY]: { user: { name: 'Test' } } 
      }
    })
    
    expect(result.user.value.name).toBe('Test')
  })
  
  it('calls onMounted', () => {
    const onMounted = vi.fn()
    const composable = () => {
      onMounted(() => { /* ... */ })
      return { value: 1 }
    }
    
    testComposable(composable)
    expect(onMounted).toHaveBeenCalled()
  })
})
```

### Testing with Pinia

```ts
// For composables using Pinia stores
import { createPinia, setActivePinia } from 'pinia'

export function testComposableWithPinia<T>(
  composable: () => T,
  storeSetup?: () => void
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  
  // Setup stores if needed
  if (storeSetup) storeSetup()
  
  return testComposable(composable)
}
```

```ts
// Usage
it('uses cart store', () => {
  const { result } = testComposableWithPinia(useCartTotal, () => {
    const cart = useCartStore()
    cart.addItem({ id: 1, price: 10 })
  })
  
  expect(result.total.value).toBe(10)
})
```

### For composables with router

```ts
// test-utils/router-mock.ts
import { createRouter, createWebHistory } from 'vue-router'

export function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/test', component: { template: '<div>Test</div>' } }
    ]
  })
}
```

```ts
// Usage
import { createTestRouter } from '@/test-utils/router-mock'

it('uses router', () => {
  const router = createTestRouter()
  router.push('/test')
  
  const { result } = testComposable(useRouteAwareComposable, {
    provide: { router }
  })
  
  expect(result.route.value.path).toBe('/test')
})
```