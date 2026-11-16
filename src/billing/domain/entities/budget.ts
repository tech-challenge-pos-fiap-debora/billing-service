import { randomUUID } from 'crypto';
import { BudgetStatus } from './budget-status';

export type BudgetItemType = 'SERVICE' | 'PART';

export type BudgetItem = {
  type: BudgetItemType;
  referenceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type BudgetClient = {
  id: string;
  document: string;
  name: string;
  email: string;
};

export type BudgetProps = {
  serviceOrderId: string;
  correlationId: string;
  status: BudgetStatus;
  items: BudgetItem[];
  servicesTotal: number;
  partsTotal: number;
  total: number;
  client: BudgetClient;
  approvedAt?: Date;
  rejectedAt?: Date;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBudgetInput = {
  serviceOrderId: string;
  correlationId: string;
  items: BudgetItem[];
  servicesTotal: number;
  partsTotal: number;
  total: number;
  client: BudgetClient;
};

export class Budget {
  public readonly id: string;
  private props: BudgetProps;

  private constructor(props: BudgetProps, id?: string) {
    this.id = id || randomUUID();
    this.props = props;
  }

  static create(input: CreateBudgetInput, id?: string): Budget {
    const now = new Date();
    return new Budget(
      {
        serviceOrderId: input.serviceOrderId,
        correlationId: input.correlationId,
        status: BudgetStatus.PENDING,
        items: input.items.map((i) => ({ ...i })),
        servicesTotal: input.servicesTotal,
        partsTotal: input.partsTotal,
        total: input.total,
        client: { ...input.client },
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static restore(props: BudgetProps, id: string): Budget {
    return new Budget(props, id);
  }

  get serviceOrderId() {
    return this.props.serviceOrderId;
  }
  get correlationId() {
    return this.props.correlationId;
  }
  get status() {
    return this.props.status;
  }
  get items(): BudgetItem[] {
    return this.props.items.map((i) => ({ ...i }));
  }
  get servicesTotal() {
    return this.props.servicesTotal;
  }
  get partsTotal() {
    return this.props.partsTotal;
  }
  get total() {
    return this.props.total;
  }
  get client(): BudgetClient {
    return { ...this.props.client };
  }
  get approvedAt() {
    return this.props.approvedAt;
  }
  get rejectedAt() {
    return this.props.rejectedAt;
  }
  get reason() {
    return this.props.reason;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  approve(): void {
    if (this.props.status === BudgetStatus.APPROVED) {
      this.touch();
      return;
    }
    if (this.props.status !== BudgetStatus.PENDING) {
      throw new Error(`Cannot approve budget in status ${this.props.status}`);
    }
    this.props.status = BudgetStatus.APPROVED;
    this.props.approvedAt = new Date();
    this.touch();
  }

  reject(reason?: string): void {
    if (this.props.status === BudgetStatus.REJECTED) {
      this.touch();
      return;
    }
    if (this.props.status !== BudgetStatus.PENDING) {
      throw new Error(`Cannot reject budget in status ${this.props.status}`);
    }
    this.props.status = BudgetStatus.REJECTED;
    this.props.rejectedAt = new Date();
    this.props.reason = reason?.trim() || 'Orçamento reprovado';
    this.touch();
  }

  cancel(reason?: string): void {
    if (
      this.props.status === BudgetStatus.CANCELLED ||
      this.props.status === BudgetStatus.REJECTED
    ) {
      this.touch();
      return;
    }
    if (this.props.status === BudgetStatus.APPROVED) {
      this.props.status = BudgetStatus.CANCELLED;
      this.props.reason = reason?.trim() || 'Orçamento cancelado';
      this.touch();
      return;
    }
    if (this.props.status !== BudgetStatus.PENDING) {
      throw new Error(`Cannot cancel budget in status ${this.props.status}`);
    }
    this.props.status = BudgetStatus.CANCELLED;
    this.props.reason = reason?.trim() || 'Orçamento cancelado';
    this.touch();
  }

  toJSON() {
    return {
      id: this.id,
      serviceOrderId: this.props.serviceOrderId,
      correlationId: this.props.correlationId,
      status: this.props.status,
      items: this.items,
      servicesTotal: this.props.servicesTotal,
      partsTotal: this.props.partsTotal,
      total: this.props.total,
      client: this.client,
      approvedAt: this.props.approvedAt,
      rejectedAt: this.props.rejectedAt,
      reason: this.props.reason,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
