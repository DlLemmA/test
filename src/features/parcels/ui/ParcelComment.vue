<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { toastState } from "@/core/state";
import { parcelCommands } from "@/features/shared/wiring";

const props = defineProps<{
  parcelId: number;
  comment?: string;
}>();

const commentDraft = ref<string | null>(null);
const commentFocused = ref(false);
const commentArea = useTemplateRef<HTMLTextAreaElement>("commentArea");

const commentValue = computed(() => commentDraft.value ?? props.comment ?? "");
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

function blurComment(): void {
  collapseComment();
  const next = (commentDraft.value ?? commentArea.value?.value ?? "").trim();
  commentDraft.value = null;
  if (next === (props.comment ?? "")) return;
  void parcelCommands
    .updateParcel(props.parcelId, { comment: next || null })
    .then(() => toastState.add({ message: "Заметка сохранена", type: "success" }))
    .catch((err) => {
      toastState.add({ message: "Не удалось сохранить заметку", type: "error" });
      console.error(err);
    });
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
      @focus="expandComment"
      @click="expandComment"
      @input="
        commentDraft = ($event.target as HTMLTextAreaElement).value;
        resizeComment();
      "
      @keydown.esc="($event.target as HTMLTextAreaElement).blur()"
      @blur="blurComment"
    />
  </div>
</template>
