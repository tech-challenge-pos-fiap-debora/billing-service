import { randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessRuleViolationError,
  EntityNotFoundError,
} from '../../../../shared/domain/errors';
import type { Payment } from '../../../domain/entities/payment';
import { PaymentStatus } from '../../../domain/entities/payment-status';
import type { PaymentRepositoryInterface } from '../../../domain/repositories/payment.repository';
import { PAYMENT_REPOSITORY } from '../../../domain/repositories/tokens';
import {
  PAYMENT_GATEWAY,
  type PaymentGatewayPort,
} from '../../../domain/ports/payment-gateway.port';
import {
  EVENT_PUBLISHER,
  type EventPublisherPort,
} from '../../../../shared/domain/ports/event-publisher.port';

@Injectable()
export class RefundPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryInterface,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGatewayPort,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisherPort,
  ) {}

  async byServiceOrderId(serviceOrderId: string): Promise<Payment | null> {
    const list = await this.payments.findByServiceOrderId(serviceOrderId);
    const confirmed = list.find((p) => p.status === PaymentStatus.CONFIRMED);
    if (!confirmed) return null;
    return this.execute(confirmed.id);
  }

  async execute(paymentId: string): Promise<Payment> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) throw new EntityNotFoundError('Payment not found');

    if (!payment.providerPaymentId) {
      throw new BusinessRuleViolationError(
        'Payment has no providerPaymentId to refund',
      );
    }

    await this.gateway.refund(payment.providerPaymentId);

    try {
      payment.refund();
    } catch (error) {
      throw new BusinessRuleViolationError(
        error instanceof Error ? error.message : 'Invalid operation',
      );
    }

    const saved = await this.payments.save(payment);
    await this.events.publish({
      eventId: randomUUID(),
      type: 'billing.payment.refunded',
      version: 1,
      occurredAt: new Date().toISOString(),
      correlationId: saved.correlationId,
      producer: 'billing-service',
      payload: {
        paymentId: saved.id,
        budgetId: saved.budgetId,
        serviceOrderId: saved.serviceOrderId,
        amount: saved.amount,
        refundedAt: saved.refundedAt!.toISOString(),
      },
    });
    return saved;
  }
}
