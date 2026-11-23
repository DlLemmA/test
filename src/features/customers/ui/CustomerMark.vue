<script setup lang="ts">
import { computed } from "vue";
import { customerInitials } from "./CustomerPresentation";
import type { Customer } from "../domain";

type MarkVariant = "box" | "list" | "avatar";

const props = withDefaults(defineProps<{ customer?: Customer; variant?: MarkVariant }>(), {
  variant: "box",
});

const initials = computed(() => (props.customer ? customerInitials(props.customer) : "—"));
</script>

<template>
  <span class="customer-mark" :class="`customer-mark--${variant}`" aria-hidden="true">{{
    initials
  }}</span>
</template>
