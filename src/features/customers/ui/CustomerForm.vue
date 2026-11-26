<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import { customerService } from "@/features/shared/wiring";
import type { Customer } from "../domain";

const props = defineProps<{ open: boolean; customer?: Customer; isNew: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean]; saved: [] }>();

const title = computed(() => (props.isNew ? "Новый заказчик" : "Редактировать заказчика"));
const name = ref("");
const isSelf = ref(false);
const error = ref("");
const saving = ref(false);
const nameInput = useTemplateRef<HTMLInputElement>("nameInput");
const errorEl = useTemplateRef<HTMLDivElement>("errorEl");

// One component instance serves "add" and every "edit", so its draft has to
// be reset from the current props each time the drawer opens.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = props.customer?.name ?? "";
    isSelf.value = props.customer?.isSelf ?? false;
    error.value = "";
  },
  { immediate: true },
);

function showError(message: string): void {
  error.value = message;
  nameInput.value?.focus();
}

function clearError(): void {
  error.value = "";
}

function showSaveError(message: string): void {
  error.value = message;
  void nextTick(() => errorEl.value?.focus());
}

async function submit(): Promise<void> {
  if (saving.value) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    showError("Укажите имя заказчика");
    return;
  }

  saving.value = true;
  error.value = "";
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
  } catch {
    showSaveError("Не удалось сохранить заказчика. Проверьте соединение и попробуйте ещё раз.");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDrawer
    :open="open"
    :title="title"
    initial-focus="#customerName"
    @update:open="emit('update:open', $event)"
  >
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
        <span
          id="customerNameError"
          class="field-error"
          :hidden="!error || error !== 'Укажите имя заказчика'"
          >{{ error }}</span
        >
        <div
          v-if="error && error !== 'Укажите имя заказчика'"
          ref="errorEl"
          class="inline-error"
          role="alert"
          tabindex="-1"
        >
          <span>{{ error }}</span>
          <button type="button" class="text-btn" :disabled="saving" @click="submit">
            Повторить
          </button>
        </div>
      </div>
      <div class="field field-check">
        <input id="customerSelf" v-model="isSelf" name="is_self" type="checkbox" />
        <label for="customerSelf">Это я</label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary w-full" :disabled="saving">
          {{ saving ? "Сохраняем…" : isNew ? "Добавить" : "Сохранить" }}
        </button>
      </div>
    </form>
  </AppDrawer>
</template>

<style scoped>
.field-check {
  display: flex;
  align-items: center;
  gap: 10px;
}
.field-check input {
  width: 20px;
  min-height: 0;
  padding: 0;
  border-radius: 6px;
  accent-color: var(--color-accent);
}
.field-check label {
  margin: 0;
  font-weight: 600;
}
#customerName[aria-invalid="true"] {
  border-color: var(--color-negative);
  background: #fff0f0;
}
</style>
