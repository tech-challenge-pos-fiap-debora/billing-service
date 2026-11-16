import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '../../../../shared/domain/errors';
import type { Payment } from '../../../domain/entities/payment';
import type { PaymentRepositoryInterface } from '../../../domain/repositories/payment.repository';
import { PAYMENT_REPOSITORY } from '../../../domain/repositories/tokens';

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepositoryInterface,
  ) {}

  async byId(id: string): Promise<Payment> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new EntityNotFoundError('Payment not found');
    return payment;
  }

  async byServiceOrderId(serviceOrderId: string): Promise<Payment[]> {
    return this.payments.findByServiceOrderId(serviceOrderId);
  }
}
