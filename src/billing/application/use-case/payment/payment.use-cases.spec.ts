import { Budget } from '../../../domain/entities/budget';
import { BudgetStatus } from '../../../domain/entities/budget-status';
import { Payment } from '../../../domain/entities/payment';
import { PaymentStatus } from '../../../domain/entities/payment-status';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import type { PaymentRepositoryInterface } from '../../../domain/repositories/payment.repository';
import type { PaymentGatewayPort } from '../../../domain/ports/payment-gateway.port';
import type { EventPublisherPort } from '../../../../shared/domain/ports/event-publisher.port';
import { CreatePaymentFromReservationUseCase } from './create-payment-from-reservation';
import { ExpirePendingPaymentsUseCase } from './expire-pending-payments';
import { GetPaymentUseCase } from './get-payment';
import { HandlePaymentNotificationUseCase } from './handle-payment-notification';
import { RefundPaymentUseCase } from './refund-payment';

const client = {
  id: 'c1',
  document: '52998224725',
  name: 'Cliente',
  email: 'c@example.com',
};

function approvedBudget(serviceOrderId = 'os-1'): Budget {
  const budget = Budget.create({
    serviceOrderId,
    correlationId: serviceOrderId,
    items: [],
    servicesTotal: 100,
    partsTotal: 0,
    total: 100,
    client,
  });
  budget.approve();
  return budget;
}

