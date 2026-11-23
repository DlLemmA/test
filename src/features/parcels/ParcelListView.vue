<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { useRenderRefresh } from "@/app/useRenderRefresh";
import type { VueViewProps } from "@/app/mountVueView";
import { parcelCommands } from "@/features/shared/wiring";
import { router, toastState, uiState } from "@/core/state";
import { parcelRepository } from "./infrastructure";
import type { Parcel } from "./domain";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import { nextStepLabel } from "./ui/ParcelNextStatus";
import { parcelStatusInfo } from "./ui/ParcelStatusInfo";
import { parcelDate } from "./ui/ParcelPresentation";
import { exportParcel } from "./ui/exportParcel";
import { confirmDeleteParcel } from "./ui/deleteParcelCopy";

const props = defineProps<VueViewProps>();

const parcels = shallowRef<Parcel[]>([]);
const deleteTarget = shallowRef<number | null>(null);

const ordered = computed(() =>
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

const refresh = useRenderRefresh(props, async (signal) => {
  const found = await parcelRepository.findAll();
  if (!signal.aborted) parcels.value = found;
});

function parcelTitle(parcel: Parcel): string {
  return parcel.name || `Посылка №${parcel.id}`;
}

function closeMenu(event: Event): void {
  (event.currentTarget as HTMLElement).closest("details")?.removeAttribute("open");
}

async function addParcel(): Promise<void> {
  const draft = parcels.value.find((parcel) => parcel.status === "draft");
  const parcel = draft || (await parcelCommands.createParcel());
  router.navigate("parcel", { parcelId: String(parcel.id) });
}

async function exportFromMenu(id: number, event: Event): Promise<void> {
  closeMenu(event);
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
        <div
          v-for="parcel in ordered"
          :key="parcel.id"
          class="item parcel-entry"
          :data-status="parcel.status"
        >
          <div class="parcel-entry__date" :title="parcelDate(parcel).title">
            <b>{{ parcelDate(parcel).day }}</b>
            <span>{{ parcelDate(parcel).month }}</span>
          </div>
          <div class="parcel-entry__body min-w-0">
            <div class="parcel-entry__head">
              <b>{{ parcelTitle(parcel) }}</b>
              <span
                class="parcel-entry__state"
                :class="`state-${parcelStatusInfo(parcel.status).class}`"
                >{{ parcelStatusInfo(parcel.status).label }}</span
              >
            </div>
            <div class="parcel-entry__hint">{{ nextStepLabel(parcel.status) }}</div>
          </div>
          <div class="parcel-entry__actions">
            <button
              type="button"
              class="btn-icon btn-primary"
              :data-open="parcel.id"
              :aria-label="`Открыть посылку ${parcelTitle(parcel)}`"
              @click="router.navigate('parcel', { parcelId: String(parcel.id) })"
            >
              <AppIcon name="arrowRight" />
            </button>
            <details class="entry-menu">
              <summary :title="`Действия с посылкой ${parcelTitle(parcel)}`">
                <span class="sr-only">Действия с посылкой {{ parcelTitle(parcel) }}</span>
                <span aria-hidden="true">···</span>
              </summary>
              <div class="entry-menu__list">
                <button
                  type="button"
                  :data-export="parcel.id"
                  :aria-label="`Экспорт в Excel: ${parcelTitle(parcel)}`"
                  @click="exportFromMenu(parcel.id, $event)"
                >
                  <AppIcon name="sheet" /> Экспорт в Excel
                </button>
                <button
                  type="button"
                  class="is-danger"
                  :data-del="parcel.id"
                  :aria-label="`Удалить посылку ${parcelTitle(parcel)}`"
                  @click="
                    closeMenu($event);
                    deleteTarget = parcel.id;
                  "
                >
                  <AppIcon name="trash" /> Удалить
                </button>
              </div>
            </details>
          </div>
        </div>
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

<style src="./parcelList.css"></style>
