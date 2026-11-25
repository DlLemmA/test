<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { toastState } from "@/core/state";
import { customerRepository } from "@/features/customers/infrastructure";
import type { Customer } from "@/features/customers/domain";
import { customerLabel } from "@/features/customers/ui/CustomerPresentation";
import { parcelCommands } from "@/features/shared/wiring";
import AppDrawer from "@/features/shared/ui/AppDrawer.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import WizardSteps from "@/features/shared/ui/WizardSteps.vue";
import type { WizardStep } from "@/features/shared/ui/wizardSteps";
import { parcelItemRepository } from "../infrastructure";
import type { Parcel, ParcelItem, ParcelItemUpdateInput } from "../domain";
import { UNIT_OPTIONS, type UnitValue } from "./ParcelPresentation";
import { pickerCaretHtml } from "./Picker";

type ItemFormStep = "main" | "tracks" | "weights";

const props = defineProps<{
  open: boolean;
  itemId: number | null;
  parcelId: number;
  parcelStatus: Parcel["status"];
  initialStep: ItemFormStep;
}>();
const emit = defineEmits<{ "update:open": [value: boolean]; saved: [] }>();

const form = useTemplateRef<HTMLFormElement>("form");
const completeCheckbox = useTemplateRef<HTMLInputElement>("completeCheckbox");
const trackInputs = useTemplateRef<HTMLInputElement[]>("trackInputs");

const item = ref<ParcelItem | null>(null);
const customers = ref<Customer[]>([]);
const isNew = ref(true);
const loading = ref(false);
const step = ref<ItemFormStep>("main");
const name = ref("");
const customerId = ref(0);
const priceCNY = ref("");
const priceBYN = ref("");
const quantity = ref("1");
const unit = ref<UnitValue>("pcs");
const tracks = ref<string[]>([""]);
const weights = ref<Record<string, string>>({});
const tracksCompleted = ref(false);

