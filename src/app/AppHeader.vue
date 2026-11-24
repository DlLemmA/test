<script setup lang="ts">
import { signOut } from "@/core/auth";
import { toastState } from "@/core/state";

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
    <div class="brand">
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
    </div>
    <div class="header-actions">
      <button id="signOutBtn" class="header-btn" type="button" @click="signOutAndReset">
        Выйти
      </button>
    </div>
  </header>
</template>
