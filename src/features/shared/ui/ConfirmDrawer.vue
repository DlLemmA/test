<script setup lang="ts">
import AppDrawer from "./AppDrawer.vue";

defineProps<{ open: boolean; title: string; message: string; confirmText: string }>();
const emit = defineEmits<{ "update:open": [value: boolean]; confirm: [] }>();
</script>

<template>
  <AppDrawer
    :open="open"
    :title="title"
    role="alertdialog"
    initial-focus=".drawer-actions .btn-secondary"
    @update:open="emit('update:open', $event)"
  >
    <div class="notice">{{ message }}</div>
    <div class="drawer-actions">
      <button type="button" class="btn-secondary" @click="emit('update:open', false)">
        Отмена
      </button>
      <button type="button" class="btn-danger-solid" @click="emit('confirm')">
        {{ confirmText }}
      </button>
    </div>
  </AppDrawer>
</template>
