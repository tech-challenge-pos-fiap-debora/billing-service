export type DomainEventEnvelope<TType extends string, TPayload> = {
  eventId: string;
  type: TType;
  version: 1;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  producer: 'billing-service';
  payload: TPayload;
};

export type BudgetItemPayload = {
  type: 'SERVICE' | 'PART';
  referenceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type BillingBudgetGenerated = DomainEventEnvelope<
  'billing.budget.generated',
  {
    budgetId: string;
    serviceOrderId: string;
    items: BudgetItemPayload[];
    servicesTotal: number;
    partsTotal: number;
    total: number;
  }
>;

export type BillingBudgetFailed = DomainEventEnvelope<
  'billing.budget.failed',
  {
    serviceOrderId: string;
    reason: string;
  }
>;

export type BillingPaymentCreated = DomainEventEnvelope<
  'billing.payment.created',
  {
    paymentId: string;
    budgetId: string;
    serviceOrderId: string;
    amount: number;
    checkoutUrl: string;
    expiresAt?: string;
  }
>;

export type BillingPaymentConfirmed = DomainEventEnvelope<
  'billing.payment.confirmed',
  {
    paymentId: string;
    budgetId: string;
    serviceOrderId: string;
    amount: number;
    paidAt: string;
  }
>;

export type BillingPaymentFailed = DomainEventEnvelope<
  'billing.payment.failed',
  {
    paymentId: string;
    budgetId: string;
    serviceOrderId: string;
    reason: 'GATEWAY_ERROR' | 'REJECTED' | 'EXPIRED';
  }
>;

export type BillingPaymentRefunded = DomainEventEnvelope<
  'billing.payment.refunded',
  {
    paymentId: string;
    budgetId: string;
    serviceOrderId: string;
    amount: number;
    refundedAt: string;
  }
>;

export type BillingDomainEvent =
  | BillingBudgetGenerated
  | BillingBudgetFailed
  | BillingPaymentCreated
  | BillingPaymentConfirmed
  | BillingPaymentFailed
  | BillingPaymentRefunded;

/** Eventos consumidos pelo billing (produzidos por order/stock). */
export type OrderBudgetRequestedPayload = {
  serviceOrderId: string;
  client: {
    id: string;
    document: string;
    name: string;
    email: string;
  };
  vehicle?: {
    plate: string;
    brand?: string;
    model?: string;
    year?: number;
  };
  serviceLines: Array<{
    catalogServiceId: string;
    name: string;
    unitPrice: number;
    quantity: number;
  }>;
  partDemand: Array<{
    productCode: string;
    name?: string;
    quantity: number;
  }>;
};

export type OrderBudgetApprovedPayload = {
  serviceOrderId: string;
  budgetId: string;
};

export type OrderBudgetRejectedPayload = {
  serviceOrderId: string;
  budgetId: string;
  reason?: string;
};

export type OrderCancelledPayload = {
  serviceOrderId: string;
  reason?: string;
  previousStatus?: string;
};

export type StockReservedPayload = {
  serviceOrderId: string;
  reservationId: string;
  items: Array<{
    productCode: string;
    quantity: number;
  }>;
};
