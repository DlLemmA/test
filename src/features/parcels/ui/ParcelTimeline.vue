<script setup lang="ts">
import { computed } from "vue";
import type { Parcel } from "../domain/Parcel";
import { parcelTimeline } from "./parcelTimeline";

const props = defineProps<{ parcel: Parcel }>();
const steps = computed(() => parcelTimeline(props.parcel));
</script>

<template>
  <ol class="status-rail" aria-label="Этапы посылки">
    <li
      v-for="step in steps"
      :key="step.status"
      class="status-rail__step"
      :class="`is-${step.state}`"
      :data-step="step.status"
      :data-state="step.state"
    >
      <span class="status-rail__dot" aria-hidden="true" />
      <span class="status-rail__label">{{ step.label }}</span>
      <time v-if="step.at" class="status-rail__date" :datetime="step.at">{{ step.date }}</time>
      <span v-else class="status-rail__date">—</span>
    </li>
  </ol>
</template>

<style scoped>
.status-rail {
  list-style: none;
  margin: 10px 0 0;
  padding: 0 0 0 2px;
  display: grid;
  gap: 2px;
}
.status-rail__step {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 28px;
  color: var(--color-muted);
  font-size: 12px;
}
.status-rail__step:not(:last-child)::after {
  content: "";
  position: absolute;
  top: 21px;
  bottom: -7px;
  left: 5px;
  border-left: 1px dotted var(--color-line-strong);
}
.status-rail__dot {
  z-index: 1;
  flex: none;
  width: 11px;
  height: 11px;
  border: 1px solid var(--color-line-strong);
  border-radius: 50%;
  background: var(--color-paper);
}
.is-done .status-rail__dot {
  border-color: var(--color-positive);
  background: var(--color-positive);
}
.is-current {
  color: var(--color-ink);
  font-weight: 600;
}
.is-current .status-rail__dot {
  border-color: var(--color-accent);
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-wash);
}
.is-future {
  opacity: 0.55;
}
.status-rail__label {
  flex: 1;
}
.status-rail__date {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
</style>
