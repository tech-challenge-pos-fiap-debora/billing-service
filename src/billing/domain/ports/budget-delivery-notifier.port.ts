import type { BudgetItem } from '../entities/budget';

export const BUDGET_DELIVERY_NOTIFIER = Symbol('BUDGET_DELIVERY_NOTIFIER');

export type BudgetDeliveryPayload = {
  serviceOrderId: string;
  budgetId: string;
  correlationId: string;
  clientDocument: string;
  clientName: string;
  clientEmail: string;
  items: BudgetItem[];
  servicesTotal: number;
  partsTotal: number;
  total: number;
};

export interface BudgetDeliveryNotifier {
  notifyBudgetReady(payload: BudgetDeliveryPayload): Promise<void>;
}