/** Tracks are entry data: editable while awaiting distribution or receipt. */
const canEditTracks = computed(
  () => !isNew.value && (props.parcelStatus === "draft" || props.parcelStatus === "shipped"),
);
const canViewTracks = computed(
  () => canEditTracks.value || (item.value?.trackNumbers.length ?? 0) > 0,
);
const canEditWeights = computed(() => !isNew.value && props.parcelStatus === "received");
const customerOptions = computed(() =>
  customers.value.map((customer) => ({
    value: customer.id,
    label: customerLabel(customer),
  })),
);
const weightRows = computed(() =>
  tracks.value
    .map((track) => track.trim())
    .filter(Boolean)
    .map((track, idx) => ({ track, idx })),
);
/** Every step stays visible; an unused track step is locked, a used one stays readable. */
const steps = computed<WizardStep[]>(() => {
  const trackTitle = !canViewTracks.value
    ? "Треки появятся после сохранения товара"
    : canEditTracks.value
      ? undefined
      : "Треки доступны только для просмотра";
  const weightTitle = isNew.value
    ? "Веса можно указать после сохранения товара"
    : canEditWeights.value
      ? undefined
      : "Веса доступны на этапе получения";
  return [
    { id: "main", label: "Товар" },
    { id: "tracks", label: "Треки", disabled: !canViewTracks.value, title: trackTitle },
    { id: "weights", label: "Веса", disabled: !canEditWeights.value, title: weightTitle },
  ];
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Ошибка";
}

function defaultStep(): ItemFormStep {
  if (isNew.value) return "main";
  if (props.initialStep === "tracks" && !canViewTracks.value) return "main";
  if (props.initialStep === "weights" && !canEditWeights.value) {
    return canViewTracks.value ? "tracks" : "main";
  }
  return props.initialStep;
}

watch(
  () => [props.open, props.itemId] as const,
  async ([open, itemId]) => {
    if (!open) return;
    loading.value = true;
    try {
      const [loadedItem, allCustomers] = await Promise.all([
        itemId ? parcelItemRepository.findById(itemId) : Promise.resolve(null),
        customerRepository.findAll(),
      ]);
      customers.value = allCustomers;
      item.value = loadedItem ?? null;
      isNew.value = !loadedItem;
      name.value = loadedItem?.name ?? "";
      customerId.value = loadedItem?.customerId ?? allCustomers[0]?.id ?? 0;
      priceCNY.value = loadedItem ? String(loadedItem.priceCNY) : "";
      priceBYN.value = loadedItem ? String(loadedItem.priceBYN) : "";
      quantity.value = String(loadedItem?.quantity ?? 1);
      unit.value = loadedItem?.unit ?? "pcs";
      tracks.value = loadedItem?.trackNumbers.length ? [...loadedItem.trackNumbers] : [""];
      weights.value = Object.fromEntries(
        (loadedItem?.trackNumbers ?? []).map((track, idx) => [
          track,
          String(loadedItem?.weightsG[idx] ?? ""),
        ]),
      );
      tracksCompleted.value = loadedItem?.tracksCompleted ?? false;
      step.value = defaultStep();
      await nextTick();
      focusStepPanel();
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function focusStepPanel(): void {
  form.value
    ?.querySelector<HTMLElement>(
      `[data-panel="${step.value}"] input, [data-panel="${step.value}"] select, [data-panel="${step.value}"] button`,
    )
    ?.focus();
}

function goTo(next: ItemFormStep): void {
  if (next === "tracks" && !canViewTracks.value) return;
  if (next === "weights" && !canEditWeights.value) return;
  if (next === "tracks" && canEditTracks.value && form.value && !form.value.reportValidity())
    return;
  step.value = next;
  void nextTick(focusStepPanel);
}

function navigateStep(id: string): void {
  goTo(id as ItemFormStep);
}

function addTrackRow(): void {
  tracks.value.push("");
  void nextTick(() => trackInputs.value?.at(-1)?.focus());
}

function removeTrackRow(index: number): void {
  if (tracks.value.length > 1) tracks.value.splice(index, 1);
  else tracks.value[index] = "";
}

function setCompleteValidity(message: string): void {
  completeCheckbox.value?.setCustomValidity(message);
  if (message) completeCheckbox.value?.setAttribute("aria-invalid", "true");
  else completeCheckbox.value?.removeAttribute("aria-invalid");
}

function onTracksInput(): void {
  setCompleteValidity("");
}

function onCompleteChange(): void {
  if (!tracksCompleted.value) {
    setCompleteValidity("");
    return;
  }
  const hasEmpty = tracks.value.some((track) => !track.trim());
  setCompleteValidity(hasEmpty ? "Заполните все трек-номера" : "");
  if (hasEmpty) completeCheckbox.value?.reportValidity();
}

async function submit(): Promise<void> {
  const currentForm = form.value;
  if (!currentForm || !currentForm.reportValidity()) return;

  const rawData = {
    parcelId: props.parcelId,
    name: name.value.trim() || "",
    customerId: Number(customerId.value),
    priceCNY: Number(priceCNY.value) || 0,
    priceBYN: Number(priceBYN.value) || 0,
    quantity: Number(quantity.value) || 1,
    unit: unit.value,
  };
  const data: ParcelItemUpdateInput = { ...rawData };
  const cleanTracks = tracks.value.map((track) => track.trim()).filter(Boolean);
  const hasEmptyTrack = tracks.value.some((track) => !track.trim());

  if (canEditTracks.value && tracksCompleted.value && hasEmptyTrack) {
    setCompleteValidity("Заполните все трек-номера");
    completeCheckbox.value?.reportValidity();
    return;
  }
  if (
    canEditTracks.value &&
    (cleanTracks.length > 0 || (item.value?.trackNumbers.length ?? 0) > 0)
  ) {
    data.trackNumbers = cleanTracks;
  }
  if (canEditWeights.value && item.value) {
    data.weightsG = item.value.trackNumbers.map((track) => Number(weights.value[track] ?? 0) || 0);
  }

  try {
    if (isNew.value) {
      await parcelCommands.commitBatch(props.parcelId, [rawData]);
    } else if (item.value) {
      const { parcelId: _, ...updateData } = data;
      await parcelCommands.updateItem(item.value.id, updateData);
      if (canEditTracks.value) {
        await parcelCommands.updateItem(item.value.id, {
          tracksCompletedAt: tracksCompleted.value ? new Date().toISOString() : undefined,
        });
      }
    }
    emit("update:open", false);
    emit("saved");
    toastState.add({ message: "Товар сохранён", type: "success" });
  } catch (err) {
    toastState.add({ message: errorMessage(err), type: "error" });
  }
}
</script>

<template>
  <AppDrawer
    :open="open"
    :title="isNew ? 'Новый товар' : 'Редактировать товар'"
    @update:open="emit('update:open', $event)"
  >
    <form
      v-if="!loading"
      ref="form"
      id="itemForm"
      class="item-wizard"
      novalidate
      @submit.prevent="submit"
    >
      <WizardSteps
        v-if="steps.length > 1"
        :steps="steps"
        :current="step"
        label="Шаги редактирования товара"
        @navigate="navigateStep"
      />

      <div
        class="item-wizard__panel grid grid-cols-2 gap-3"
        data-panel="main"
        :hidden="step !== 'main'"
      >
        <div class="field col-span-2">
          <label for="itemName">Название *</label>
          <input id="itemName" v-model="name" name="name" required autocomplete="off" />
        </div>
        <div class="field col-span-2">
          <label for="itemCustomer">Заказчик *</label>
          <div class="picker">
            <select
              id="itemCustomer"
              v-model.number="customerId"
              class="picker__control"
              name="customer_id"
              required
            >
              <option v-for="option in customerOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <span v-html="pickerCaretHtml" />
          </div>
        </div>
        <div class="field">
          <label for="itemPriceCNY">Цена за всю позицию (CNY) *</label>
          <input
            id="itemPriceCNY"
            v-model="priceCNY"
            name="priceCNY"
            type="number"
            step="0.01"
            required
          />
        </div>
        <div class="field">
          <label for="itemPriceBYN">Цена за всю позицию (BYN) *</label>
          <input
            id="itemPriceBYN"
            v-model="priceBYN"
            name="priceBYN"
            type="number"
            step="0.01"
            required
          />
        </div>
        <div class="field">
          <label for="itemQuantity">Количество *</label>
          <input
            id="itemQuantity"
            v-model="quantity"
            name="quantity"
            type="number"
            step="1"
            min="1"
            required
          />
        </div>
        <div class="field">
          <label for="itemUnit">Единица</label>
          <div class="picker">
            <select id="itemUnit" v-model="unit" class="picker__control" name="unit">
              <option v-for="option in UNIT_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <span v-html="pickerCaretHtml" />
          </div>
        </div>
        <div class="item-wizard__actions col-span-2">
          <button
            v-if="!isNew"
            type="button"
            class="btn-secondary"
            data-goto="tracks"
            :disabled="!canViewTracks"
            enterkeyhint="next"
            @click="goTo('tracks')"
          >
            {{ canEditTracks ? "Далее: треки" : "Посмотреть треки" }}
          </button>
          <button
            v-if="!isNew"
            type="button"
            class="btn-secondary"
            data-goto="weights"
            :disabled="!canEditWeights"
            enterkeyhint="next"
            @click="goTo('weights')"
          >
            Далее: веса
          </button>
          <button type="submit" class="btn-primary" enterkeyhint="done">
            {{ isNew ? "Добавить" : "Сохранить" }}
          </button>
        </div>
      </div>

      <div
        class="item-wizard__panel"
        :class="{ 'is-locked': !canEditTracks }"
        data-panel="tracks"
        :hidden="step !== 'tracks'"
      >
        <p class="item-wizard__context"><span>Товар</span> <b>{{ name }}</b></p>
        <fieldset class="item-wizard__tracks" :disabled="!canEditTracks">
          <legend>Трек-номера</legend>
          <div class="grid gap-2" data-track-rows @input="onTracksInput">
            <div v-for="(track, idx) in tracks" :key="idx" class="item-track-row" data-track-row>
              <div class="field">
                <label :for="`itemTrack${idx}`" data-track-label>Трек {{ idx + 1 }}</label>
                <input
                  :id="`itemTrack${idx}`"
                  ref="trackInputs"
                  v-model="tracks[idx]"
                  name="track"
                  :placeholder="`Трек ${idx + 1}`"
                  autocomplete="off"
                  autocapitalize="none"
                  autocorrect="off"
                  spellcheck="false"
                />
              </div>
              <button
                type="button"
                class="track-remove"
                data-remove-track
                :hidden="tracks.length === 1"
                :disabled="!canEditTracks"
                @click="removeTrackRow(idx)"
              >
                <span class="sr-only" data-remove-label>Удалить трек {{ idx + 1 }}</span>
                <AppIcon name="x" />
              </button>
            </div>
          </div>
          <button
            type="button"
            class="text-btn"
            data-add-track-row
            :disabled="!canEditTracks"
            @click="addTrackRow"
          >
            <AppIcon name="plus" /> Добавить трек
          </button>
        </fieldset>
        <label class="pay-summary item-wizard__complete" :class="{ 'is-locked': !canEditTracks }">
          <input
            ref="completeCheckbox"
            v-model="tracksCompleted"
            type="checkbox"
            class="pay-summary__input"
            name="tracksCompleted"
            :disabled="!canEditTracks"
            @change="onCompleteChange"
          />
          <span class="pay-summary__body">
            <span class="pay-summary__label">Треки заполнены</span>
          </span>
        </label>
        <div class="item-wizard__actions">
          <button type="button" class="text-btn" data-goto="main" @click="goTo('main')">
            Назад
          </button>
          <button type="submit" class="btn-primary" enterkeyhint="done">Сохранить</button>
        </div>
      </div>

      <div
        class="item-wizard__panel"
        :class="{ 'is-locked': !canEditWeights }"
        data-panel="weights"
        :hidden="step !== 'weights'"
      >
        <p class="item-wizard__context"><span>Товар</span> <b>{{ name }}</b></p>
        <fieldset class="item-wizard__weights" :disabled="!canEditWeights">
          <legend>Веса треков</legend>
          <div class="grid gap-2" data-weight-rows>
            <div v-if="weightRows.length === 0" class="empty">Сначала добавьте трек-номера</div>
            <div
              v-for="row in weightRows"
              :key="row.track"
              class="weight-row"
              data-weight-row
              :data-track="row.track"
            >
              <span class="weight-row__code">{{ row.idx + 1 }}. {{ row.track }}</span>
              <div class="field">
                <label :for="`itemWeight${row.idx}`">Вес {{ row.idx + 1 }}, г</label>
                <input
                  :id="`itemWeight${row.idx}`"
                  v-model="weights[row.track]"
                  name="weight"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  placeholder="г"
                />
              </div>
            </div>
          </div>
        </fieldset>
        <div class="item-wizard__actions">
          <button type="button" class="text-btn" data-goto="main" @click="goTo('main')">
            Назад
          </button>
          <button type="submit" class="btn-primary" enterkeyhint="done">Сохранить</button>
        </div>
      </div>
    </form>
  </AppDrawer>
</template>
