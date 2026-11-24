<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { ToastProvider } from "reka-ui";
import { RouterView, useRouter } from "vue-router";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import { seedDemo } from "@/core/demo-seed";
import { toastManager, toastState } from "@/core/state";
import { t } from "@/core/utils";
import { CUSTOMER_FORMS } from "@/features/customers/ui/CustomerPresentation";
import { ITEM_FORMS, PARCEL_FORMS } from "@/features/parcels/ui/ParcelPresentation";
import AppNavbar from "./AppNavbar.vue";
import type { AppRoute } from "./router";
import { dbReady } from "./startup";
import Toaster from "./Toaster.vue";

const router = useRouter();

type PendingAction = "demo" | "backup";

const backupOpen = shallowRef(false);
const backupFile = shallowRef<File | null>(null);
const pendingAction = shallowRef<PendingAction | null>(null);

const confirmOpen = computed({
  get: () => pendingAction.value !== null,
  set: (open: boolean) => {
    if (!open) pendingAction.value = null;
  },
});

const confirmCopy = computed(() =>
  pendingAction.value === "demo"
    ? {
        title: "Загрузить демо-данные",
        message: "Это заменит ВСЕ текущие данные (заказчики, посылки, товары). Продолжить?",
        confirmText: "Загрузить",
      }
    : {
        title: "Заменить базу",
        message: "Это заменит ВСЕ текущие данные. Продолжить?",
        confirmText: "Заменить",
      },
);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function go(target: AppRoute): void {
  void router.push({ name: target });
}

function onBackupFileChange(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  backupFile.value = input.files?.[0] ?? null;
}

async function downloadBackupFile(): Promise<void> {
  try {
    const { downloadBackup } = await import("@/core/backup");
    await downloadBackup();
    toastState.add({ message: "База скачана", type: "success" });
  } catch (err) {
    toastState.add({ message: "Не удалось скачать базу: " + errorMessage(err), type: "error" });
  }
}

function requestBackupImport(): void {
  if (!backupFile.value) {
    toastState.add({ message: "Выберите файл .json", type: "warn" });
    return;
  }
  pendingAction.value = "backup";
}

async function confirmPending(): Promise<void> {
  const action = pendingAction.value;
  pendingAction.value = null;
  if (action === "demo") {
    try {
      await seedDemo(true);
      toastState.add({ message: "Демо-данные загружены", type: "success" });
    } catch (err) {
      toastState.add({ message: "Ошибка загрузки демо: " + errorMessage(err), type: "error" });
    }
    return;
  }
  if (action !== "backup") return;

  const file = backupFile.value;
  if (!file) return;
  try {
    const { importBackup } = await import("@/core/backup");
    const result = await importBackup(await file.text());
    backupOpen.value = false;
    backupFile.value = null;
    go("parcels");
    toastState.add({
      message: `База загружена: ${t(CUSTOMER_FORMS, result.customers)}, ${t(PARCEL_FORMS, result.parcels)}, ${t(ITEM_FORMS, result.items)}`,
      type: "success",
    });
  } catch (err) {
    toastState.add({ message: "Ошибка импорта: " + errorMessage(err), type: "error" });
  }
}
</script>

<template>
  <ToastProvider label="Уведомления" :toast-manager="toastManager">
    <div v-if="dbReady" class="app-shell">
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
          <button id="demoBtn" class="header-btn" type="button" @click="pendingAction = 'demo'">
            Демо
          </button>
          <button id="backupBtn" class="header-btn" type="button" @click="backupOpen = true">
            Резерв
          </button>
        </div>
      </header>

      <main id="main-content" class="flex-1 px-4 pb-28 overflow-y-auto">
        <div id="panel-container" style="view-transition-name: panel-root">
          <RouterView />
        </div>
      </main>

      <AppNavbar />

      <AppDrawer v-model:open="backupOpen" title="База / резерв">
        <div class="panel">
          <h3>Экспорт базы (JSON)</h3>
          <p class="muted">Заказчики, посылки, товары и платежи.</p>
          <button class="secondary" type="button" @click="downloadBackupFile">
            <AppIcon name="download" /> Скачать базу
          </button>
        </div>
        <div class="panel" style="margin-top: 12px">
          <h3>Импорт базы</h3>
          <p class="muted">Текущие данные будут полностью заменены.</p>
          <label for="dbFile">Файл резервной копии</label>
          <input
            id="dbFile"
            type="file"
            accept=".json,application/json"
            @change="onBackupFileChange"
          />
          <button
            class="secondary"
            type="button"
            style="margin-top: 8px"
            @click="requestBackupImport"
          >
            <AppIcon name="upload" /> Загрузить и заменить
          </button>
        </div>
      </AppDrawer>

      <ConfirmDrawer
        v-model:open="confirmOpen"
        :title="confirmCopy.title"
        :message="confirmCopy.message"
        :confirm-text="confirmCopy.confirmText"
        @confirm="confirmPending"
      />
    </div>

    <div id="toastContainer" role="status" aria-live="polite">
      <Toaster />
    </div>
  </ToastProvider>
</template>
