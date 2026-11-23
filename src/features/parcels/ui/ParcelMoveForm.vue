<script setup lang="ts">
import { ref, watch } from "vue";
import { toastState } from "@/core/state";
import { parcelCommands } from "@/features/shared/wiring";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import { parcelItemRepository, parcelRepository } from "../infrastructure";
import type { Parcel } from "../domain";
import { formatDateNumeric } from "./ParcelPresentation";
import { pickerCaretHtml } from "./Picker";

const props = defineProps<{ open: boolean; itemId: number | null }>();
const emit = defineEmits<{ "update:open": [value: boolean]; moved: [] }>();

const drafts = ref<Parcel[]>([]);
const targetId = ref(0);

watch(
  () => [props.open, props.itemId] as const,
  async ([open, itemId]) => {
    if (!open || itemId == null) return;
    const [item, parcels] = await Promise.all([
      parcelItemRepository.findById(itemId),
      parcelRepository.findAll(),
    ]);
    drafts.value = parcels.filter(
      (parcel) => parcel.id !== item?.parcelId && parcel.status === "draft",
    );
    targetId.value = drafts.value[0]?.id ?? 0;
    if (drafts.value.length === 0) {
      toastState.add({ message: "Нет других черновиков для перемещения", type: "warn" });
      emit("update:open", false);
    }
  },
  { immediate: true },
);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Ошибка";
}

async function submit(): Promise<void> {
  if (!props.itemId || !targetId.value) return;
  try {
    await parcelCommands.moveItem(props.itemId, targetId.value);
    emit("update:open", false);
    emit("moved");
    toastState.add({ message: "Товар перемещён", type: "success" });
  } catch (err) {
    toastState.add({ message: errorMessage(err), type: "error" });
  }
}
</script>

<template>
  <AppDrawer :open="open" title="Переместить товар" @update:open="emit('update:open', $event)">
    <form id="moveForm" @submit.prevent="submit">
      <div class="field">
        <label>Выберите посылку</label>
        <div class="picker">
          <select v-model.number="targetId" class="picker__control" name="targetParcel">
            <option v-for="draft in drafts" :key="draft.id" :value="draft.id">
              Посылка №{{ draft.id }} ({{ formatDateNumeric(draft.createdAt) }})
            </option>
          </select>
          <span v-html="pickerCaretHtml" />
        </div>
      </div>
      <div class="actions"><button type="submit">Переместить</button></div>
    </form>
  </AppDrawer>
</template>
