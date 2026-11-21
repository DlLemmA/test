import { Order } from "@/features/orders/domain";

// ============================================
// History Domain (read-only, derived from Orders)
// ============================================

export interface HistoryOrder {
  id: number;
  title: string;
  status: "В сборке" | "Отправлен" | "Получен";
  createdAt: string;
  shippedAt?: string;
  receivedAt?: string;
  boxWeightG?: number;
  shippingCost?: number;
  itemCount: number;
  derivedStatus: "В сборке" | "Отправлен" | "Получен";
  canReceive(): boolean;
  formattedTitle: string;
}

export interface HistoryRepository {
  findAll(): Promise<HistoryOrder[]>;
}

// ============================================
// Domain Service
// ============================================

export class HistoryService {
  constructor(
    private orderRepo: { findAll(): Promise<Order[]> },
    private itemRepo: { findByOrderId(orderId: number): Promise<{ length: number }> },
  ) {}

  async getAllOrders(): Promise<HistoryOrder[]> {
    const orders = await this.orderRepo.findAll();
    const result: HistoryOrder[] = [];

    for (const order of orders) {
      const items = await this.itemRepo.findByOrderId(order.id);
      result.push({
        id: order.id,
        title: order.title,
        status: order.status,
        createdAt: order.createdAt,
        shippedAt: order.shippedAt,
        receivedAt: order.receivedAt,
        boxWeightG: order.boxWeightG,
        shippingCost: order.shippingCost,
        itemCount: items.length,
        derivedStatus: order.derivedStatus,
        canReceive: () => order.canReceive(),
        formattedTitle: order.formattedTitle,
      });
    }

    return result;
  }
}
