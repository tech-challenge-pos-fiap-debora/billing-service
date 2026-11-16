import { Module } from '@nestjs/common';
import {
  CancelBudgetUseCase,
  GenerateBudgetFromEventUseCase,
  GetBudgetUseCase,
  MarkBudgetApprovedUseCase,
  MarkBudgetRejectedUseCase,
} from '../../application/use-case/budget';
import { BUDGET_DELIVERY_NOTIFIER } from '../../domain/ports/budget-delivery-notifier.port';
import { STOCK_QUOTE } from '../../domain/ports/stock-quote.port';
import { BudgetController } from '../../interfaces/http/budget/budget.controller';
import { HttpStockQuoteAdapter } from '../adapters/http-stock-quote.adapter';
import { IntegrationHttpClient } from '../adapters/integration-http.client';
import { BillingDatabaseModule } from '../database/database.module';
import { LoggingBudgetDeliveryNotifier } from '../notifications/logging-budget-delivery-notifier';
import { MessagingModule } from '../../../shared/infrastructure/messaging/messaging.module';

@Module({
  imports: [BillingDatabaseModule, MessagingModule],
  providers: [
    IntegrationHttpClient,
    { provide: STOCK_QUOTE, useClass: HttpStockQuoteAdapter },
    {
      provide: BUDGET_DELIVERY_NOTIFIER,
      useClass: LoggingBudgetDeliveryNotifier,
    },
    GenerateBudgetFromEventUseCase,
    MarkBudgetApprovedUseCase,
    MarkBudgetRejectedUseCase,
    CancelBudgetUseCase,
    GetBudgetUseCase,
  ],
  controllers: [BudgetController],
  exports: [
    GenerateBudgetFromEventUseCase,
    MarkBudgetApprovedUseCase,
    MarkBudgetRejectedUseCase,
    CancelBudgetUseCase,
    GetBudgetUseCase,
    BillingDatabaseModule,
  ],
})
export class BudgetModule {}
