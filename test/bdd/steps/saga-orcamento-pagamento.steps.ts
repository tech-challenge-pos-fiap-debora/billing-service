import { loadFeature, defineFeature } from 'jest-cucumber';
import { resolve } from 'path';
import { GenerateBudgetFromEventUseCase } from '../../../src/billing/application/use-case/budget/generate-budget-from-event';
import { MarkBudgetApprovedUseCase } from '../../../src/billing/application/use-case/budget/mark-budget-approved';
import { CancelBudgetUseCase } from '../../../src/billing/application/use-case/budget/cancel-budget';
import { CreatePaymentFromReservationUseCase } from '../../../src/billing/application/use-case/payment/create-payment-from-reservation';
import { HandlePaymentNotificationUseCase } from '../../../src/billing/application/use-case/payment/handle-payment-notification';
import { Budget } from '../../../src/billing/domain/entities/budget';
import { BudgetStatus } from '../../../src/billing/domain/entities/budget-status';
import { Payment } from '../../../src/billing/domain/entities/payment';
import { PaymentStatus } from '../../../src/billing/domain/entities/payment-status';
import type { BudgetRepositoryInterface } from '../../../src/billing/domain/repositories/budget.repository';
import type { PaymentRepositoryInterface } from '../../../src/billing/domain/repositories/payment.repository';
import type { StockQuotePort } from '../../../src/billing/domain/ports/stock-quote.port';
import type {
  EventPublisherPort,
  PublishableEvent,
} from '../../../src/shared/domain/ports/event-publisher.port';
import type { BudgetDeliveryNotifier } from '../../../src/billing/domain/ports/budget-delivery-notifier.port';
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  GatewayConnectionStatus,
  GatewayPaymentLookup,
  PaymentGatewayPort,
} from '../../../src/billing/domain/ports/payment-gateway.port';

const feature = loadFeature(
  resolve(__dirname, '../features/saga-orcamento-pagamento.feature'),
);

type World = {
  serviceOrderId: string;
  budgets: BudgetRepositoryInterface & { store: Map<string, Budget> };
  payments: PaymentRepositoryInterface & { store: Map<string, Payment> };
  events: PublishableEvent[];
  stock: StockQuotePort;
  publisher: EventPublisherPort;
  notifier: BudgetDeliveryNotifier;
  gateway: PaymentGatewayPort & {
    stubApprove: (paymentId: string, amount: number) => string;
  };
  generateBudget: GenerateBudgetFromEventUseCase;
  markApproved: MarkBudgetApprovedUseCase;
  cancelBudget: CancelBudgetUseCase;
  createPayment: CreatePaymentFromReservationUseCase;
  handleNotification: HandlePaymentNotificationUseCase;
};

