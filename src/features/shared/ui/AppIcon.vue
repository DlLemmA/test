<script setup lang="ts">
import { computed } from "vue";
import { I } from "@/core/utils";

type IconName = keyof typeof I;

const props = defineProps<{ name: IconName }>();

// I is a map of compile-time SVG constants from our own source, never user
// input. This is the single trusted boundary for v-html in Vue views.
const svg = computed(() => I[props.name]);
</script>

<template>
  <span aria-hidden="true" v-html="svg" />
</template>
