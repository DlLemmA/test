import { toastState } from "@/core/state";

/** Copy one track code from its own row; confirmations stay at the bottom. */
export async function copyTrack(track: string): Promise<void> {
  const text = track.trim();
  if (!text) {
    toastState.add({ message: "Трек-номер не задан", type: "warn" });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toastState.add({ message: "Трек-номер скопирован", type: "success" });
  } catch {
    toastState.add({ message: "Не удалось скопировать трек-номер", type: "error" });
  }
}
