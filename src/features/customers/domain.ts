import { z } from "zod";
import type { CustomerRow } from "@/core/database";

// ============================================
// Zod Schemas (boundary validation)
// ============================================

export const CustomerCreateSchema = z.object({
  name: z.string().min(1, "Имя обязательно").max(100),
  isSelf: z.boolean().default(false),
});

export const CustomerUpdateSchema = CustomerCreateSchema.partial();

export type CustomerCreateInput = z.infer<typeof CustomerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof CustomerUpdateSchema>;

// ============================================
// Domain Entity
// ============================================

export class Customer {
  readonly id: number;
  readonly name: string;
  readonly isSelf: boolean;

  private constructor(id: number, name: string, isSelf: boolean) {
    this.id = id;
    this.name = name;
    this.isSelf = isSelf;
  }

  static create(input: CustomerCreateInput): Customer {
    // Validation happens at boundary via Zod
    return new Customer(0, input.name, input.isSelf);
  }

  static fromPersistence(row: CustomerRow): Customer {
    if (!row.id) throw new Error("Customer must have ID from persistence");
    return new Customer(row.id, row.name, row.isSelf);
  }

  toPersistence(): Omit<CustomerRow, "id"> {
    return { name: this.name, isSelf: this.isSelf };
  }

  update(input: CustomerUpdateInput): Customer {
    return new Customer(this.id, input.name ?? this.name, input.isSelf ?? this.isSelf);
  }

  // Domain behavior
  get displayName(): string {
    return this.isSelf ? `${this.name} (я)` : this.name;
  }
}

// ============================================
// Repository Interface (Port)
// ============================================

export interface CustomerRepository {
  findAll(): Promise<Customer[]>;
  findAllWithItems(): Promise<CustomerWithItems[]>;
  findById(id: number): Promise<Customer | null>;
  findByIdWithItems(id: number): Promise<CustomerWithItems | null>;
  save(customer: Customer): Promise<Customer>;
  delete(id: number): Promise<void>;
}

export interface CustomerWithItems {
  customer: Customer;
  items: any[];
}

// ============================================
// Domain Service (if needed)
// ============================================

export class CustomerService {
  constructor(private repo: CustomerRepository) {}

  async findAll(): Promise<Customer[]> {
    return this.repo.findAll();
  }

  async getSelfCustomer(): Promise<Customer | null> {
    const all = await this.findAll();
    return all.find((c) => c.isSelf) ?? null;
  }

  async createCustomer(name: string): Promise<Customer> {
    await this.validateUniqueName(name);
    return this.repo.save(Customer.create({ name, isSelf: false }));
  }

  async ensureSelfCustomerExists(name: string): Promise<Customer> {
    const existing = await this.getSelfCustomer();
    if (existing) return existing;
    return this.repo.save(Customer.create({ name, isSelf: true }));
  }

  async validateUniqueName(name: string, excludeId?: number): Promise<void> {
    const all = await this.repo.findAll();
    const exists = all.some((c) => c.name === name && c.id !== excludeId);
    if (exists) throw new Error("Заказчик с таким именем уже существует");
  }
}
