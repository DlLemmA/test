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

<style scoped>
/* One loading / confirmed-empty / retryable-error contract for every screen.
   Skeletons mirror the real screen; empty states read as page copy, not cards. */
.screen-state {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.screen-state[data-kind="loading"] {
  align-items: stretch;
  padding: 4px 0 12px;
  text-align: left;
}
.screen-state[data-kind="empty"] {
  align-items: flex-start;
  padding: 16px 2px 12px;
  border-top: 1px solid var(--color-line);
  text-align: left;
}
.screen-state[data-kind="error"] {
  align-items: flex-start;
  padding: 14px 16px;
  border: 1px solid var(--color-line);
  border-left: 3px solid var(--color-negative);
  border-radius: 12px;
  background: var(--color-red-50);
  text-align: left;
}
.screen-state__icon {
  color: var(--color-negative);
}
/* The SVG is injected by AppIcon via v-html, so it carries no scope attribute. */
.screen-state__icon :deep(.icon) {
  inline-size: 24px;
  block-size: 24px;
}
.screen-state__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.screen-state__message {
  max-inline-size: 28rem;
  margin: 0;
  color: var(--color-muted);
  font-size: 13px;
}
.screen-state[data-kind="loading"] .screen-state__title {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 500;
}

.screen-state__skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
  inline-size: 100%;
}
.screen-state__skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--color-line);
}
.screen-state__skeleton-mark {
  flex: none;
  inline-size: 36px;
  block-size: 36px;
  border-radius: 10px;
  background: var(--color-slate-200);
}
.screen-state__skeleton-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}
.screen-state__skeleton-line,
.screen-state__skeleton-field,
.screen-state__skeleton-action {
  border-radius: 999px;
  background: var(--color-slate-200);
}
.screen-state__skeleton-line {
  inline-size: 64%;
  block-size: 10px;
}
.screen-state__skeleton-line.is-title {
  inline-size: 42%;
  block-size: 14px;
}
.screen-state__skeleton-line.is-long {
  inline-size: 92%;
}
.screen-state__skeleton-line.is-short,
.screen-state__skeleton-field.is-short {
  inline-size: 58%;
}
.screen-state__skeleton-rule {
  block-size: 1px;
  background: var(--color-line);
}
.screen-state__skeleton-field {
  inline-size: 100%;
  block-size: 48px;
  border-radius: 10px;
}
.screen-state__skeleton-action {
  inline-size: 140px;
  block-size: 44px;
  border-radius: 12px;
}
.screen-state__skeleton[data-skeleton="detail"] .screen-state__skeleton-line.is-title {
  inline-size: 56%;
  block-size: 22px;
}
.screen-state__skeleton[data-skeleton="detail"] .screen-state__skeleton-line.is-meta {
  inline-size: 38%;
}
.screen-state__skeleton[data-skeleton="form"] .screen-state__skeleton-line.is-title {
  inline-size: 52%;
}
</style>
