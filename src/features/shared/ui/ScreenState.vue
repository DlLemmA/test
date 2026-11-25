<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

type Kind = "loading" | "error" | "empty";

const props = withDefaults(
  defineProps<{
    kind: Kind;
    title?: string;
    message?: string;
    actionLabel?: string;
  }>(),
  {
    title: undefined,
    message: undefined,
    actionLabel: undefined,
  },
);

const emit = defineEmits<{ action: [] }>();

const FALLBACK = {
  loading: { title: "Загружаем данные…", message: "", icon: "info" },
  error: {
    title: "Не удалось загрузить",
    message: "Проверьте соединение и попробуйте ещё раз.",
    icon: "alertTriangle",
  },
  empty: { title: "Пока пусто", message: "", icon: "inbox" },
} as const;

function heading(): string {
  return props.title ?? FALLBACK[props.kind].title;
}

function body(): string {
  return props.message ?? FALLBACK[props.kind].message;
}
</script>

<template>
  <div
    class="screen-state"
    :data-kind="kind"
    :role="kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
  >
    <template v-if="kind === 'loading'">
      <span class="screen-state__line is-long" aria-hidden="true" />
      <span class="screen-state__line" aria-hidden="true" />
      <span class="screen-state__line is-short" aria-hidden="true" />
      <span class="screen-state__title">{{ heading() }}</span>
    </template>
    <template v-else>
      <AppIcon class="screen-state__icon" :name="FALLBACK[kind].icon" />
      <h2 class="screen-state__title">{{ heading() }}</h2>
      <p v-if="body()" class="screen-state__message">{{ body() }}</p>
      <button v-if="actionLabel" type="button" class="btn-secondary" @click="emit('action')">
        {{ actionLabel }}
      </button>
    </template>
  </div>
</template>