function memoryBudgets(): World['budgets'] {
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

function memoryPayments(): World['payments'] {
  const store = new Map<string, Payment>();
  return {
    store,
    async create(payment) {
      store.set(payment.id, payment);
      return payment;
    },
    async save(payment) {
      store.set(payment.id, payment);
      return payment;
    },
    async findById(id) {
      return store.get(id) ?? null;
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
    async findByServiceOrderId(serviceOrderId) {
      return [...store.values()].filter(
        (p) => p.serviceOrderId === serviceOrderId,
      );
    },
    async findExpiredPending() {
      return [];
    },
  };
}

function stubGateway(): World['gateway'] {
  const stubs = new Map<
    string,
    { status: 'approved' | 'rejected'; externalReference: string; amount: number }
  >();
  return {
    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
      return {
        preferenceId: `stub-pref-${input.paymentId}`,
        checkoutUrl: `http://localhost/stub/${input.paymentId}`,
        expiresAt: input.expiresAt,
      };
    },
    async getPayment(providerPaymentId: string): Promise<GatewayPaymentLookup> {
      const stub = stubs.get(providerPaymentId);
      if (!stub) return { providerPaymentId, status: 'unknown' };
      return {
        providerPaymentId,
        status: stub.status,
        externalReference: stub.externalReference,
        amount: stub.amount,
      };
    },
    async findPaymentByExternalReference(externalReference: string) {
      for (const [id, stub] of stubs.entries()) {
        if (stub.externalReference === externalReference) {
          return {
            providerPaymentId: id,
            status: stub.status,
            externalReference: stub.externalReference,
            amount: stub.amount,
          };
        }
      }
      return null;
    },
    async refund() {},
    async verifyConnection(): Promise<GatewayConnectionStatus> {
      return { configured: false, mode: 'stub', ok: true };
    },
    stubApprove(paymentId: string, amount: number) {
      const id = `stub-pay-${paymentId}`;
      stubs.set(id, {
        status: 'approved',
        externalReference: paymentId,
        amount,
      });
      return id;
    },
  };
}

function buildWorld(serviceOrderId: string): World {
  const budgets = memoryBudgets();
  const payments = memoryPayments();
  const events: PublishableEvent[] = [];
  const publisher: EventPublisherPort = {
    async publish(event) {
      events.push(event);
    },
  };
  const stock: StockQuotePort = {
    async quoteFifoCost(demand) {
      return demand.map((d) => ({
        productCode: d.productCode,
        required: d.required,
        totalCost: d.required * 25,
        unitPrice: 25,
      }));
    },
  };
  const notifier: BudgetDeliveryNotifier = {
    async notifyBudgetReady() {},
  };
  const gateway = stubGateway();
  return {
    serviceOrderId,
    budgets,
    payments,
    events,
    stock,
    publisher,
    notifier,
    gateway,
    generateBudget: new GenerateBudgetFromEventUseCase(
      budgets,
      stock,
      publisher,
      notifier,
    ),
    markApproved: new MarkBudgetApprovedUseCase(budgets),
    cancelBudget: new CancelBudgetUseCase(budgets),
    createPayment: new CreatePaymentFromReservationUseCase(
      budgets,
      payments,
      gateway,
      publisher,
    ),
    handleNotification: new HandlePaymentNotificationUseCase(
      payments,
      gateway,
      publisher,
    ),
  };
}

defineFeature(feature, (test) => {
  let world: World;

  test('Fluxo feliz até confirmação do pagamento', ({ given, and, when, then }) => {
    given(/^uma ordem de serviço "(.*)" com serviço e peça$/, (osId: string) => {
      world = buildWorld(osId);
    });

    and('o gateway de pagamento em modo stub', () => {
      expect(world.gateway).toBeDefined();
    });

    when(/^o billing recebe o evento "(.*)"$/, async (type: string) => {
      await dispatch(world, type);
    });

    then(/^um orçamento é gerado com status "(.*)"$/, async (status: string) => {
      const budget = await world.budgets.findByServiceOrderId(world.serviceOrderId);
      expect(budget).toBeTruthy();
      expect(budget!.status).toBe(status);
    });

    and(/^o evento "(.*)" é publicado$/, (type: string) => {
      expect(world.events.some((e) => e.type === type)).toBe(true);
    });

    when(/^o billing recebe o evento "(.*)"$/, async (type: string) => {
      await dispatch(world, type);
    });

    then(/^o orçamento fica com status "(.*)"$/, async (status: string) => {
      const budget = await world.budgets.findByServiceOrderId(world.serviceOrderId);
      expect(budget!.status).toBe(status);
    });

    when(/^o billing recebe o evento "(.*)"$/, async (type: string) => {
      await dispatch(world, type);
    });

    then('um pagamento pendente é criado', async () => {
      const list = await world.payments.findByServiceOrderId(world.serviceOrderId);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0].status).toBe(PaymentStatus.PENDING);
    });

    and(/^o evento "(.*)" é publicado$/, (type: string) => {
      expect(world.events.some((e) => e.type === type)).toBe(true);
    });

    when('o Mercado Pago confirma o pagamento', async () => {
      const list = await world.payments.findByServiceOrderId(world.serviceOrderId);
      const payment = list[0];
      const providerId = world.gateway.stubApprove(payment.id, payment.amount);
      await world.handleNotification.execute(providerId);
    });

    then(/^o pagamento fica com status "(.*)"$/, async (status: string) => {
      const list = await world.payments.findByServiceOrderId(world.serviceOrderId);
      expect(list[0].status).toBe(status);
    });

    and(/^o evento "(.*)" é publicado$/, (type: string) => {
      expect(world.events.some((e) => e.type === type)).toBe(true);
    });
  });

  test('Compensação quando a reserva de estoque falha', ({ given, and, when, then }) => {
    given(/^uma ordem de serviço "(.*)" com serviço e peça$/, (osId: string) => {
      world = buildWorld(osId);
    });

    and('o gateway de pagamento em modo stub', () => {
      expect(world.gateway).toBeDefined();
    });

    when(/^o billing recebe o evento "(.*)"$/, async (type: string) => {
      await dispatch(world, type);
    });

    and(/^o billing recebe o evento "(.*)"$/, async (type: string) => {
      await dispatch(world, type);
    });

    when(/^o billing recebe o evento "(.*)"$/, async (type: string) => {
      await dispatch(world, type);
    });

    then(/^o orçamento fica com status "(.*)"$/, async (status: string) => {
      const budget = await world.budgets.findByServiceOrderId(world.serviceOrderId);
      expect(budget!.status).toBe(status);
    });

    and('nenhum pagamento ativo permanece para a ordem', async () => {
      const list = await world.payments.findByServiceOrderId(world.serviceOrderId);
      const active = list.filter(
        (p) =>
          p.status === PaymentStatus.PENDING ||
          p.status === PaymentStatus.CONFIRMED,
      );
      expect(active).toHaveLength(0);
    });
  });
});

async function dispatch(world: World, type: string): Promise<void> {
  const osId = world.serviceOrderId;
  switch (type) {
    case 'order.budget.requested':
      await world.generateBudget.execute({
        serviceOrderId: osId,
        correlationId: osId,
        client: {
          id: 'c1',
          document: '52998224725',
          name: 'Cliente BDD',
          email: 'bdd@example.com',
        },
        serviceLines: [
          {
            catalogServiceId: 'svc-1',
            name: 'Troca de óleo',
            unitPrice: 100,
            quantity: 1,
          },
        ],
        partDemand: [{ productCode: 'OLEO', name: 'Óleo', quantity: 1 }],
      });
      break;
    case 'order.budget.approved': {
      const budget = await world.budgets.findByServiceOrderId(osId);
      await world.markApproved.execute(osId, budget?.id);
      break;
    }
    case 'stock.reserved':
      await world.createPayment.execute({
        serviceOrderId: osId,
        reservationId: 'res-bdd-1',
        correlationId: osId,
      });
      break;
    case 'stock.reservation.failed':
      await world.cancelBudget.execute(osId, 'Falha na reserva de estoque');
      break;
    default:
      throw new Error(`evento BDD não mapeado: ${type}`);
  }
}
