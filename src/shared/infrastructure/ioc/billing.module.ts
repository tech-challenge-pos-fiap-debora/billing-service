import { Module } from '@nestjs/common';
import { AuthModule } from '../../../billing/infrastructure/ioc/auth.module';
import { BudgetModule } from '../../../billing/infrastructure/ioc/budget.module';
import { MessagingConsumerModule } from '../../../billing/infrastructure/ioc/messaging-consumer.module';
import { PaymentModule } from '../../../billing/infrastructure/ioc/payment.module';

@Module({
  imports: [AuthModule, BudgetModule, PaymentModule, MessagingConsumerModule],
})
export class BillingModule {}
