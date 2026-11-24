<script setup lang="ts">
import { DropdownMenuItem } from "reka-ui";

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <DropdownMenuItem
    as="button"
    type="button"
    :disabled="disabled"
    @select="
      (event) => {
        if (disabled) event.preventDefault();
        else emit('select');
      }
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
