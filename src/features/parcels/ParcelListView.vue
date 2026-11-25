<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { parcelCommands } from "@/features/shared/wiring";
import { toastState, uiState } from "@/core/state";
import { parcelRepository } from "./infrastructure";
import type { Parcel } from "./domain";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import ScreenState from "@/features/shared/ui/ScreenState.vue";
import ParcelListItem from "./ui/ParcelListItem.vue";
import { exportParcel } from "./ui/exportParcel";
import { confirmDeleteParcel } from "./ui/deleteParcelCopy";

const router = useRouter();

const parcels = shallowRef<Parcel[]>([]);
const deleteTarget = shallowRef<number | null>(null);
const phase = shallowRef<"loading" | "ready" | "error">("loading");

const ordered = computed(() =>
  // Sorts a copy so the source ref stays in insertion order.
  // oxlint-disable-next-line unicorn/no-array-sort
  [...parcels.value].sort((a, b) => {
    const ad = a.shippedAt ? Date.parse(a.shippedAt) : 0;
    const bd = b.shippedAt ? Date.parse(b.shippedAt) : 0;
    return bd - ad;
  }),
);
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (open: boolean) => {
    if (!open) deleteTarget.value = null;
  },
});

const loadScope = new AbortController();
onScopeDispose(() => loadScope.abort());

async function load(): Promise<void> {
  phase.value = "loading";
  try {
    const found = await parcelRepository.findAll();
    if (!loadScope.signal.aborted) {
      parcels.value = found;
      phase.value = "ready";
    }
  } catch (error) {
    if (!loadScope.signal.aborted) phase.value = "error";
    console.error(error);
  }
}
onMounted(load);

function refresh(): void {
  void load();
}

function addParcel(): void {
  // The batch wizard creates the parcel and its items in one write; creating an
  // empty draft first would leave an orphan when the batch is saved.
  void router.push({ name: "add" });
}

async function exportFromMenu(id: number): Promise<void> {
  const parcel = parcels.value.find((candidate) => candidate.id === id);
  if (parcel) await exportParcel(parcel);
}

function retryDelete(id: number): void {
  void parcelCommands
    .deleteParcel(id)
    .then(() => {
      if (uiState.currentParcelId === id) uiState.setCurrentParcelId(null);
      toastState.add({ message: "Посылка удалена", type: "success" });
      refresh();
    })
    .catch((error: unknown) => console.error(error));
}

async function confirmDelete(): Promise<void> {
  const id = deleteTarget.value;
  deleteTarget.value = null;
  if (id === null) return;
  try {
    await parcelCommands.deleteParcel(id);
    if (uiState.currentParcelId === id) uiState.setCurrentParcelId(null);
    toastState.add({ message: "Посылка удалена", type: "success" });
    refresh();
  } catch (error) {
    toastState.add({
      message: "Не удалось удалить посылку",
      type: "error",
      action: { label: "Повторить", onClick: () => retryDelete(id) },
    });
    console.error(error);
  }
}
</script>

<template>
  <div class="page page-parcels">
    <header class="page-head">
      <h1>Посылки</h1>
      <p class="page-head__note">По дате отправки — сначала свежие</p>
    </header>

    <ScreenState v-if="phase === 'loading'" kind="loading" title="Загружаем посылки…" />
    <ScreenState
      v-else-if="phase === 'error'"
      kind="error"
      message="Не удалось загрузить посылки. Проверьте соединение и попробуйте ещё раз."
      action-label="Повторить"
      @action="refresh"
    />
    <section v-else-if="ordered.length" class="section parcel-index">
      <ParcelListItem
        v-for="parcel in ordered"
        :key="parcel.id"
        :parcel="parcel"
        @export="exportFromMenu"
        @delete="deleteTarget = $event"
      />
    </section>
    <ScreenState
      v-else
      kind="empty"
      title="Посылок пока нет"
      message="Добавьте первую посылку — товары и заказчиков внесёте следующим шагом."
      action-label="Добавить посылку"
      @action="addParcel"
    />

    <ConfirmDrawer
      v-model:open="deleteOpen"
      :title="confirmDeleteParcel.title"
      :message="confirmDeleteParcel.message"
      :confirm-text="confirmDeleteParcel.confirmText"
      @confirm="confirmDelete"
    />
  </div>
</template>
