import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BusinessRuleViolationError,
  EntityNotFoundError,
} from '../../../../shared/domain/errors';
import { BudgetStatus } from '../../../domain/entities/budget-status';
import { Payment } from '../../../domain/entities/payment';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import type { PaymentRepositoryInterface } from '../../../domain/repositories/payment.repository';
import {
  BUDGET_REPOSITORY,
  PAYMENT_REPOSITORY,
} from '../../../domain/repositories/tokens';
import {
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from '../../../domain/ports/payment-gateway.port';
import {
  EVENT_PUBLISHER,
  type EventPublisherPort,
} from '../../../../shared/domain/ports/event-publisher.port';

export type CreatePaymentFromReservationInput = {
  serviceOrderId: string;
  correlationId: string;
  causationId?: string;
  reservationId: string;
};

@Injectable()
export class CreatePaymentFromReservationUseCase {
  private readonly logger = new Logger(CreatePaymentFromReservationUseCase.name);

  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgets: BudgetRepositoryInterface,
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryInterface,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGatewayPort,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(input: CreatePaymentFromReservationInput): Promise<Payment> {
    const budget = await this.budgets.findByServiceOrderId(input.serviceOrderId);
    if (!budget) {
      throw new EntityNotFoundError('Budget not found');
    }
    if (budget.status !== BudgetStatus.APPROVED) {
      throw new BusinessRuleViolationError(
        `Cannot create payment for budget in status ${budget.status}`,
      );
    }

    const existing = await this.payments.findActiveByBudgetId(budget.id);
    if (existing) {
      this.logger.log(
        `active payment already exists paymentId=${existing.id} budgetId=${budget.id}`,
      );
      return existing;
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const payment = Payment.create({
      budgetId: budget.id,
      serviceOrderId: budget.serviceOrderId,
      correlationId: input.correlationId,
      amount: budget.total,
      expiresAt,
    });

    try {
      const checkout = await this.gateway.createCheckout({
        paymentId: payment.id,
        correlationId: input.correlationId,
        serviceOrderId: budget.serviceOrderId,
        amount: budget.total,
        description: `OS ${budget.serviceOrderId} (reserva ${input.reservationId})`,
        payerEmail: budget.client.email,
        payerName: budget.client.name,
        expiresAt,
      });
      payment.attachGatewayPreference(
        checkout.preferenceId,
        checkout.checkoutUrl,
      );
      if (checkout.expiresAt) {
        // recreate with gateway expiry only via attach; expiresAt already set
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'GATEWAY_ERROR';
      await this.events.publish({
        eventId: randomUUID(),
        type: 'billing.payment.failed',
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        causationId: input.causationId,
        producer: 'billing-service',
        payload: {
          paymentId: payment.id,
          budgetId: budget.id,
          serviceOrderId: budget.serviceOrderId,
          reason: 'GATEWAY_ERROR',
          detail: reason,
        },
      });
      throw error;
    }

    const saved = await this.payments.create(payment);

    await this.events.publish({
      eventId: randomUUID(),
      type: 'billing.payment.created',
      version: 1,
      occurredAt: new Date().toISOString(),
      correlationId: input.correlationId,
      causationId: input.causationId,
      producer: 'billing-service',
      payload: {
        paymentId: saved.id,
        budgetId: saved.budgetId,
        serviceOrderId: saved.serviceOrderId,
        amount: saved.amount,
        checkoutUrl: saved.checkoutUrl,
        expiresAt: saved.expiresAt?.toISOString(),
      },
    });

    return saved;
  }
}
