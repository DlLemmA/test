---
title: Building Production Single-Page Application with Vue Router
impact: MEDIUM
impactDescription: Proper Vue Router setup for production SPAs with history mode, fallback, and error handling
type: best-practice
tags: [vue-router, production, spa, history-mode, vite, nginx]
---

# Building Production Single-Page Application with Vue Router

## Router Setup

```ts
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { 
    path: '/about', 
    name: 'about', 
    component: () => import('@/views/AboutView.vue') // Lazy load
  },
  { 
    path: '/user/:id', 
    name: 'user', 
    component: () => import('@/views/UserView.vue'),
    props: true // Pass params as props
  },
  { 
    path: '/:pathMatch(.*)*', 
    name: 'not-found', 
    component: () => import('@/views/NotFoundView.vue') 
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  }
})

export default router
```

## Vite Config for SPA

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // Relative paths for flexible deployment
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
})
```

## Nginx Config for History Mode

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
}
```

## Apache Config (.htaccess)

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

## Netlify/Vercel Config

```toml
# netlify.toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

```json
// vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Error Handling & Loading States

```vue
<!-- App.vue -->
<script setup>
import { RouterView, onBeforeRouteLeave } from 'vue-router'
import { ref } from 'vue'

const isLoading = ref(false)
const error = ref(null)

router.beforeEach(() => {
  isLoading.value = true
  error.value = null
})

router.afterEach(() => {
  isLoading.value = false
})

router.onError((err) => {
  error.value = err.message
  isLoading.value = false
})
</script>

<template>
  <div id="app">
    <header>
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
    </header>

    <main>
      <RouterView 
        v-slot="{ Component, route }"
        v-if="!error"
      >
        <Transition name="fade" mode="out-in">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>

      <div v-else class="error-page">
        <h1>Error</h1>
        <p>{{ error }}</p>
        <button @click="window.location.reload()">Reload</button>
      </div>

      <div v-if="isLoading" class="loading-bar" />
    </main>
  </div>
</template>
```

## Environment Variables

```env
# .env.production
VITE_BASE_URL=https://api.example.com
VITE_APP_TITLE=My Vue App
```

```ts
// router/index.ts - use env for base URL
const router = createRouter({
  history: createWebHistory(import.meta.env.VITE_BASE_URL),
  // ...
})
```

## Production Checklist

- [ ] Use `createWebHistory` (not `createWebHashHistory`)
- [ ] Configure server fallback to `index.html`
- [ ] Lazy load route components with `() => import()`
- [ ] Add `scrollBehavior` for UX
- [ ] Handle 404 with catch-all route
- [ ] Add loading states for async routes
- [ ] Configure error boundary for route errors
- [ ] Set proper cache headers for static assets
- [ ] Use `props: true` for route params as props
- [ ] Test deep linking (direct URL access)