import { ConfigService } from '@nestjs/config';
import { SagaEventsConsumer } from './saga-events.consumer';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('SagaEventsConsumer (billing)', () => {
  const generateBudget = { execute: jest.fn() };
  const markApproved = { execute: jest.fn() };
  const markRejected = { execute: jest.fn() };
  const cancelBudget = { execute: jest.fn() };
  const createPayment = { execute: jest.fn() };
  const refundPayment = { byServiceOrderId: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function build() {
    return new SagaEventsConsumer(
      configWith({}), // sem SQS_QUEUE_URL → poll não sobe
      generateBudget as never,
      markApproved as never,
      markRejected as never,
      cancelBudget as never,
      createPayment as never,
      refundPayment as never,
    );
  }

  it('despacha order.budget.requested', async () => {
    const consumer = build();
    await consumer.handleRaw(
      JSON.stringify({
        type: 'order.budget.requested',
        correlationId: 'os-1',
        eventId: 'e1',
        payload: {
          serviceOrderId: 'os-1',
          client: { id: 'c1', document: '1', name: 'A', email: 'a@b.com' },
          serviceLines: [],
          partDemand: [],
        },
      }),
    );
    expect(generateBudget.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: 'os-1',
        correlationId: 'os-1',
        causationId: 'e1',
      }),
    );
  });

  it('despacha stock.reserved → cria pagamento', async () => {
    const consumer = build();
    await consumer.handleRaw(
      JSON.stringify({
        Message: JSON.stringify({
          type: 'stock.reserved',
          correlationId: 'os-1',
          eventId: 'e2',
          payload: { serviceOrderId: 'os-1', reservationId: 'r-1' },
        }),
      }),
    );
    expect(createPayment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceOrderId: 'os-1',
        reservationId: 'r-1',
        correlationId: 'os-1',
      }),
    );
  });

  it('ignora tipo desconhecido', async () => {
    const consumer = build();
    await consumer.handleRaw(
      JSON.stringify({
        type: 'order.budget.requested.unknown',
        correlationId: 'os-1',
        payload: {},
      }),
    );
    expect(generateBudget.execute).not.toHaveBeenCalled();
  });

  it('usa motivo padrão quando reservation.failed não traz reason', async () => {
    const consumer = build();
    await consumer.handleRaw(
      JSON.stringify({
        type: 'stock.reservation.failed',
        correlationId: 'os-1',
        payload: { serviceOrderId: 'os-1' },
      }),
    );
    expect(cancelBudget.execute).toHaveBeenCalledWith(
      'os-1',
      'Falha na reserva de estoque',
    );
  });

  it('despacha approved, rejected, reservation.failed e cancelled', async () => {
    const consumer = build();
    await consumer.handleRaw(
      JSON.stringify({
        type: 'order.budget.approved',
        correlationId: 'os-1',
        payload: { serviceOrderId: 'os-1', budgetId: 'b1' },
      }),
    );
    expect(markApproved.execute).toHaveBeenCalledWith('os-1', 'b1');

    await consumer.handleRaw(
      JSON.stringify({
        type: 'order.budget.rejected',
        correlationId: 'os-1',
        payload: { serviceOrderId: 'os-1', reason: 'nope', budgetId: 'b1' },
      }),
    );
    expect(markRejected.execute).toHaveBeenCalledWith('os-1', 'nope', 'b1');

    await consumer.handleRaw(
      JSON.stringify({
        type: 'stock.reservation.failed',
        correlationId: 'os-1',
        payload: { serviceOrderId: 'os-1', reason: 'sem estoque' },
      }),
    );
    expect(cancelBudget.execute).toHaveBeenCalledWith('os-1', 'sem estoque');

    await consumer.handleRaw(
      JSON.stringify({
        type: 'order.cancelled',
        correlationId: 'os-1',
        payload: { serviceOrderId: 'os-1', reason: 'cliente' },
      }),
    );
    expect(cancelBudget.execute).toHaveBeenCalledWith('os-1', 'cliente');
    expect(refundPayment.byServiceOrderId).toHaveBeenCalledWith('os-1');
  });
});
