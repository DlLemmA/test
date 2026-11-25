<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { toastState } from "@/core/state";
import { parcelCommands } from "@/features/shared/wiring";

const props = defineProps<{
  parcelId: number;
  comment?: string;
}>();

const savedComment = ref(props.comment ?? "");
const commentDraft = ref<string | null>(null);
const commentFocused = ref(false);
const saving = ref(false);
const error = ref("");
const commentArea = useTemplateRef<HTMLTextAreaElement>("commentArea");
const errorEl = useTemplateRef<HTMLParagraphElement>("errorEl");

watch(
  () => props.comment,
  (value) => {
    savedComment.value = value ?? "";
    if (commentDraft.value === savedComment.value) commentDraft.value = null;
  },
);

const commentValue = computed(() => commentDraft.value ?? savedComment.value);
const dirty = computed(
  () => (commentDraft.value ?? savedComment.value).trim() !== savedComment.value.trim(),
);
const commentRows = computed(() =>
  commentFocused.value ? Math.min(16, Math.max(2, commentValue.value.split("\n").length)) : 1,
);

function resizeComment(): void {
  const area = commentArea.value;
  if (!area) return;
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight}px`;
}

function expandComment(): void {
  if (commentFocused.value) return;
  commentFocused.value = true;
  void resizeComment();
}

function collapseComment(): void {
  commentFocused.value = false;
  if (commentArea.value) commentArea.value.style.height = "";
}

function saveComment(): void {
  if (saving.value) return;
  const next = (commentDraft.value ?? commentArea.value?.value ?? "").trim();
  if (next === savedComment.value) {
    commentDraft.value = null;
    error.value = "";
    return;
  }

  saving.value = true;
  error.value = "";
  parcelCommands
    .updateParcel(props.parcelId, { comment: next || null })
    .then(() => {
      savedComment.value = next;
      commentDraft.value = next;
      toastState.add({ message: "Заметка сохранена", type: "success" });
    })
    .catch(() => {
      // Keep the draft so the visible retry button can save the same text.
      error.value = "Не удалось сохранить заметку. Попробуйте ещё раз.";
      void nextTick(() => errorEl.value?.focus());
    })
    .finally(() => {
      saving.value = false;
    });
}

function blurComment(): void {
  collapseComment();
  if (dirty.value) saveComment();
}

function onInput(event: Event): void {
  commentDraft.value = (event.target as HTMLTextAreaElement).value;
  error.value = "";
  resizeComment();
}
</script>

<template>
  <div id="parcelCommentBlock" class="parcel-comment" :class="{ 'is-expanded': commentFocused }">
    <textarea
      id="parcelCommentText"
      ref="commentArea"
      :value="commentValue"
      class="parcel-comment__text"
      :rows="commentRows"
      placeholder="Заметка о посылке…"
      aria-label="Заметка о посылке"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="sentences"
      spellcheck="false"
      enterkeyhint="done"
      @focus="expandComment"
      @click="expandComment"
      @input="onInput"
      @keydown.esc="($event.target as HTMLTextAreaElement).blur()"
      @blur="blurComment"
    />
    <div v-if="dirty || error" class="parcel-comment__footer">
      <p v-if="error" ref="errorEl" class="field-error" role="alert" tabindex="-1">{{ error }}</p>
      <button type="button" class="btn-secondary" :disabled="saving" @click="saveComment">
        {{ saving ? "Сохраняем…" : "Сохранить" }}
      </button>
    </div>
  </div>
</template>
