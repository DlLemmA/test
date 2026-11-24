<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppDropdownMenu from "@/features/shared/ui/AppDropdownMenu.vue";
import AppDropdownMenuItem from "@/features/shared/ui/AppDropdownMenuItem.vue";
import AppIcon from "@/features/shared/ui/AppIcon.vue";
import { parcelDate } from "./ParcelPresentation";
import { nextStepLabel } from "./ParcelNextStatus";
import { parcelStatusInfo } from "./ParcelStatusInfo";
import type { Parcel } from "../domain";

const props = defineProps<{ parcel: Parcel }>();

const emit = defineEmits<{
  export: [id: number];
  delete: [id: number];
}>();

function parcelTitle(parcel: Parcel): string {
  return parcel.name || `Посылка №${parcel.id}`;
}
</script>

<template>
  <div class="item parcel-entry" :data-status="props.parcel.status">
    <div class="parcel-entry__date" :title="parcelDate(props.parcel).title">
      <b>{{ parcelDate(props.parcel).day }}</b>
      <span>{{ parcelDate(props.parcel).month }}</span>
    </div>
    <div class="parcel-entry__body min-w-0">
      <div class="parcel-entry__head">
        <b>{{ parcelTitle(props.parcel) }}</b>
        <span
          class="parcel-entry__state"
          :class="`state-${parcelStatusInfo(props.parcel.status).class}`"
          >{{ parcelStatusInfo(props.parcel.status).label }}</span
        >
      </div>
      <div class="parcel-entry__hint">{{ nextStepLabel(props.parcel.status) }}</div>
    </div>
    <div class="parcel-entry__actions">
      <RouterLink
        class="btn-icon btn-primary"
        :data-open="props.parcel.id"
        :aria-label="`Открыть посылку ${parcelTitle(props.parcel)}`"
        :to="{ name: 'parcel', params: { parcelId: String(props.parcel.id) } }"
      >
        <AppIcon name="arrowRight" />
      </RouterLink>
      <AppDropdownMenu
        :label="`Действия с посылкой ${parcelTitle(props.parcel)}`"
        :title="`Действия с посылкой ${parcelTitle(props.parcel)}`"
      >
        <AppDropdownMenuItem
          :data-export="props.parcel.id"
          :aria-label="`Экспорт в Excel: ${parcelTitle(props.parcel)}`"
          @select="emit('export', props.parcel.id)"
        >
          <AppIcon name="sheet" /> Экспорт в Excel
        </AppDropdownMenuItem>
        <AppDropdownMenuItem
          class="is-danger"
          :data-del="props.parcel.id"
          :aria-label="`Удалить посылку ${parcelTitle(props.parcel)}`"
          @select="emit('delete', props.parcel.id)"
        >
          <AppIcon name="trash" /> Удалить
        </AppDropdownMenuItem>
      </AppDropdownMenu>
    </div>
  </div>
</template>
