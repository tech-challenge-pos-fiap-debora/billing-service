import { Budget } from './budget';
import { BudgetStatus } from './budget-status';

const baseInput = {
  serviceOrderId: '11111111-1111-4111-8111-111111111111',
  correlationId: '11111111-1111-4111-8111-111111111111',
  items: [
    {
      type: 'SERVICE' as const,
      referenceId: 'svc-1',
      description: 'Troca de óleo',
      quantity: 1,
      unitPrice: 100,
      total: 100,
    },
  ],
  servicesTotal: 100,
  partsTotal: 0,
  total: 100,
  client: {
    id: 'c1',
    document: '52998224725',
    name: 'Cliente',
    email: 'cliente@example.com',
  },
};

describe('Budget', () => {
  it('cria orçamento PENDING', () => {
    const budget = Budget.create(baseInput);
    expect(budget.status).toBe(BudgetStatus.PENDING);
    expect(budget.total).toBe(100);
    expect(budget.servicesTotal).toBe(100);
    expect(budget.partsTotal).toBe(0);
    expect(budget.correlationId).toBe(baseInput.correlationId);
    expect(budget.serviceOrderId).toBe(baseInput.serviceOrderId);
    expect(budget.client.email).toBe('cliente@example.com');
    expect(budget.items).toHaveLength(1);
    expect(budget.createdAt).toBeInstanceOf(Date);
    expect(budget.updatedAt).toBeInstanceOf(Date);
    expect(budget.toJSON().id).toBe(budget.id);
  });

  it('restaura orçamento', () => {
    const created = Budget.create(baseInput);
    const restored = Budget.restore(
      {
        serviceOrderId: created.serviceOrderId,
        correlationId: created.correlationId,
        status: created.status,
        items: created.items,
        servicesTotal: created.servicesTotal,
        partsTotal: created.partsTotal,
        total: created.total,
        client: created.client,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      created.id,
    );
    expect(restored.id).toBe(created.id);
    expect(restored.status).toBe(BudgetStatus.PENDING);
  });

  it('aprova orçamento pendente (idempotente)', () => {
    const budget = Budget.create(baseInput);
    budget.approve();
    expect(budget.status).toBe(BudgetStatus.APPROVED);
    expect(budget.approvedAt).toBeInstanceOf(Date);
    budget.approve();
    expect(budget.status).toBe(BudgetStatus.APPROVED);
  });

  it('reprova orçamento pendente (idempotente)', () => {
    const budget = Budget.create(baseInput);
    budget.reject('caro');
    expect(budget.status).toBe(BudgetStatus.REJECTED);
    expect(budget.rejectedAt).toBeInstanceOf(Date);
    expect(budget.reason).toBe('caro');
    budget.reject();
    expect(budget.status).toBe(BudgetStatus.REJECTED);
  });

  it('reprova com motivo padrão', () => {
    const budget = Budget.create(baseInput);
    budget.reject('   ');
    expect(budget.reason).toBe('Orçamento reprovado');
  });

  it('cancela orçamento pendente e aprovado', () => {
    const pending = Budget.create(baseInput);
    pending.cancel('motivo');
    expect(pending.status).toBe(BudgetStatus.CANCELLED);
    expect(pending.reason).toBe('motivo');

    const approved = Budget.create(baseInput);
    approved.approve();
    approved.cancel();
    expect(approved.status).toBe(BudgetStatus.CANCELLED);
    expect(approved.reason).toBe('Orçamento cancelado');

    approved.cancel('de novo');
    expect(approved.status).toBe(BudgetStatus.CANCELLED);
  });

  it('não aprova orçamento rejeitado', () => {
    const budget = Budget.create(baseInput);
    budget.reject();
    expect(() => budget.approve()).toThrow(/Cannot approve/);
  });

  it('não rejeita orçamento aprovado', () => {
    const budget = Budget.create(baseInput);
    budget.approve();
    expect(() => budget.reject()).toThrow(/Cannot reject/);
  });
});
