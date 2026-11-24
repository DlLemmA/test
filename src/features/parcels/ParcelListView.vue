<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { parcelCommands } from "@/features/shared/wiring";
import { toastState, uiState } from "@/core/state";
import { parcelRepository } from "./infrastructure";
import type { Parcel } from "./domain";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import ParcelListItem from "./ui/ParcelListItem.vue";
import { exportParcel } from "./ui/exportParcel";
import { confirmDeleteParcel } from "./ui/deleteParcelCopy";

const router = useRouter();

const parcels = shallowRef<Parcel[]>([]);
const deleteTarget = shallowRef<number | null>(null);

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
  const found = await parcelRepository.findAll();
  if (!loadScope.signal.aborted) parcels.value = found;
}
onMounted(load);

function refresh(): void {
  void load();
}

async function addParcel(): Promise<void> {
  const draft = parcels.value.find((parcel) => parcel.status === "draft");
  const parcel = draft || (await parcelCommands.createParcel());
  void router.push({ name: "parcel", params: { parcelId: String(parcel.id) } });
}

async function exportFromMenu(id: number): Promise<void> {
  const parcel = parcels.value.find((candidate) => candidate.id === id);
  if (parcel) await exportParcel(parcel);
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
      message: error instanceof Error ? error.message : "Не удалось удалить посылку",
      type: "error",
    });
  }
}
</script>

<template>
  <div class="page page-parcels">
    <header class="page-head">
      <h1>Посылки</h1>
      <p class="page-head__note">По дате отправки — сначала свежие</p>
    </header>

    <section class="section parcel-index">
      <template v-if="ordered.length">
        <ParcelListItem
          v-for="parcel in ordered"
          :key="parcel.id"
          :parcel="parcel"
          @export="exportFromMenu"
          @delete="deleteTarget = $event"
        />
      </template>
      <div v-else class="empty">Нет посылок. Нажмите «+», чтобы создать первую.</div>
    </section>

    <div class="form-actions form-actions--final">
      <button type="button" class="btn-primary w-full" id="addParcel" @click="addParcel">
        <AppIcon name="plus" /> Добавить посылку
      </button>
    </div>

    <ConfirmDrawer
      v-model:open="deleteOpen"
      :title="confirmDeleteParcel.title"
      :message="confirmDeleteParcel.message"
      :confirm-text="confirmDeleteParcel.confirmText"
      @confirm="confirmDelete"
    />
  </div>
</template>
