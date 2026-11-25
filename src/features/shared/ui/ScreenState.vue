<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

type Kind = "loading" | "error" | "empty";
type Skeleton = "list" | "detail" | "form";

const props = withDefaults(
  defineProps<{
    kind: Kind;
    skeleton?: Skeleton;
    title?: string;
    message?: string;
    actionLabel?: string;
  }>(),
  {
    skeleton: "list",
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
      <div class="screen-state__skeleton" :data-skeleton="skeleton" aria-hidden="true">
        <template v-if="skeleton === 'detail'">
          <span class="screen-state__skeleton-line is-title" />
          <span class="screen-state__skeleton-line is-meta" />
          <span class="screen-state__skeleton-rule" />
          <span class="screen-state__skeleton-line is-long" />
          <span class="screen-state__skeleton-line is-short" />
          <span class="screen-state__skeleton-rule" />
          <span class="screen-state__skeleton-line is-long" />
          <span class="screen-state__skeleton-line is-meta" />
        </template>
        <template v-else-if="skeleton === 'form'">
          <span class="screen-state__skeleton-line is-title" />
          <span class="screen-state__skeleton-field" />
          <span class="screen-state__skeleton-field" />
          <span class="screen-state__skeleton-field is-short" />
          <span class="screen-state__skeleton-action" />
        </template>
        <template v-else>
          <div v-for="row in 3" :key="row" class="screen-state__skeleton-row">
            <span class="screen-state__skeleton-mark" />
            <span class="screen-state__skeleton-body">
              <span class="screen-state__skeleton-line is-title" />
              <span class="screen-state__skeleton-line is-meta" />
            </span>
          </div>
        </template>
      </div>
      <span class="screen-state__title">{{ heading() }}</span>
    </template>
    <template v-else>
      <AppIcon v-if="kind === 'error'" class="screen-state__icon" :name="FALLBACK[kind].icon" />
      <h2 class="screen-state__title">{{ heading() }}</h2>
      <p v-if="body()" class="screen-state__message">{{ body() }}</p>
      <button v-if="actionLabel" type="button" class="btn-secondary" @click="emit('action')">
        {{ actionLabel }}
      </button>
    </template>
  </div>
</template>
