import { z } from "zod";
import type { CustomerRow } from "@/core/dbSchema";

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
}

// ============================================
// Ports — reads are separated from writes so no view can bypass the rules
// ============================================

export interface CustomerRepository {
  findAll(): Promise<Customer[]>;
  findById(id: number): Promise<Customer | null>;
}

export interface CustomerWriteStore {
  save(customer: Customer): Promise<Customer>;
  delete(id: number): Promise<void>;
}

function validated<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Некорректные данные");
  }
  return result.data;
}

// ============================================
// Domain service — the only writer of customers
// ============================================

export class CustomerService {
  constructor(
    private readonly repo: CustomerRepository,
    private readonly writes: CustomerWriteStore,
  ) {}

  async findAll(): Promise<Customer[]> {
    return this.repo.findAll();
  }

  async findById(id: number): Promise<Customer | null> {
    return this.repo.findById(id);
  }

  async getSelfCustomer(): Promise<Customer | null> {
    const all = await this.findAll();
    return all.find((c) => c.isSelf) ?? null;
  }

  async createCustomer(input: CustomerCreateInput): Promise<Customer> {
    const data = validated(CustomerCreateSchema, input);
    await this.validateUniqueName(data.name);
    return this.writes.save(Customer.create(data));
  }

  async updateCustomer(id: number, input: CustomerUpdateInput): Promise<Customer> {
    const data = validated(CustomerUpdateSchema, input);
    const existing = await this.requireCustomer(id);
    if (data.name !== undefined) await this.validateUniqueName(data.name, id);
    return this.writes.save(existing.update(data));
  }

  async deleteCustomer(id: number): Promise<void> {
    await this.requireCustomer(id);
    await this.writes.delete(id);
  }

  async ensureSelfCustomerExists(name: string): Promise<Customer> {
    const existing = await this.getSelfCustomer();
    if (existing) return existing;
    return this.writes.save(Customer.create({ name, isSelf: true }));
  }

  async validateUniqueName(name: string, excludeId?: number): Promise<void> {
    const all = await this.repo.findAll();
    if (all.some((c) => c.name === name && c.id !== excludeId)) {
      throw new Error("Заказчик с таким именем уже существует");
    }
  }

  private async requireCustomer(id: number): Promise<Customer> {
    const customer = await this.repo.findById(id);
    if (!customer) throw new Error("Заказчик не найден");
    return customer;
  }
}
