---
title: Snapshot Tests Keep Passing Despite Broken Functionality
impact: MEDIUM
impactDescription: Snapshot tests only detect structural changes, not behavioral correctness
type: best-practice
tags: [testing, snapshots, vitest, assertions, behavior]
---

# Snapshot Tests Keep Passing Despite Broken Functionality

## Problem

Snapshot tests pass as long as the rendered HTML structure matches, even when functionality is broken (wrong calculations, missing event handlers, broken logic).

## Solution

Use snapshots sparingly and always pair with behavioral assertions.

### What snapshots catch (and miss)

| Snapshots catch | Snapshots miss |
|-----------------|----------------|
| HTML structure changes | Wrong computed values |
| Missing/extra elements | Broken event handlers |
| Class/attribute changes | Incorrect logic flow |
| Slot content changes | API call failures |

### Bad: Snapshot-only test

```ts
// BAD - only snapshot
it('matches snapshot', () => {
  const wrapper = mount(Component)
  expect(wrapper.html()).toMatchSnapshot()
})
```

### Good: Behavioral assertions + optional snapshot

```ts
// GOOD - test behavior first
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import Counter from '@/components/Counter.vue'

describe('Counter', () => {
  it('increments on click', async () => {
    const wrapper = mount(Counter)
    
    // Behavioral assertions
    expect(wrapper.text()).toContain('Count: 0')
    
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('Count: 1')
    
    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('Count: 2')
  })
  
  it('disabled at max', async () => {
    const wrapper = mount(Counter, { props: { max: 2 } })
    
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    
    expect(wrapper.get('button').attributes('disabled')).toBe('')
  })
  
  // Optional: snapshot for regression detection
  it('matches snapshot', () => {
    const wrapper = mount(Counter)
    expect(wrapper.html()).toMatchSnapshot()
  })
})
```

### When snapshots ARE useful

```ts
// 1. Complex generated output (HTML emails, reports)
it('generates correct invoice HTML', () => {
  const html = generateInvoice(invoiceData)
  expect(html).toMatchSnapshot()
})

// 2. Design system component variants
describe.each(['primary', 'secondary', 'danger', 'ghost'])(
  'Button variant %s',
  (variant) => {
    it('matches snapshot', () => {
      const wrapper = mount(Button, { props: { variant } })
      expect(wrapper.html()).toMatchSnapshot()
    })
  }
)

// 3. API response shapes (contract testing)
it('returns expected user shape', async () => {
  const user = await fetchUser(1)
  expect(user).toMatchSnapshot()
})

// 4. CSS-in-JS or style object outputs
it('generates correct styles', () => {
  const styles = getButtonStyles({ variant: 'primary', size: 'lg' })
  expect(styles).toMatchSnapshot()
})
```

### Better alternatives to snapshots

```ts
// Instead of snapshot for DOM structure:
it('renders user list', () => {
  const wrapper = mount(UserList, {
    props: { users: [{ id: 1, name: 'Alice' }] }
  })
  
  // Specific assertions
  expect(wrapper.findAll('li')).toHaveLength(1)
  expect(wrapper.get('li').text()).toBe('Alice')
  expect(wrapper.get('li').attributes('data-id')).toBe('1')
})

// Instead of snapshot for props/state:
it('computes correct totals', () => {
  const wrapper = mount(Cart, {
    props: { items: [{ price: 10, qty: 2 }] }
  })
  
  expect(wrapper.vm.total).toBe(20)
  // NOT: expect(wrapper.vm).toMatchSnapshot()
})
```

### Snapshot maintenance

```bash
# Update snapshots when intentional changes
npm test -- -u

# Review snapshot diffs carefully!
# Don't just blindly update
```

### Rule of thumb

> **Snapshot tests are for detecting unexpected changes, not for verifying correctness.**

- Write behavioral tests first
- Add snapshots only for complex output that's hard to assert on
- Never rely solely on snapshots for critical functionality