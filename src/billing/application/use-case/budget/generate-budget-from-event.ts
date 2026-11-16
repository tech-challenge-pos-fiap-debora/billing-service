import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Budget, type BudgetItem } from '../../../domain/entities/budget';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import { BUDGET_REPOSITORY } from '../../../domain/repositories/tokens';
import {
  STOCK_QUOTE,
  type StockQuotePort,
} from '../../../domain/ports/stock-quote.port';
import {
  BUDGET_DELIVERY_NOTIFIER,
  type BudgetDeliveryNotifier,
} from '../../../domain/ports/budget-delivery-notifier.port';
import {
  EVENT_PUBLISHER,
  type EventPublisherPort,
} from '../../../../shared/domain/ports/event-publisher.port';
import type { GenerateBudgetFromEventInput } from './budget.inputs';

@Injectable()
export class GenerateBudgetFromEventUseCase {
  private readonly logger = new Logger(GenerateBudgetFromEventUseCase.name);

  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgets: BudgetRepositoryInterface,
    @Inject(STOCK_QUOTE)
    private readonly stockQuote: StockQuotePort,
    @Inject(EVENT_PUBLISHER)
    private readonly events: EventPublisherPort,
    @Inject(BUDGET_DELIVERY_NOTIFIER)
    private readonly notifier: BudgetDeliveryNotifier,
  ) {}

  async execute(input: GenerateBudgetFromEventInput): Promise<Budget> {
    const existing = await this.budgets.findByServiceOrderId(
      input.serviceOrderId,
    );
    if (existing) {
      this.logger.log(
        `budget already exists serviceOrderId=${input.serviceOrderId} budgetId=${existing.id}`,
      );
      return existing;
    }

    if (
      input.serviceLines.length === 0 &&
      input.partDemand.length === 0
    ) {
      await this.publishFailed(input, 'Orçamento sem serviços nem peças');
      throw new Error('Cannot generate budget without lines');
    }

    try {
      const items: BudgetItem[] = [];
      let servicesTotal = 0;
      for (const line of input.serviceLines) {
        const total = line.unitPrice * line.quantity;
        servicesTotal += total;
        items.push({
          type: 'SERVICE',
          referenceId: line.catalogServiceId,
          description: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total,
        });
      }

      let partsTotal = 0;
      if (input.partDemand.length > 0) {
        const quote = await this.stockQuote.quoteFifoCost(
          input.partDemand.map((p) => ({
            productCode: p.productCode,
            required: p.quantity,
          })),
          input.correlationId,
        );
        const quoteByCode = new Map(quote.map((q) => [q.productCode, q]));
        for (const part of input.partDemand) {
          const q = quoteByCode.get(part.productCode);
          const totalCost = q?.totalCost ?? 0;
          const unitPrice = q?.unitPrice ?? 0;
          partsTotal += totalCost;
          items.push({
            type: 'PART',
            referenceId: part.productCode,
            description: part.name?.trim() || part.productCode,
            quantity: part.quantity,
            unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
            total: totalCost,
          });
        }
      }

      const budget = Budget.create({
        serviceOrderId: input.serviceOrderId,
        correlationId: input.correlationId,
        items,
        servicesTotal,
        partsTotal,
        total: servicesTotal + partsTotal,
        client: input.client,
      });

      const saved = await this.budgets.create(budget);

      await this.events.publish({
        eventId: randomUUID(),
        type: 'billing.budget.generated',
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        causationId: input.causationId,
        producer: 'billing-service',
        payload: {
          budgetId: saved.id,
          serviceOrderId: saved.serviceOrderId,
          items: saved.items,
          servicesTotal: saved.servicesTotal,
          partsTotal: saved.partsTotal,
          total: saved.total,
        },
      });

      await this.notifier.notifyBudgetReady({
        serviceOrderId: saved.serviceOrderId,
        budgetId: saved.id,
        correlationId: saved.correlationId,
        clientDocument: saved.client.document,
        clientName: saved.client.name,
        clientEmail: saved.client.email,
        items: saved.items,
        servicesTotal: saved.servicesTotal,
        partsTotal: saved.partsTotal,
        total: saved.total,
      });

      return saved;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Falha ao gerar orçamento';
      await this.publishFailed(input, reason);
      throw error;
    }
  }

  private async publishFailed(
    input: GenerateBudgetFromEventInput,
    reason: string,
  ): Promise<void> {
    await this.events.publish({
      eventId: randomUUID(),
      type: 'billing.budget.failed',
      version: 1,
      occurredAt: new Date().toISOString(),
      correlationId: input.correlationId,
      causationId: input.causationId,
      producer: 'billing-service',
      payload: {
        serviceOrderId: input.serviceOrderId,
        reason,
      },
    });
  }
}
