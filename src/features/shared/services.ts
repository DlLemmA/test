import { customerRepository } from "@/features/customers/infrastructure";
import { orderRepository, itemRepository } from "@/features/orders/infrastructure";
import { historyService } from "@/features/history/infrastructure";
import { CustomerService } from "@/features/customers/domain";
import { OrderService, ItemService, calculateOrder } from "@/features/orders/domain";
import { Customer } from "@/features/customers/domain";
import { Order, Item } from "@/features/orders/domain";
import type { OrderCalculation } from "@/features/orders/domain";

// ============================================
// Application Services (orchestrate domain services)
// ============================================

// Singleton instances
export const customerService = new CustomerService(customerRepository);
export const orderService = new OrderService(orderRepository, itemRepository);
export const itemService = new ItemService(itemRepository, orderRepository);

// ============================================
// High-level use cases
// ============================================

export async function initializeApp(): Promise<void> {
  // Ensure self customer exists on first run
  const selfCustomer = await customerService.getSelfCustomer();
  if (!selfCustomer) {
    // Will be created via UI prompt
    return;
  }
}

export async function getCurrentOrderWithCalculation(): Promise<{
  order: Order;
  items: Item[];
  calculation: OrderCalculation;
  customers: Customer[];
} | null> {
  const result = await orderService.getCurrentOrder();
  if (!result) return null;

  const customers = await customerRepository.findAll();
  const calculation = calculateOrder(result.order, result.items, customers);

  return {
    order: result.order,
    items: result.items,
    calculation,
    customers,
  };
}

export async function getOrderWithCalculation(orderId: number): Promise<{
  order: Order;
  items: Item[];
  calculation: OrderCalculation;
  customers: Customer[];
} | null> {
  const result = await orderService.getOrderWithItems(orderId);
  if (!result) return null;

  const customers = await customerRepository.findAll();
  const calculation = calculateOrder(result.order, result.items, customers);

  return {
    order: result.order,
    items: result.items,
    calculation,
    customers,
  };
}

export async function getHistoryOrders(): Promise<
  {
    order: Order;
    itemCount: number;
  }[]
> {
  const orders = await historyService.getAllOrders();
  // Convert HistoryOrder to Order-compatible shape
  return orders.map((o) => ({
    order: o as unknown as Order,
    itemCount: o.itemCount,
  }));
}

export async function createCustomer(name: string): Promise<Customer> {
  await customerService.validateUniqueName(name);
  return customerRepository.save(Customer.create({ name, isSelf: false }));
}

export async function createSelfCustomer(name: string): Promise<Customer> {
  return customerService.ensureSelfCustomerExists(name);
}

export async function createNewOrder(title?: string): Promise<Order> {
  const orderTitle =
    title ||
    `Заказ от ${new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  return orderService.createOrder(orderTitle);
}

export async function shipOrder(orderId: number): Promise<Order> {
  return orderService.shipOrder(orderId);
}

export async function receiveOrder(orderId: number): Promise<Order> {
  return orderService.receiveOrder(orderId);
}

export async function returnOrderToAssembly(orderId: number): Promise<Order> {
  return orderService.returnToAssembly(orderId);
}

export async function weighItem(itemId: number, weightG: number): Promise<Item> {
  return itemService.weighItem(itemId, weightG);
}

export async function moveItemToAnotherOrder(itemId: number): Promise<void> {
  return itemService.moveItem(itemId);
}

export async function deleteOrder(orderId: number): Promise<void> {
  return orderRepository.delete(orderId);
}

export async function deleteItem(itemId: number): Promise<void> {
  return itemRepository.delete(itemId);
}
