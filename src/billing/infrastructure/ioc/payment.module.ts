import { Module } from '@nestjs/common';
import {
  CreatePaymentFromReservationUseCase,
  ExpirePendingPaymentsUseCase,
  GetPaymentUseCase,
  HandlePaymentNotificationUseCase,
  RefundPaymentUseCase,
} from '../../application/use-case/payment';
import { PAYMENT_GATEWAY } from '../../domain/ports/payment-gateway.port';
import { PaymentController } from '../../interfaces/http/payment/payment.controller';
import { MercadoPagoWebhookController } from '../../interfaces/http/webhooks/mercado-pago-webhook.controller';
import { MercadoPagoPaymentGateway } from '../adapters/mercado-pago-payment.gateway';
import { BillingDatabaseModule } from '../database/database.module';
import { MessagingModule } from '../../../shared/infrastructure/messaging/messaging.module';

@Module({
  imports: [BillingDatabaseModule, MessagingModule],
  providers: [
    MercadoPagoPaymentGateway,
    { provide: PAYMENT_GATEWAY, useExisting: MercadoPagoPaymentGateway },
    CreatePaymentFromReservationUseCase,
    HandlePaymentNotificationUseCase,
    RefundPaymentUseCase,
    ExpirePendingPaymentsUseCase,
    GetPaymentUseCase,
  ],
  controllers: [PaymentController, MercadoPagoWebhookController],
  exports: [
    CreatePaymentFromReservationUseCase,
    HandlePaymentNotificationUseCase,
    RefundPaymentUseCase,
    ExpirePendingPaymentsUseCase,
    GetPaymentUseCase,
    MercadoPagoPaymentGateway,
  ],
})
export class PaymentModule {}
