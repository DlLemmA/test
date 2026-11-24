<script setup lang="ts">
import type { WizardStep } from "./wizardSteps";

const props = defineProps<{
  steps: readonly WizardStep[];
  current: string;
  label: string;
}>();

const emit = defineEmits<{ navigate: [id: string] }>();

function state(step: WizardStep): "done" | "active" | "todo" {
  const index = props.steps.findIndex((candidate) => candidate.id === step.id);
  const active = props.steps.findIndex((candidate) => candidate.id === props.current);
  if (index === active) return "active";
  return index < active ? "done" : "todo";
}

function select(step: WizardStep): void {
  if (!step.disabled) emit("navigate", step.id);
}
</script>

<template>
  <nav class="wizard-steps" :aria-label="props.label">
    <ol class="item-wizard__steps">
      <li v-for="(step, index) in props.steps" :key="step.id">
        <button
          type="button"
          class="wizard-step"
          :class="{
            'is-active': state(step) === 'active',
            'is-done': state(step) === 'done',
            'is-locked': step.disabled,
          }"
          :data-step="step.id"
          :data-step-back="step.backValue"
          :disabled="step.disabled"
          :aria-disabled="step.disabled || undefined"
          :aria-current="state(step) === 'active' ? 'step' : undefined"
          :title="step.title"
          @click="select(step)"
        >
          <span class="wizard-step__dot" aria-hidden="true">{{ index + 1 }}</span>
          <span class="wizard-step__label">{{ step.label }}</span>
        </button>
      </li>
    </ol>
  </nav>
</template>
