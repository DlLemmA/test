<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";

defineProps<{ label: string; title?: string }>();
</script>

<template>
  <DropdownMenuRoot v-slot="{ open }">
    <div class="entry-menu" :data-open="String(open)">
      <DropdownMenuTrigger class="entry-menu__trigger" :title="title">
        <span class="sr-only">{{ label }}</span>
        <span aria-hidden="true">···</span>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="entry-menu__list" align="end" :side-offset="6">
          <slot />
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </div>
  </DropdownMenuRoot>
</template>
