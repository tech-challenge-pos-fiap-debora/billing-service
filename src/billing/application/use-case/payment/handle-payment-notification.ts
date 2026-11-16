import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
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
export class HandlePaymentNotificationUseCase {
  private readonly logger = new Logger(HandlePaymentNotificationUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryInterface,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGatewayPort,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(providerPaymentId: string): Promise<Payment | null> {
    const lookup = await this.gateway.getPayment(providerPaymentId);
    const paymentId = lookup.externalReference;
    if (!paymentId) {
      this.logger.warn(
        `payment notification without external_reference providerPaymentId=${providerPaymentId}`,
      );
      return null;
    }

    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new EntityNotFoundError(`Payment "${paymentId}" not found`);
    }

    if (payment.status === PaymentStatus.CONFIRMED) {
      return payment;
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BusinessRuleViolationError(
        `Cannot process notification for payment in status ${payment.status}`,
      );
    }

    if (lookup.status === 'approved') {
      payment.confirm(lookup.providerPaymentId);
      const saved = await this.payments.save(payment);
      await this.events.publish({
        eventId: randomUUID(),
        type: 'billing.payment.confirmed',
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: saved.correlationId,
        producer: 'billing-service',
        payload: {
          paymentId: saved.id,
          budgetId: saved.budgetId,
          serviceOrderId: saved.serviceOrderId,
          amount: saved.amount,
          paidAt: saved.paidAt!.toISOString(),
        },
      });
      return saved;
    }

    if (lookup.status === 'rejected' || lookup.status === 'cancelled') {
      payment.fail(lookup.providerPaymentId);
      const saved = await this.payments.save(payment);
      await this.events.publish({
        eventId: randomUUID(),
        type: 'billing.payment.failed',
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: saved.correlationId,
        producer: 'billing-service',
        payload: {
          paymentId: saved.id,
          budgetId: saved.budgetId,
          serviceOrderId: saved.serviceOrderId,
          reason: 'REJECTED',
        },
      });
      return saved;
    }

    this.logger.log(
      `payment still pending paymentId=${payment.id} status=${lookup.status}`,
    );
    return payment;
  }
}
