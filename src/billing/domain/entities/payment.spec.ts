import { Payment } from './payment';
import { PaymentStatus } from './payment-status';

const baseInput = {
  budgetId: '22222222-2222-4222-8222-222222222222',
  serviceOrderId: '11111111-1111-4111-8111-111111111111',
  correlationId: '11111111-1111-4111-8111-111111111111',
  amount: 150.5,
  preferenceId: 'pref-1',
  checkoutUrl: 'https://mp.example/checkout',
  expiresAt: new Date(Date.now() + 60_000),
};

describe('Payment', () => {
  it('cria pagamento PENDING', () => {
    const payment = Payment.create(baseInput);
    expect(payment.status).toBe(PaymentStatus.PENDING);
    expect(payment.amount).toBe(150.5);
    expect(payment.provider).toBe('MERCADO_PAGO');
    expect(payment.budgetId).toBe(baseInput.budgetId);
    expect(payment.serviceOrderId).toBe(baseInput.serviceOrderId);
    expect(payment.correlationId).toBe(baseInput.correlationId);
    expect(payment.preferenceId).toBe('pref-1');
    expect(payment.checkoutUrl).toContain('checkout');
    expect(payment.expiresAt).toBeInstanceOf(Date);
    expect(payment.createdAt).toBeInstanceOf(Date);
    expect(payment.toJSON().id).toBe(payment.id);
  });

  it('rejeita amount <= 0', () => {
    expect(() => Payment.create({ ...baseInput, amount: 0 })).toThrow(
      /amount must be > 0/,
    );
  });

  it('restaura e anexa preferência', () => {
    const created = Payment.create(baseInput);
    const restored = Payment.restore(
      {
        budgetId: created.budgetId,
        serviceOrderId: created.serviceOrderId,
        correlationId: created.correlationId,
        provider: created.provider,
        status: created.status,
        amount: created.amount,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
      created.id,
    );
    restored.attachGatewayPreference('pref-x', 'https://pay');
    expect(restored.preferenceId).toBe('pref-x');
    expect(restored.checkoutUrl).toBe('https://pay');
  });

  it('confirma pagamento pendente (idempotente)', () => {
    const payment = Payment.create(baseInput);
    payment.confirm('mp-pay-1');
    expect(payment.status).toBe(PaymentStatus.CONFIRMED);
    expect(payment.providerPaymentId).toBe('mp-pay-1');
    expect(payment.paidAt).toBeInstanceOf(Date);
    payment.confirm('mp-pay-1');
    expect(payment.status).toBe(PaymentStatus.CONFIRMED);
  });

  it('falha pagamento pendente (idempotente)', () => {
    const payment = Payment.create(baseInput);
    payment.fail('mp-pay-2');
    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(payment.providerPaymentId).toBe('mp-pay-2');
    payment.fail();
    expect(payment.status).toBe(PaymentStatus.FAILED);
  });

  it('estorna pagamento confirmado (idempotente)', () => {
    const payment = Payment.create(baseInput);
    payment.confirm('mp-pay-3');
    payment.refund();
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.refundedAt).toBeInstanceOf(Date);
    payment.refund();
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
  });

  it('detecta expiração', () => {
    const payment = Payment.create({
      ...baseInput,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(payment.isExpired()).toBe(true);
    const ok = Payment.create(baseInput);
    expect(ok.isExpired()).toBe(false);
  });

  it('não confirma pagamento falho nem estorna pendente', () => {
    const payment = Payment.create(baseInput);
    payment.fail();
    expect(() => payment.confirm('x')).toThrow(/Cannot confirm/);

    const pending = Payment.create(baseInput);
    expect(() => pending.refund()).toThrow(/Cannot refund/);
  });

  it('não falha pagamento confirmado', () => {
    const payment = Payment.create(baseInput);
    payment.confirm('x');
    expect(() => payment.fail()).toThrow(/Cannot fail/);
  });
});
