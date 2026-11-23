<script setup lang="ts">
// Vue shell around the existing combobox mount seam. The imperative module
// keeps its ids, list keyboard handling and touch fix; this component owns only
// the host element and the lifetime, so the wizard can treat it as a component.
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import type { Customer } from "@/features/customers/domain";
import {
  mountCustomerCombo,
  type CustomerComboHandle,
  type CustomerComboSnapshot,
} from "../customerCombo/CustomerCombo";

const props = defineProps<{ customers: Customer[]; selectedCustomerId: number | null }>();
const host = useTemplateRef<HTMLDivElement>("host");
let handle: CustomerComboHandle | null = null;

onMounted(() => {
  if (!host.value) return;
  handle = mountCustomerCombo(host.value, {
    customers: props.customers,
    selectedCustomerId: props.selectedCustomerId,
  });
});

onBeforeUnmount(() => {
  handle?.dispose();
  handle = null;
});

async function commit(): Promise<boolean> {
  return handle ? handle.commit() : false;
}

function focus(): void {
  handle?.focus();
}

function selectedCustomer(): Customer | null {
  return handle?.selectedCustomer() ?? null;
}

function snapshot(): CustomerComboSnapshot {
  return (
    handle?.snapshot() ?? {
      customers: props.customers,
      selectedCustomerId: props.selectedCustomerId,
    }
  );
}

defineExpose({ commit, focus, selectedCustomer, snapshot });
</script>

<template>
  <div ref="host" />
</template>
