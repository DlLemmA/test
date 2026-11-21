---
title: Tests Fail Intermittently with Race Conditions
impact: HIGH
impactDescription: Async operations in tests need proper waiting to avoid flaky tests
type: capability
tags: [testing, async, await, flushPromises, race-conditions, flaky-tests]
---

# Tests Fail Intermittently with Race Conditions

## Problem

Tests that don't properly wait for async operations (API calls, nextTick, timers) fail intermittently due to race conditions.

## Solution

Always await async operations and use `flushPromises` for microtasks.

### The problem

```ts
// BAD - race condition
it('loads user data', async () => {
  const wrapper = mount(UserProfile)
  
  // Test continues before fetch completes!
  expect(wrapper.text()).toContain('John Doe') // Flaky!
})
```

### Solution 1: await the action

```ts
// GOOD - await user interaction that triggers fetch
it('loads user data', async () => {
  const wrapper = mount(UserProfile)
  
  // Trigger the fetch
  await wrapper.find('button').trigger('click')
  
  // Wait for the resulting DOM update
  await waitFor(() => {
    expect(wrapper.text()).toContain('John Doe')
  })
})
```

### Solution 2: flushPromises for microtasks

```ts
import { flushPromises } from '@vue/test-utils'

// GOOD - flush microtasks after async operations
it('loads user data', async () => {
  const wrapper = mount(UserProfile)
  
  // If component fetches in onMounted
  await flushPromises()
  
  expect(wrapper.text()).toContain('John Doe')
})
```

### Solution 3: waitFor for assertions

```ts
import { waitFor } from '@testing-library/vue'
// or from vitest: import { waitFor } from 'vitest'

// GOOD - retry assertion until passes or timeout
it('shows data after load', async () => {
  const wrapper = mount(UserProfile)
  
  await waitFor(() => {
    expect(wrapper.text()).toContain('John Doe')
  }, { timeout: 1000, interval: 50 })
})
```

### Common async patterns in Vue tests

```ts
// 1. onMounted fetch
it('fetches on mount', async () => {
  const wrapper = mount(Component)
  await flushPromises() // Wait for onMounted promise
  expect(wrapper.text()).toContain('Data')
})

// 2. v-model with async validation
it('validates on blur', async () => {
  const wrapper = mount(Form)
  const input = wrapper.get('input')
  
  await input.setValue('invalid')
  await input.trigger('blur')
  await flushPromises() // Wait for validation
  
  expect(wrapper.text()).toContain('Invalid')
})

// 3. watch with async callback
it('reacts to prop change', async () => {
  const wrapper = mount(Component, { props: { id: 1 } })
  
  await wrapper.setProps({ id: 2 })
  await flushPromises() // Wait for watch callback
  
  expect(wrapper.text()).toContain('Item 2')
})

// 4. nextTick for DOM updates
import { nextTick } from 'vue'

it('updates DOM after state change', async () => {
  const wrapper = mount(Counter)
  
  wrapper.vm.increment()
  await nextTick() // Wait for DOM update
  
  expect(wrapper.text()).toContain('1')
})

// 5. Timers (use fake timers)
vi.useFakeTimers()

it('debounces input', async () => {
  const wrapper = mount(SearchInput)
  const input = wrapper.get('input')
  
  await input.setValue('test')
  
  // Fast-forward timer
  vi.advanceTimersByTime(300)
  await flushPromises()
  
  expect(api.search).toHaveBeenCalledWith('test')
  
  vi.useRealTimers()
})
```

### Async utilities comparison

| Utility | Use for |
|---------|---------|
| `await flushPromises()` | Microtasks (Promises, nextTick) |
| `await nextTick()` | Single DOM update cycle |
| `await waitFor(() => expect(...))` | Polling until condition met |
| `vi.useFakeTimers()` | setTimeout/setInterval |
| `vi.advanceTimersByTime(ms)` | Fast-forward fake timers |

### Flaky test patterns to avoid

```ts
// BAD - arbitrary wait
await new Promise(r => setTimeout(r, 100))

// BAD - no wait at all
expect(wrapper.text()).toContain('loaded')

// BAD - waiting for wrong thing
await flushPromises() // But component uses setTimeout!
```

### Debugging flaky tests

```ts
// Add logging to see timing
it('debug timing', async () => {
  const wrapper = mount(Component)
  console.log('Before flush:', wrapper.html())
  await flushPromises()
  console.log('After flush:', wrapper.html())
})
```