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

<style scoped>
/* One step navigation for the batch wizard and the item wizard */
.wizard-steps {
  padding: 4px 0;
}
.item-wizard__steps {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.item-wizard__steps li {
  position: relative;
}
.item-wizard__steps li + li::before {
  content: "";
  position: absolute;
  inset-inline-start: -10px;
  top: 50%;
  inline-size: 10px;
  block-size: 1px;
  background: var(--color-line-strong);
}
.wizard-step {
  display: flex;
  align-items: center;
  gap: 6px;
  min-block-size: 32px;
  margin: 0;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 12px;
}
.wizard-step:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.wizard-step__dot {
  display: grid;
  place-items: center;
  inline-size: 22px;
  block-size: 22px;
  border: 1px solid var(--color-line-strong);
  border-radius: 50%;
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}
.wizard-step.is-active {
  color: var(--color-ink);
  font-weight: 650;
}
.wizard-step.is-active .wizard-step__dot {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}
.wizard-step.is-done {
  color: var(--color-ink-soft);
}
.wizard-step.is-done .wizard-step__dot {
  border-color: var(--color-accent);
  color: var(--color-accent-strong);
}
.wizard-step:disabled,
.wizard-step.is-locked {
  cursor: not-allowed;
  opacity: 0.55;
}
.wizard-step:disabled .wizard-step__dot,
.wizard-step.is-locked .wizard-step__dot {
  border-style: dashed;
}
@media (pointer: coarse) {
  .wizard-step {
    min-block-size: 44px;
    min-inline-size: 44px;
  }
}
</style>
