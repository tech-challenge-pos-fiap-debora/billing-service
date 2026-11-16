import { GenerateBudgetFromEventUseCase } from './generate-budget-from-event';
import { MarkBudgetApprovedUseCase } from './mark-budget-approved';
import { MarkBudgetRejectedUseCase } from './mark-budget-rejected';
import { CancelBudgetUseCase } from './cancel-budget';
import { GetBudgetUseCase } from './get-budget';
import { Budget } from '../../../domain/entities/budget';
import { BudgetStatus } from '../../../domain/entities/budget-status';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import type { StockQuotePort } from '../../../domain/ports/stock-quote.port';
import type { EventPublisherPort } from '../../../../shared/domain/ports/event-publisher.port';
import type { BudgetDeliveryNotifier } from '../../../domain/ports/budget-delivery-notifier.port';

function memoryBudgetRepo(): BudgetRepositoryInterface & {
  store: Map<string, Budget>;
} {
  const store = new Map<string, Budget>();
  return {
    store,
    async create(budget) {
      store.set(budget.id, budget);
      return budget;
    },
    async save(budget) {
      store.set(budget.id, budget);
      return budget;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findByServiceOrderId(serviceOrderId) {
      return (
        [...store.values()].find((b) => b.serviceOrderId === serviceOrderId) ??
        null
      );
    },
  };
}

describe('budget use cases', () => {
  const client = {
    id: 'c1',
    document: '52998224725',
    name: 'Cliente',
    email: 'c@example.com',
  };

  it('gera orçamento a partir do evento e publica billing.budget.generated', async () => {
    const repo = memoryBudgetRepo();
    const published: unknown[] = [];
    const stock: StockQuotePort = {
      async quoteFifoCost() {
        return [
          {
            productCode: 'OLEO',
            required: 2,
            totalCost: 40,
            unitPrice: 20,
          },
        ];
      },
    };
    const events: EventPublisherPort = {
      async publish(event) {
        published.push(event);
      },
    };
    const notifier: BudgetDeliveryNotifier = {
      async notifyBudgetReady() {},
    };

    const useCase = new GenerateBudgetFromEventUseCase(
      repo,
      stock,
      events,
      notifier,
    );

    const budget = await useCase.execute({
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      client,
      serviceLines: [
        {
          catalogServiceId: 'svc-1',
          name: 'Troca de óleo',
          unitPrice: 100,
          quantity: 1,
        },
      ],
      partDemand: [{ productCode: 'OLEO', name: 'Óleo', quantity: 2 }],
    });

    expect(budget.status).toBe(BudgetStatus.PENDING);
    expect(budget.total).toBe(140);
    expect(published).toHaveLength(1);
    expect((published[0] as { type: string }).type).toBe(
      'billing.budget.generated',
    );

    const again = await useCase.execute({
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      client,
      serviceLines: [],
      partDemand: [],
    });
    expect(again.id).toBe(budget.id);
    expect(published).toHaveLength(1);
  });

  it('publica billing.budget.failed sem linhas', async () => {
    const repo = memoryBudgetRepo();
    const published: Array<{ type: string }> = [];
    const useCase = new GenerateBudgetFromEventUseCase(
      repo,
      { async quoteFifoCost() { return []; } },
      {
        async publish(event) {
          published.push(event as { type: string });
        },
      },
      { async notifyBudgetReady() {} },
    );

    await expect(
      useCase.execute({
        serviceOrderId: 'os-empty',
        correlationId: 'os-empty',
        client,
        serviceLines: [],
        partDemand: [],
      }),
    ).rejects.toThrow(/without lines/);

    expect(published[0]?.type).toBe('billing.budget.failed');
  });

  it('aprova orçamento existente', async () => {
    const repo = memoryBudgetRepo();
    const budget = Budget.create({
      serviceOrderId: 'os-2',
      correlationId: 'os-2',
      items: [],
      servicesTotal: 10,
      partsTotal: 0,
      total: 10,
      client,
    });
    await repo.create(budget);

    const approved = await new MarkBudgetApprovedUseCase(repo).execute(
      'os-2',
      budget.id,
    );
    expect(approved.status).toBe(BudgetStatus.APPROVED);
  });

  it('falha ao aprovar orçamento inexistente ou de outra OS', async () => {
    const repo = memoryBudgetRepo();
    const useCase = new MarkBudgetApprovedUseCase(repo);
    await expect(useCase.execute('missing')).rejects.toThrow(/not found/i);

    const budget = Budget.create({
      serviceOrderId: 'os-a',
      correlationId: 'os-a',
      items: [],
      servicesTotal: 1,
      partsTotal: 0,
      total: 1,
      client,
    });
    await repo.create(budget);
    await expect(useCase.execute('os-b', budget.id)).rejects.toThrow(
      /does not belong/,
    );
  });

  it('rejeita e cancela orçamento', async () => {
    const repo = memoryBudgetRepo();
    const pending = Budget.create({
      serviceOrderId: 'os-r',
      correlationId: 'os-r',
      items: [],
      servicesTotal: 1,
      partsTotal: 0,
      total: 1,
      client,
    });
    await repo.create(pending);
    const rejected = await new MarkBudgetRejectedUseCase(repo).execute(
      'os-r',
      'cliente recusou',
    );
    expect(rejected.status).toBe(BudgetStatus.REJECTED);

    const approved = Budget.create({
      serviceOrderId: 'os-c',
      correlationId: 'os-c',
      items: [],
      servicesTotal: 1,
      partsTotal: 0,
      total: 1,
      client,
    });
    approved.approve();
    await repo.create(approved);
    const cancelled = await new CancelBudgetUseCase(repo).execute(
      'os-c',
      'OS cancelada',
    );
    expect(cancelled?.status).toBe(BudgetStatus.CANCELLED);
    expect(await new CancelBudgetUseCase(repo).execute('missing')).toBeNull();
  });

  it('GetBudget busca por id e por OS', async () => {
    const repo = memoryBudgetRepo();
    const budget = Budget.create({
      serviceOrderId: 'os-g',
      correlationId: 'os-g',
      items: [],
      servicesTotal: 1,
      partsTotal: 0,
      total: 1,
      client,
    });
    await repo.create(budget);
    const useCase = new GetBudgetUseCase(repo);
    expect((await useCase.byId(budget.id)).id).toBe(budget.id);
    expect((await useCase.byServiceOrderId('os-g')).id).toBe(budget.id);
    await expect(useCase.byId('missing')).rejects.toThrow(/not found/i);
  });
});
