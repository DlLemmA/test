---
title: Users Trapped in Infinite Redirect Loops
impact: HIGH
impactDescription: Navigation guards that redirect without proper conditions can create infinite loops
type: capability
tags: [vue-router, navigation-guards, infinite-loop, redirect]
---

# Users Trapped in Infinite Redirect Loops

## Problem

Navigation guards that redirect unconditionally or with incorrect conditions can create infinite redirect loops.

## Solution

Always add proper conditions before redirecting.

### Common causes and fixes

**1. Redirecting to login without checking if already on login page**

```js
// BAD - infinite loop on /login
router.beforeEach((to, from, next) => {
  if (!isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

// GOOD - check if already on login
router.beforeEach((to, from, next) => {
  if (!isAuthenticated && to.path !== '/login') {
    next('/login')
  } else {
    next()
  }
})
```

**2. Redirecting based on async state that isn't ready**

```js
// BAD - auth check not ready, redirects to login, then redirects back
router.beforeEach(async (to, from, next) => {
  const user = await getCurrentUser() // Might return null initially
  if (!user && to.path !== '/login') {
    next('/login')
  } else {
    next()
  }
})

// GOOD - handle loading state
router.beforeEach(async (to, from, next) => {
  const { user, loading } = useAuth()
  
  if (loading) {
    // Wait for auth to initialize
    await new Promise(resolve => {
      const unwatch = watch(loading, (val) => {
        if (!val) {
          unwatch()
          resolve()
        }
      })
    })
  }
  
  if (!user.value && to.path !== '/login') {
    next('/login')
  } else {
    next()
  }
})
```

**3. Redirecting in beforeRouteEnter without proper next() handling**

```js
// BAD - calling next() multiple times
beforeRouteEnter(to, from, next) {
  if (condition) {
    next('/other') // Redirects
  }
  next() // Also calls next() again!
}

// GOOD - return early after redirect
beforeRouteEnter(to, from, next) {
  if (condition) {
    return next('/other')
  }
  next()
}
```

### Best practices

1. **Always check the target route** before redirecting
2. **Use a loading state** for async initialization
3. **Return early** after calling `next()` with a redirect
4. **Add a maximum redirect count** for safety:

```js
let redirectCount = 0
const MAX_REDIRECTS = 10

router.beforeEach((to, from, next) => {
  if (redirectCount > MAX_REDIRECTS) {
    console.error('Too many redirects, stopping')
    return next(false)
  }
  // ... redirect logic
  if (shouldRedirect) {
    redirectCount++
    return next(redirectPath)
  }
  redirectCount = 0
  next()
})
```