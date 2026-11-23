<script setup lang="ts">
import { ref, useTemplateRef, watch } from "vue";
import { toastState } from "@/core/state";
import { parcelCommands } from "@/features/shared/wiring";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import type { Parcel } from "../domain";

const props = defineProps<{ open: boolean; parcel: Parcel }>();
const emit = defineEmits<{ "update:open": [value: boolean]; shipped: [] }>();

const form = useTemplateRef<HTMLFormElement>("form");
const weightInput = useTemplateRef<HTMLInputElement>("weightInput");
const amountInput = useTemplateRef<HTMLInputElement>("amountInput");
const boxWeightG = ref("");
const shippingCostBYN = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    boxWeightG.value = props.parcel.boxWeightG == null ? "" : String(props.parcel.boxWeightG);
    shippingCostBYN.value =
      props.parcel.shippingCostBYN == null ? "" : String(props.parcel.shippingCostBYN);
    weightInput.value?.setCustomValidity("");
    amountInput.value?.setCustomValidity("");
  },
  { immediate: true },
);

function clearValidity(input: HTMLInputElement | null): void {
  input?.setCustomValidity("");
  input?.removeAttribute("aria-invalid");
}

async function submit(): Promise<void> {
  const currentForm = form.value;
  if (!currentForm) return;
  const weight = Number(boxWeightG.value);
  const amount = Number(shippingCostBYN.value);
  const invalidWeight = boxWeightG.value.trim() === "" || !Number.isFinite(weight) || weight <= 0;
  const invalidAmount =
    shippingCostBYN.value.trim() === "" || !Number.isFinite(amount) || amount <= 0;
  weightInput.value?.setCustomValidity(invalidWeight ? "Укажите вес посылки" : "");
  amountInput.value?.setCustomValidity(invalidAmount ? "Укажите сумму доставки" : "");
  weightInput.value?.setAttribute("aria-invalid", String(invalidWeight));
  amountInput.value?.setAttribute("aria-invalid", String(invalidAmount));
  if (invalidWeight || invalidAmount) {
    currentForm.reportValidity();
    (invalidWeight ? weightInput.value : amountInput.value)?.focus();
    return;
  }
  await parcelCommands.shipParcel(props.parcel.id, weight, amount);
  emit("update:open", false);
  emit("shipped");
  toastState.add({ message: "Посылка отправлена", type: "success" });
}
</script>

<template>
  <AppDrawer :open="open" title="Отправить посылку" @update:open="emit('update:open', $event)">
    <form ref="form" id="shipForm" novalidate @submit.prevent="submit">
      <p class="small muted">
        Вес и сумма доставки относятся ко всей посылке. Их можно уточнить при получении.
      </p>
      <div class="field">
        <label for="shipBoxWeight">Вес посылки, г *</label>
        <input
          id="shipBoxWeight"
          ref="weightInput"
          v-model="boxWeightG"
          name="boxWeightG"
          type="number"
          inputmode="numeric"
          min="1"
          step="1"
          required
          placeholder="Например, 600"
          @input="clearValidity(weightInput)"
        />
      </div>
      <div class="field">
        <label for="shipAmount">Сумма доставки, BYN *</label>
        <input
          id="shipAmount"
          ref="amountInput"
          v-model="shippingCostBYN"
          name="shippingCostBYN"
          type="number"
          inputmode="decimal"
          min="0.01"
          step="0.01"
          required
          placeholder="Например, 12.50"
          @input="clearValidity(amountInput)"
        />
      </div>
      <div class="actions">
        <button type="submit" class="btn-primary w-full">
          <AppIcon name="package" /> Отправить
        </button>
      </div>
    </form>
  </AppDrawer>
</template>
