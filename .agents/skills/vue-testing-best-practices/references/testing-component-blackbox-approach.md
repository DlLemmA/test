---
title: Tests Breaking When Refactoring Component Internals
impact: HIGH
impactDescription: Testing implementation details makes tests brittle - test behavior from user perspective instead
type: best-practice
tags: [testing, blackbox, implementation-details, refactoring, vue-test-utils]
---

# Tests Breaking When Refactoring Component Internals

## Problem

Tests that assert on internal component structure (class names, DOM structure, private methods) break when you refactor, even if behavior is unchanged.

## Solution

Test components as black boxes - only test what users can see and interact with.

### What NOT to test (implementation details)

```ts
// BAD - testing internals
it('has correct internal structure', () => {
  const wrapper = mount(Component)
  expect(wrapper.find('.internal-class').exists()).toBe(true)
  expect(wrapper.vm.privateMethod()).toBe('value')
  expect(wrapper.vm.internalState).toBe('initial')
})
```

### What TO test (user behavior)

```ts
// GOOD - testing user-visible behavior
it('shows loading state while fetching', async () => {
  const wrapper = mount(Component)
  expect(wrapper.text()).toContain('Loading...')
  
  await waitFor(() => {
    expect(wrapper.text()).toContain('Data loaded')
  })
})

it('shows error message when fetch fails', async () => {
  const wrapper = mount(Component, {
    global: {
      mocks: { $fetch: vi.fn().mockRejectedValue(new Error('Failed')) }
    }
  })
  
  await waitFor(() => {
    expect(wrapper.text()).toContain('Error: Failed')
  })
})

it('disables button during submit', async () => {
  const wrapper = mount(FormComponent)
  const button = wrapper.get('button[type="submit"]')
  
  expect(button.attributes('disabled')).toBeUndefined()
  
  await wrapper.trigger('submit')
  expect(button.attributes('disabled')).toBe('')
})
```

### Query by user-facing attributes

```ts
// BAD - fragile selectors
wrapper.find('.btn-primary')
wrapper.find('div > div > button')
wrapper.find('[data-testid="submit"]') // Still implementation detail

// GOOD - user-facing queries
wrapper.get('button[type="submit"]') // Semantic HTML
wrapper.get('input[aria-label="Email"]') // Accessibility
wrapper.get('role="alert"') // ARIA roles
wrapper.findByText('Submit') // Visible text
wrapper.findByLabelText('Email') // Associated label
wrapper.findByRole('button', { name: 'Submit' }) // ARIA
```

### Testing library queries (recommended)

```ts
// With @testing-library/vue
import { render, screen } from '@testing-library/vue'

render(Component)

// Preferred queries (in order of preference)
screen.getByRole('button', { name: 'Submit' })
screen.getByLabelText('Email')
screen.getByPlaceholderText('Enter email')
screen.getByText('Welcome')
screen.getByTestId('custom-component') // Last resort
```

### Test component contracts, not internals

```ts
// Test props → rendered output
it('renders user name from props', () => {
  const wrapper = mount(UserCard, {
    props: { user: { name: 'Alice', role: 'Admin' } }
  })
  expect(wrapper.text()).toContain('Alice')
  expect(wrapper.text()).toContain('Admin')
})

// Test events → emitted
it('emits delete event with user id', async () => {
  const wrapper = mount(UserCard, {
    props: { user: { id: 42, name: 'Alice' } }
  })
  
  await wrapper.get('button[aria-label="Delete"]').trigger('click')
  
  expect(wrapper.emitted('delete')).toBeTruthy()
  expect(wrapper.emitted('delete')[0]).toEqual([42])
})

// Test slots → rendered
it('renders default slot content', () => {
  const wrapper = mount(Card, {
    slots: { default: 'Custom content' }
  })
  expect(wrapper.text()).toContain('Custom content')
})
```

### When you MUST test internals

```ts
// Rare cases where internals matter:
// 1. Performance-critical optimizations
// 2. Complex algorithms with specific outputs
// 3. Library code consumed by other developers

// If needed, mark clearly:
it('internal: cache invalidation works', () => {
  // ...
})
```

### Refactoring confidence checklist

After refactoring, tests should pass if:
- [ ] User sees same content
- [ ] User interactions work same way
- [ ] Events emit same payloads
- [ ] Accessibility unchanged
- [ ] Props/slots contract unchanged

Tests SHOULD fail if:
- [ ] User-visible behavior changed
- [ ] Public API (props/events/slots) changed