<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from "vue";
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
const saving = ref(false);
const error = ref("");
const errorEl = useTemplateRef<HTMLDivElement>("errorEl");

function showError(message: string): void {
  error.value = message;
  void nextTick(() => errorEl.value?.focus());
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.parcel.name ?? "";
    comment.value = props.parcel.comment ?? "";
    boxWeightG.value = props.parcel.boxWeightG == null ? "" : String(props.parcel.boxWeightG);
    shippingCostBYN.value =
      props.parcel.shippingCostBYN == null ? "" : String(props.parcel.shippingCostBYN);
    error.value = "";
  },
  { immediate: true },
);

async function submit(): Promise<void> {
  if (saving.value) return;
  const weight = boxWeightG.value.trim();
  const cost = shippingCostBYN.value.trim();
  if (weight !== "" && (!Number.isFinite(Number(weight)) || Number(weight) < 0)) {
    showError("Вес посылки — число от 0 граммов.");
    return;
  }
  if (cost !== "" && (!Number.isFinite(Number(cost)) || Number(cost) < 0)) {
    showError("Стоимость доставки — число от 0 BYN.");
    return;
  }

  saving.value = true;
  error.value = "";
  try {
    await parcelCommands.updateParcel(props.parcel.id, {
      name: name.value.trim() || null,
      comment: comment.value.trim() || null,
      boxWeightG: weight === "" ? null : Number(weight),
      shippingCostBYN: cost === "" ? null : Number(cost),
    });
    emit("update:open", false);
    emit("saved");
    toastState.add({ message: "Посылка сохранена", type: "success" });
  } catch {
    showError("Не удалось сохранить посылку. Проверьте соединение и попробуйте ещё раз.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDrawer
    :open="open"
    title="Редактировать посылку"
    initial-focus="#parcelName"
    @update:open="emit('update:open', $event)"
  >
    <form id="parcelForm" novalidate @submit.prevent="submit" @input="error = ''">
      <div v-if="error" ref="errorEl" class="inline-error" role="alert" tabindex="-1">
        <span>{{ error }}</span>
        <button type="button" class="text-btn" :disabled="saving" @click="submit">Повторить</button>
      </div>
      <div class="field">
        <label for="parcelName">Название посылки</label>
        <input
          id="parcelName"
          v-model="name"
          name="name"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="sentences"
          enterkeyhint="next"
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
          autocomplete="off"
          autocorrect="off"
          autocapitalize="sentences"
          spellcheck="false"
          enterkeyhint="done"
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
          inputmode="numeric"
          min="0"
          step="1"
          autocomplete="off"
          enterkeyhint="next"
          placeholder="Например, 600"
        />
      </div>
      <div class="field">
        <label for="parcelCost">Стоимость доставки (BYN)</label>
        <input
          id="parcelCost"
          v-model="shippingCostBYN"
          name="shippingCostBYN"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          autocomplete="off"
          enterkeyhint="done"
          placeholder="Стоимость доставки карго"
        />
      </div>
      <div class="actions">
        <button type="submit" class="btn-primary w-full" :disabled="saving">
          {{ saving ? "Сохраняем…" : "Сохранить" }}
        </button>
      </div>
    </form>
  </AppDrawer>
</template>
