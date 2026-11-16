import { Injectable, Logger } from '@nestjs/common';
import type {
  BudgetDeliveryNotifier,
  BudgetDeliveryPayload,
} from '../../domain/ports/budget-delivery-notifier.port';

@Injectable()
export class LoggingBudgetDeliveryNotifier implements BudgetDeliveryNotifier {
  private readonly logger = new Logger(LoggingBudgetDeliveryNotifier.name);

  async notifyBudgetReady(payload: BudgetDeliveryPayload): Promise<void> {
    this.logger.log(
      `budget ready serviceOrderId=${payload.serviceOrderId} budgetId=${payload.budgetId} email=${payload.clientEmail} total=${payload.total} correlationId=${payload.correlationId}`,
    );
  }
}
