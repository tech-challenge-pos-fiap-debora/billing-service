import type { Payment } from '../entities/payment';

export interface PaymentRepositoryInterface {
  create(payment: Payment): Promise<Payment>;
  save(payment: Payment): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findActiveByBudgetId(budgetId: string): Promise<Payment | null>;
  findByServiceOrderId(serviceOrderId: string): Promise<Payment[]>;
  findExpiredPending(now: Date): Promise<Payment[]>;
}
