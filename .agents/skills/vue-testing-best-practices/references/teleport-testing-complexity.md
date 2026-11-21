---
title: Teleported Modal Content Can't Be Found in Wrapper Queries
impact: MEDIUM
impactDescription: Teleport moves DOM outside component - use global queries or mount with teleport target
type: capability
tags: [testing, teleport, modal, portal, vue-test-utils]
---

# Teleported Modal Content Can't Be Found in Wrapper Queries

## Problem

`<Teleport>` moves content to a different DOM location (usually `body`), so `wrapper.find()` can't locate teleported elements.

## Solution

Query the document directly, or mount with a teleport target in the test container.

### The problem

```vue
<!-- Modal.vue -->
<template>
  <Teleport to="body">
    <div class="modal" role="dialog">
      <slot />
    </div>
  </Teleport>
</template>
```

```ts
// BAD - can't find teleported content
const wrapper = mount(Modal, { slots: { default: 'Hello' } })
expect(wrapper.find('.modal').exists()).toBe(false) // Not in wrapper!
```

### Solution 1: Query document directly

```ts
// GOOD - query document.body
import { mount } from '@vue/test-utils'

it('renders modal in body', () => {
  mount(Modal, { slots: { default: 'Hello' } })
  
  // Query document directly
  const modal = document.body.querySelector('.modal')
  expect(modal).toBeTruthy()
  expect(modal.textContent).toContain('Hello')
})
```

### Solution 2: Mount with teleport target in test container

```ts
// GOOD - provide teleport target
it('renders modal in container', () => {
  const teleportTarget = document.createElement('div')
  teleportTarget.id = 'teleport-target'
  document.body.appendChild(teleportTarget)
  
  const wrapper = mount(Modal, {
    slots: { default: 'Hello' },
    attachTo: teleportTarget // Vue Test Utils 1.4+
  })
  
  // Now findable in wrapper
  expect(wrapper.find('.modal').exists()).toBe(true)
  
  teleportTarget.remove()
})
```

### Solution 3: Use Testing Library (queries document by default)

```ts
// GOOD - @testing-library/vue queries document
import { render, screen } from '@testing-library/vue'

it('shows modal', () => {
  render(Modal, { slots: { default: 'Hello' } })
  
  // screen queries document.body by default
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('Hello')).toBeInTheDocument()
})
```

### Solution 4: Disable teleport in tests (for simple tests)

```vue
<!-- Modal.vue -->
<script setup>
const props = defineProps({
  disabled: { type: Boolean, default: false } // For testing
})
</script>

<template>
  <Teleport :to="disabled ? undefined : 'body'">
    <div class="modal" role="dialog"><slot /></div>
  </Teleport>
</template>
```

```ts
// Test without teleport
it('renders content', () => {
  const wrapper = mount(Modal, { 
    slots: { default: 'Hello' },
    props: { disabled: true }
  })
  
  expect(wrapper.find('.modal').exists()).toBe(true)
})
```

### Full modal test example

```ts
// Modal.test.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Modal from '@/components/Modal.vue'

describe('Modal', () => {
  let teleportTarget
  
  beforeEach(() => {
    teleportTarget = document.createElement('div')
    teleportTarget.id = 'modal-root'
    document.body.appendChild(teleportTarget)
  })
  
  afterEach(() => {
    teleportTarget.remove()
  })
  
  it('opens and shows content', () => {
    const wrapper = mount(Modal, {
      props: { open: true },
      slots: { default: 'Modal content' },
      attachTo: teleportTarget
    })
    
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Modal content')
  })
  
  it('closes on backdrop click', async () => {
    const wrapper = mount(Modal, {
      props: { open: true, closeOnBackdrop: true },
      attachTo: teleportTarget
    })
    
    await wrapper.find('.modal-backdrop').trigger('click')
    
    expect(wrapper.emitted('close')).toBeTruthy()
  })
  
  it('traps focus', async () => {
    const wrapper = mount(Modal, {
      props: { open: true },
      attachTo: teleportTarget
    })
    
    const dialog = wrapper.find('[role="dialog"]')
    const firstFocusable = dialog.find('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    
    expect(firstFocusable.element).toBe(document.activeElement)
  })
  
  it('closes on Escape key', async () => {
    const wrapper = mount(Modal, {
      props: { open: true },
      attachTo: teleportTarget
    })
    
    await wrapper.trigger('keydown.escape')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
```

### Testing Teleport to specific element

```vue
<!-- Tooltip.vue -->
<template>
  <Teleport :to="tooltipTarget">
    <div class="tooltip">{{ content }}</div>
  </Teleport>
</template>
```

```ts
it('renders tooltip at target', () => {
  const target = document.createElement('div')
  target.id = 'tooltip-target'
  document.body.appendChild(target)
  
  const wrapper = mount(Tooltip, {
    props: { 
      content: 'Tooltip text',
      tooltipTarget: '#tooltip-target'
    },
    attachTo: target
  })
  
  expect(wrapper.find('.tooltip').exists()).toBe(true)
  expect(wrapper.find('.tooltip').text()).toBe('Tooltip text')
  
  target.remove()
})
```

### Key points

| Approach | Use when |
|----------|----------|
| `document.body.querySelector` | Simple existence checks |
| `attachTo` (VTU 1.4+) | Need wrapper methods on teleported content |
| `@testing-library/vue` | Preferred - queries document by default |
| `disabled` prop | Unit testing component logic without teleport |
| Real teleport target | Integration testing actual teleport behavior |