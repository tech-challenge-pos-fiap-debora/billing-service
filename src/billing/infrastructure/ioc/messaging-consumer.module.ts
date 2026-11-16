import { Module } from '@nestjs/common';
import { SagaEventsConsumer } from '../../interfaces/messaging/saga-events.consumer';
import { BudgetModule } from './budget.module';
import { PaymentModule } from './payment.module';

@Module({
  imports: [BudgetModule, PaymentModule],
  providers: [SagaEventsConsumer],
})
export class MessagingConsumerModule {}
