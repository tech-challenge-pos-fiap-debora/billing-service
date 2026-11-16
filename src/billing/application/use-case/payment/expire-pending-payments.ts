import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PaymentRepositoryInterface } from '../../../domain/repositories/payment.repository';
import { PAYMENT_REPOSITORY } from '../../../domain/repositories/tokens';
import {
  EVENT_PUBLISHER,
  type EventPublisherPort,
} from '../../../../shared/domain/ports/event-publisher.port';

@Injectable()
export class ExpirePendingPaymentsUseCase {
  private readonly logger = new Logger(ExpirePendingPaymentsUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryInterface,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisherPort,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const expired = await this.payments.findExpiredPending(now);
    for (const payment of expired) {
      payment.fail();
      await this.payments.save(payment);
      await this.events.publish({
        eventId: randomUUID(),
        type: 'billing.payment.failed',
        version: 1,
        occurredAt: now.toISOString(),
        correlationId: payment.correlationId,
        producer: 'billing-service',
        payload: {
          paymentId: payment.id,
          budgetId: payment.budgetId,
          serviceOrderId: payment.serviceOrderId,
          reason: 'EXPIRED',
        },
      });
      this.logger.log(`payment expired paymentId=${payment.id}`);
    }
    return expired.length;
  }
}