function memoryBudgets(
  initial: Budget[] = [],
): BudgetRepositoryInterface & { store: Map<string, Budget> } {
  const store = new Map(initial.map((b) => [b.id, b]));
  return {
    store,
    async create(b) {
      store.set(b.id, b);
      return b;
    },
    async save(b) {
      store.set(b.id, b);
      return b;
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

function memoryPayments(
  initial: Payment[] = [],
): PaymentRepositoryInterface & { store: Map<string, Payment> } {
  const store = new Map(initial.map((p) => [p.id, p]));
  return {
    store,
    async create(p) {
      store.set(p.id, p);
      return p;
    },
    async save(p) {
      store.set(p.id, p);
      return p;
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findByServiceOrderId(serviceOrderId) {
      return [...store.values()].filter((p) => p.serviceOrderId === serviceOrderId);
    },
    async findActiveByBudgetId(budgetId) {
      return (
        [...store.values()].find(
          (p) =>
            p.budgetId === budgetId &&
            (p.status === PaymentStatus.PENDING ||
              p.status === PaymentStatus.CONFIRMED),
        ) ?? null
      );
    },
    async findExpiredPending(now) {
      return [...store.values()].filter((p) => p.isExpired(now));
    },
  };
}

describe('payment use cases', () => {
  it('cria pagamento a partir de reserva e publica billing.payment.created', async () => {
    const budget = approvedBudget();
    const published: Array<{ type: string }> = [];
    const gateway: PaymentGatewayPort = {
      async createCheckout() {
        return {
          preferenceId: 'pref-1',
          checkoutUrl: 'https://mp/checkout',
        };
      },
      async getPayment() {
        return { providerPaymentId: 'x', status: 'unknown' };
      },
      async findPaymentByExternalReference() {
        return null;
      },
      async refund() {},
      async verifyConnection() {
        return { configured: false, mode: 'stub', ok: true };
      },
    };
    const events: EventPublisherPort = {
      async publish(e) {
        published.push(e as { type: string });
      },
    };

    const useCase = new CreatePaymentFromReservationUseCase(
      memoryBudgets([budget]),
      memoryPayments(),
      gateway,
      events,
    );
    const payment = await useCase.execute({
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      reservationId: 'r-1',
    });
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payment.checkoutUrl).toBe('https://mp/checkout');
    expect(published.some((e) => e.type === 'billing.payment.created')).toBe(
      true,
    );
  });

  it('republica evento quando já existe pagamento ativo', async () => {
    const budget = approvedBudget();
    const existing = Payment.create({
      budgetId: budget.id,
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      amount: 100,
      checkoutUrl: 'https://mp/old',
    });
    const published: Array<{ type: string }> = [];
    const useCase = new CreatePaymentFromReservationUseCase(
      memoryBudgets([budget]),
      memoryPayments([existing]),
      {
        createCheckout: jest.fn(),
        getPayment: jest.fn(),
        findPaymentByExternalReference: jest.fn(),
        refund: jest.fn(),
        verifyConnection: jest.fn(),
      },
      {
        async publish(e) {
          published.push(e as { type: string });
        },
      },
    );
    const result = await useCase.execute({
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      reservationId: 'r-1',
    });
    expect(result.id).toBe(existing.id);
    expect(published[0]?.type).toBe('billing.payment.created');
  });

  it('rejeita criar pagamento se orçamento não está aprovado', async () => {
    const budget = Budget.create({
      serviceOrderId: 'os-2',
      correlationId: 'os-2',
      items: [],
      servicesTotal: 10,
      partsTotal: 0,
      total: 10,
      client,
    });
    expect(budget.status).toBe(BudgetStatus.PENDING);
    const useCase = new CreatePaymentFromReservationUseCase(
      memoryBudgets([budget]),
      memoryPayments(),
      {
        createCheckout: jest.fn(),
        getPayment: jest.fn(),
        findPaymentByExternalReference: jest.fn(),
        refund: jest.fn(),
        verifyConnection: jest.fn(),
      },
      { async publish() {} },
    );
    await expect(
      useCase.execute({
        serviceOrderId: 'os-2',
        correlationId: 'os-2',
        reservationId: 'r-1',
      }),
    ).rejects.toThrow(/Cannot create payment/);
  });

  it('publica billing.payment.failed quando o gateway falha', async () => {
    const budget = approvedBudget('os-3');
    const published: Array<{ type: string }> = [];
    const useCase = new CreatePaymentFromReservationUseCase(
      memoryBudgets([budget]),
      memoryPayments(),
      {
        async createCheckout() {
          throw new Error('MP down');
        },
        getPayment: jest.fn(),
        findPaymentByExternalReference: jest.fn(),
        refund: jest.fn(),
        verifyConnection: jest.fn(),
      },
      {
        async publish(e) {
          published.push(e as { type: string });
        },
      },
    );
    await expect(
      useCase.execute({
        serviceOrderId: 'os-3',
        correlationId: 'os-3',
        reservationId: 'r-1',
      }),
    ).rejects.toThrow(/MP down/);
    expect(published[0]?.type).toBe('billing.payment.failed');
  });

  it('confirma pagamento aprovado via notificação', async () => {
    const payment = Payment.create({
      budgetId: 'b1',
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      amount: 50,
    });
    const published: Array<{ type: string }> = [];
    const useCase = new HandlePaymentNotificationUseCase(
      memoryPayments([payment]),
      {
        async getPayment() {
          return {
            providerPaymentId: 'mp-1',
            status: 'approved',
            externalReference: payment.id,
          };
        },
        createCheckout: jest.fn(),
        findPaymentByExternalReference: jest.fn(),
        refund: jest.fn(),
        verifyConnection: jest.fn(),
      },
      {
        async publish(e) {
          published.push(e as { type: string });
        },
      },
    );
    const updated = await useCase.execute('mp-1');
    expect(updated?.status).toBe(PaymentStatus.CONFIRMED);
    expect(published[0]?.type).toBe('billing.payment.confirmed');
  });

  it('marca falha quando notificação rejeita', async () => {
    const payment = Payment.create({
      budgetId: 'b1',
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      amount: 50,
    });
    const published: Array<{ type: string }> = [];
    const useCase = new HandlePaymentNotificationUseCase(
      memoryPayments([payment]),
      {
        async getPayment() {
          return {
            providerPaymentId: 'mp-2',
            status: 'rejected',
            externalReference: payment.id,
          };
        },
        createCheckout: jest.fn(),
        findPaymentByExternalReference: jest.fn(),
        refund: jest.fn(),
        verifyConnection: jest.fn(),
      },
      {
        async publish(e) {
          published.push(e as { type: string });
        },
      },
    );
    const updated = await useCase.execute('mp-2');
    expect(updated?.status).toBe(PaymentStatus.FAILED);
    expect(published[0]?.type).toBe('billing.payment.failed');
  });

  it('estorna pagamento confirmado', async () => {
    const payment = Payment.create({
      budgetId: 'b1',
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      amount: 50,
    });
    payment.confirm('mp-9');
    const published: Array<{ type: string }> = [];
    const useCase = new RefundPaymentUseCase(
      memoryPayments([payment]),
      {
        async refund() {},
        createCheckout: jest.fn(),
        getPayment: jest.fn(),
        findPaymentByExternalReference: jest.fn(),
        verifyConnection: jest.fn(),
      },
      {
        async publish(e) {
          published.push(e as { type: string });
        },
      },
    );
    const refunded = await useCase.byServiceOrderId('os-1');
    expect(refunded?.status).toBe(PaymentStatus.REFUNDED);
    expect(published[0]?.type).toBe('billing.payment.refunded');
  });

  it('expira pagamentos pendentes vencidos', async () => {
    const payment = Payment.create({
      budgetId: 'b1',
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      amount: 50,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const published: Array<{ type: string }> = [];
    const useCase = new ExpirePendingPaymentsUseCase(
      memoryPayments([payment]),
      {
        async publish(e) {
          published.push(e as { type: string });
        },
      },
    );
    const count = await useCase.execute(new Date('2020-01-02T00:00:00.000Z'));
    expect(count).toBe(1);
    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(published[0]?.type).toBe('billing.payment.failed');
  });

  it('GetPayment busca por id e por OS', async () => {
    const payment = Payment.create({
      budgetId: 'b1',
      serviceOrderId: 'os-1',
      correlationId: 'os-1',
      amount: 10,
    });
    const repo = memoryPayments([payment]);
    const useCase = new GetPaymentUseCase(repo);
    expect((await useCase.byId(payment.id)).id).toBe(payment.id);
    expect(await useCase.byServiceOrderId('os-1')).toHaveLength(1);
    await expect(useCase.byId('missing')).rejects.toThrow(/not found/i);
  });
});
