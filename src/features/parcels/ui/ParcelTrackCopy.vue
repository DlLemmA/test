<script setup lang="ts">
import { computed } from "vue";
import { useEventListener, useSupported } from "@vueuse/core";
import { toastState } from "@/core/state";
import AppIcon from "@/features/shared/ui/AppIcon.vue";

const props = defineProps<{ trackNumbers: string[] }>();

async function copyTracks(button: HTMLElement, source: HTMLElement): Promise<void> {
  const text = source instanceof HTMLTextAreaElement ? source.value : source.innerText.trim();
  if (!text) {
    toastState.add({ message: "В посылке нет трек-номеров", type: "warn" });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toastState.add({ message: "Трек-номера скопированы", type: "success" });
  } catch {
    toastState.add({ message: "Не удалось скопировать трек-номера", type: "error" });
  }
}

function onCopyCommand(event: Event): void {
  const commandEvent = event as Event & { command?: string; source?: HTMLElement };
  if (commandEvent.command !== "--copy-tracks") return;
  const source = commandEvent.target as HTMLElement | null;
  if (source) void copyTracks(commandEvent.source as HTMLElement, source);
}

function onCopyFallback(event: MouseEvent): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
    'button[command="--copy-tracks"]',
  );
  if (!button) return;
  const source = document.getElementById(button.getAttribute("commandfor") || "");
  if (source) void copyTracks(button, source);
}

const hasCommandEvent = useSupported(() => "CommandEvent" in window);
const copyFallbackTarget = computed(() => (hasCommandEvent.value ? null : document));
useEventListener(document, "command", onCopyCommand, { capture: true });
useEventListener(copyFallbackTarget, "click", onCopyFallback);
</script>

<template>
  <button
    type="button"
    class="text-btn"
    id="copyParcelTracks"
    command="--copy-tracks"
    commandfor="parcelTracksSource"
  >
    <span class="sr-only">Скопировать трек-номера</span>
    <span aria-hidden="true"><AppIcon name="copy" /> Трек-номера</span>
  </button>
  <textarea
    id="parcelTracksSource"
    class="sr-only"
    readonly
    tabindex="-1"
    aria-hidden="true"
    :value="props.trackNumbers.join('\n')"
  />
</template>
