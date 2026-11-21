import { orderRepository } from "@/features/orders/infrastructure";
import { itemRepository } from "@/features/items/infrastructure";
import type { HistoryRepository } from "./domain";
import { HistoryService } from "./domain";

// ============================================
// History Service Implementation (composes order + item repos)
// ============================================

export class DexieHistoryService extends HistoryService {
  constructor() {
    super(orderRepository, itemRepository);
  }
}

export const historyService = new DexieHistoryService();

// Adapter to match HistoryRepository interface
export const historyRepository: HistoryRepository = {
  async findAll() {
    return historyService.getAllOrders();
  },
};
