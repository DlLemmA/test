<script setup lang="ts">
import { RouterLink } from "vue-router";
import { signOut } from "@/core/auth";
import { toastState } from "@/core/state";
import AppIcon from "@/features/shared/ui/AppIcon.vue";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function signOutAndReset(): Promise<void> {
  try {
    await signOut();
    toastState.add({ message: "Вы вышли", type: "success" });
  } catch (err) {
    toastState.add({ message: "Не удалось выйти: " + errorMessage(err), type: "error" });
  }
}
</script>

<template>
  <header class="app-header">
    <RouterLink class="brand" :to="{ name: 'parcels' }" aria-label="На главную, посылки">
      <span class="brand-mark" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
          <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
          <path d="M7.5 5.25 16.5 9.75" />
        </svg>
      </span>
      <span class="brand-text">
        <strong>Pindoчет</strong>
        <small>учёт посылок</small>
      </span>
    </RouterLink>
    <div class="header-actions">
      <button id="signOutBtn" class="header-btn" type="button" @click="signOutAndReset">
        <AppIcon name="logOut" />
        <span>Выйти</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
/* App header — quiet register masthead */
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 11px;
  background: var(--color-canvas);
  border-bottom: 1px solid var(--color-line-strong);
}
.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  min-height: 44px;
  margin-inline: -6px;
  padding: 4px 6px;
  border-radius: 10px;
  color: inherit;
  text-decoration: none;
}
.brand:active {
  background: var(--color-paper);
}
.brand-mark {
  flex: none;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-accent-line);
  border-radius: 7px;
  background: var(--color-paper);
  color: var(--color-accent);
}
.brand-mark svg {
  width: 15px;
  height: 15px;
}
.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.1;
}
.brand-text strong {
  color: var(--color-ink);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.brand-text small {
  color: var(--color-muted);
  font-size: 10px;
  letter-spacing: 0.01em;
}
.header-actions {
  display: flex;
  gap: 2px;
}
.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 6px 10px;
  border-radius: 10px;
  background: transparent;
  color: var(--color-ink-soft);
  font-size: 12px;
  font-weight: 600;
}
/* The SVG is injected by AppIcon via v-html, so it carries no scope attribute. */
.header-btn :deep(.icon) {
  width: 15px;
  height: 15px;
}
.header-btn:active {
  background: var(--color-slate-100);
  color: var(--color-accent-strong);
}
</style>
