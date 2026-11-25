<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef } from "vue";
import { useRouter } from "vue-router";
import { parcelCommands } from "@/features/shared/wiring";
import { toastState, uiState } from "@/core/state";
import { getParcelStatements } from "@/features/statements/service";
import ConfirmDrawer from "@/features/shared/ui/ConfirmDrawer.vue";
import ScreenState from "@/features/shared/ui/ScreenState.vue";
import ParcelListItem from "./ui/ParcelListItem.vue";
import { exportParcel } from "./ui/exportParcel";
import { confirmDeleteParcel } from "./ui/deleteParcelCopy";
import {
  filterParcelRows,
  PARCEL_FILTERS,
  toParcelListRows,
  type ParcelFilter,
  type ParcelListRow,
} from "./ui/parcelListFilter";

const router = useRouter();

const rows = shallowRef<ParcelListRow[]>([]);
const deleteTarget = shallowRef<number | null>(null);
const phase = shallowRef<"loading" | "ready" | "error">("loading");
const query = shallowRef("");
const filter = shallowRef<ParcelFilter>("all");

const ordered = computed(() =>
  // Sorts a copy so the source ref stays in insertion order.
  // oxlint-disable-next-line unicorn/no-array-sort
  [...rows.value].sort((a, b) => {
    const ad = a.parcel.shippedAt ? Date.parse(a.parcel.shippedAt) : 0;
    const bd = b.parcel.shippedAt ? Date.parse(b.parcel.shippedAt) : 0;
    return bd - ad;
  }),
);
const visible = computed(() => filterParcelRows(ordered.value, filter.value, query.value));
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
    const found = await getParcelStatements();
    if (!loadScope.signal.aborted) {
      rows.value = toParcelListRows(found);
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

function resetFilters(): void {
  query.value = "";
  filter.value = "all";
}

async function exportFromMenu(id: number): Promise<void> {
  const row = rows.value.find((candidate) => candidate.parcel.id === id);
  if (row) await exportParcel(row.parcel);
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
      <p class="page-head__note">Сначала свежие — черновики в конце</p>
    </header>

    <ScreenState
      v-if="phase === 'loading'"
      kind="loading"
      skeleton="list"
      title="Загружаем посылки…"
    />
    <ScreenState
      v-else-if="phase === 'error'"
      kind="error"
      message="Не удалось загрузить посылки. Проверьте соединение и попробуйте ещё раз."
      action-label="Повторить"
      @action="refresh"
    />
    <template v-else>
      <div class="parcel-filters">
        <label class="visually-hidden" for="parcelSearch">Найти посылку</label>
        <input
          id="parcelSearch"
          v-model="query"
          class="parcel-filters__search"
          type="search"
          autocomplete="off"
          enterkeyhint="search"
          placeholder="Название, № или трек"
          aria-label="Найти посылку"
        />
        <div class="parcel-filters__chips" role="group" aria-label="Фильтр посылок">
          <button
            v-for="chip in PARCEL_FILTERS"
            :key="chip.id"
            type="button"
            class="parcel-chip"
            :class="{ 'is-active': filter === chip.id }"
            :data-filter="chip.id"
            :aria-pressed="filter === chip.id"
            @click="filter = chip.id"
          >
            {{ chip.label }}
          </button>
        </div>
      </div>

      <section v-if="visible.length" class="section parcel-index">
        <ParcelListItem
          v-for="row in visible"
          :key="row.parcel.id"
          :parcel="row.parcel"
          @export="exportFromMenu"
          @delete="deleteTarget = $event"
        />
      </section>
      <ScreenState
        v-else-if="rows.length"
        kind="empty"
        title="Ничего не найдено"
        message="Измените запрос или вернитесь ко всем посылкам."
        action-label="Сбросить фильтры"
        @action="resetFilters"
      />
      <ScreenState
        v-else
        kind="empty"
        title="Посылок пока нет"
        message="Добавьте первую посылку — товары и заказчиков внесёте следующим шагом."
        action-label="Добавить посылку"
        @action="addParcel"
      />
    </template>

    <ConfirmDrawer
      v-model:open="deleteOpen"
      :title="confirmDeleteParcel.title"
      :message="confirmDeleteParcel.message"
      :confirm-text="confirmDeleteParcel.confirmText"
      @confirm="confirmDelete"
    />
  </div>
</template>
