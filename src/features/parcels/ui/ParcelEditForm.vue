<script setup lang="ts">
import { ref, watch } from "vue";
import { toastState } from "@/core/state";
import { parcelCommands } from "@/features/shared/wiring";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import type { Parcel } from "../domain";

const props = defineProps<{ open: boolean; parcel: Parcel }>();
const emit = defineEmits<{ "update:open": [value: boolean]; saved: [] }>();

const name = ref("");
const comment = ref("");
const boxWeightG = ref("");
const shippingCostBYN = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.parcel.name ?? "";
    comment.value = props.parcel.comment ?? "";
    boxWeightG.value = props.parcel.boxWeightG == null ? "" : String(props.parcel.boxWeightG);
    shippingCostBYN.value =
      props.parcel.shippingCostBYN == null ? "" : String(props.parcel.shippingCostBYN);
  },
  { immediate: true },
);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Ошибка";
}

async function submit(): Promise<void> {
  try {
    await parcelCommands.updateParcel(props.parcel.id, {
      name: name.value.trim() || null,
      comment: comment.value.trim() || null,
      boxWeightG: boxWeightG.value.trim() === "" ? null : Number(boxWeightG.value),
      shippingCostBYN: shippingCostBYN.value === "" ? null : parseFloat(shippingCostBYN.value),
    });
    emit("update:open", false);
    emit("saved");
    toastState.add({ message: "Посылка сохранена", type: "success" });
  } catch (err) {
    toastState.add({ message: errorMessage(err), type: "error" });
  }
}
</script>

<template>
  <AppDrawer :open="open" title="Редактировать посылку" @update:open="emit('update:open', $event)">
    <form id="parcelForm" @submit.prevent="submit">
      <div class="field">
        <label for="parcelName">Название посылки</label>
        <input
          id="parcelName"
          v-model="name"
          name="name"
          placeholder="Например: Посылка из PDD #5"
        />
      </div>
      <div class="field">
        <label for="parcelCommentInput">Комментарий</label>
        <textarea
          id="parcelCommentInput"
          v-model="comment"
          name="comment"
          rows="8"
          placeholder="Заметки, долги, пожелания — что угодно, кроме самих товаров"
        />
      </div>
      <div class="field">
        <label for="parcelBoxWeight">Вес посылки, г</label>
        <input
          id="parcelBoxWeight"
          v-model="boxWeightG"
          name="boxWeightG"
          type="number"
          min="0"
          step="1"
          placeholder="Например, 600"
        />
      </div>
      <div class="field">
        <label>Стоимость доставки (BYN)</label>
        <input
          v-model="shippingCostBYN"
          name="shippingCostBYN"
          type="number"
          step="0.01"
          placeholder="Стоимость доставки карго"
        />
      </div>
      <div class="actions"><button type="submit">Сохранить</button></div>
    </form>
  </AppDrawer>
</template>
