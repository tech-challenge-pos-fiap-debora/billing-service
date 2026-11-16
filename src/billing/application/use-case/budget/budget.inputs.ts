import type { OrderBudgetRequestedPayload } from '../../../domain/events/billing-events';

export type GenerateBudgetFromEventInput = OrderBudgetRequestedPayload & {
  correlationId: string;
  causationId?: string;
};
