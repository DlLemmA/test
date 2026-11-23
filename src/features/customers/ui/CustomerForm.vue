<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import { customerService } from "@/features/shared/wiring";
import type { Customer } from "../domain";

const props = defineProps<{ open: boolean; customer?: Customer; isNew: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean]; saved: [] }>();

const title = computed(() => (props.isNew ? "Новый заказчик" : "Редактировать заказчика"));
const name = ref("");
const isSelf = ref(false);
const error = ref("");
const nameInput = useTemplateRef<HTMLInputElement>("nameInput");

// One component instance serves "add" and every "edit", so its draft has to
// be reset from the current props each time the drawer opens.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.customer?.name ?? "";
    isSelf.value = props.customer?.isSelf ?? false;
    error.value = "";
    nameInput.value?.setCustomValidity("");
  },
  { immediate: true },
);

function showError(message: string): void {
  error.value = message;
  nameInput.value?.setCustomValidity(message);
  nameInput.value?.focus();
}

function clearError(): void {
  error.value = "";
  nameInput.value?.setCustomValidity("");
}

async function submit(): Promise<void> {
  const trimmed = name.value.trim();
  if (!trimmed) {
    showError("Укажите имя заказчика");
    return;
  }

  try {
    if (props.isNew) {
      await customerService.createCustomer({ name: trimmed, isSelf: isSelf.value });
    } else if (props.customer) {
      await customerService.updateCustomer(props.customer.id, {
        name: trimmed,
        isSelf: isSelf.value,
      });
    }
    emit("saved");
  } catch (caught) {
    showError(caught instanceof Error ? caught.message : "Не удалось сохранить заказчика");
  }
}
</script>

<template>
  <AppDrawer :open="open" :title="title" @update:open="emit('update:open', $event)">
    <form
      id="customerForm"
      novalidate
      :aria-label="title"
      data-reka-swipe-ignore
      @submit.prevent="submit"
    >
      <div class="field">
        <label for="customerName">Имя *</label>
        <input
          id="customerName"
          ref="nameInput"
          v-model="name"
          name="name"
          type="text"
          required
          autocomplete="name"
          autofocus
          enterkeyhint="done"
          aria-describedby="customerNameError"
          :aria-invalid="error ? 'true' : undefined"
          placeholder="Иван"
          @input="clearError"
          @change="clearError"
        />
        <span id="customerNameError" class="field-error" :hidden="!error">{{ error }}</span>
      </div>
      <div class="field field-check">
        <input id="customerSelf" v-model="isSelf" name="is_self" type="checkbox" />
        <label for="customerSelf">Это я</label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary w-full">
          {{ isNew ? "Добавить" : "Сохранить" }}
        </button>
      </div>
    </form>
  </AppDrawer>
</template>
