import { ConfigService } from '@nestjs/config';
import { MercadoPagoPaymentGateway } from './mercado-pago-payment.gateway';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('MercadoPagoPaymentGateway', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('modo stub quando MP_ACCESS_TOKEN ausente', async () => {
    const gateway = new MercadoPagoPaymentGateway(configWith({}));
    const connection = await gateway.verifyConnection();
    expect(connection.configured).toBe(false);
    expect(connection.mode).toBe('stub');
    expect(connection.ok).toBe(true);

    const checkout = await gateway.createCheckout({
      paymentId: 'pay-1',
      correlationId: 'os-1',
      serviceOrderId: 'os-1',
      amount: 150,
      description: 'OS os-1',
      payerEmail: 'a@b.com',
      payerName: 'Maria Silva',
    });
    expect(checkout.preferenceId).toContain('stub-pref');
    expect(checkout.checkoutUrl).toContain('/payments/stub-checkout/pay-1');
  });

  it('cria preferência real e usa sandbox_init_point', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = jest.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'pref-123',
          init_point:
            'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-123',
          sandbox_init_point:
            'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-123',
        }),
        text: async () => '',
      } as Response;
    }) as typeof fetch;

    const gateway = new MercadoPagoPaymentGateway(
      configWith({
        MP_ACCESS_TOKEN: 'APP_USR-test',
        MP_SANDBOX: 'true',
        MP_SUCCESS_URL: 'https://front/ok',
        MP_FAILURE_URL: 'https://front/fail',
        MP_NOTIFICATION_URL: 'https://api/webhooks/mercado-pago',
      }),
    );

    const result = await gateway.createCheckout({
      paymentId: 'pay-2',
      correlationId: 'os-2',
      serviceOrderId: 'os-2',
      amount: 99.9,
      description: 'Troca de óleo',
      payerEmail: 'cli@example.com',
      payerName: 'João Souza',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(result.preferenceId).toBe('pref-123');
    expect(result.checkoutUrl).toContain('sandbox.mercadopago');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/checkout/preferences');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.external_reference).toBe('pay-2');
    expect(body.auto_return).toBe('approved');
    expect(body.back_urls.success).toBe('https://front/ok');
    expect(body.payer.name).toBe('João');
    expect(body.payer.surname).toBe('Souza');
    expect(body.notification_url).toBe('https://api/webhooks/mercado-pago');
  });

  it('verifyConnection consulta /users/me', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 123,
        nickname: 'OFICINA_TEST',
        email: 'oficina@test.com',
      }),
      text: async () => '',
    })) as typeof fetch;

    const gateway = new MercadoPagoPaymentGateway(
      configWith({ MP_ACCESS_TOKEN: 'APP_USR-test', MP_SANDBOX: 'true' }),
    );
    const status = await gateway.verifyConnection();
    expect(status.ok).toBe(true);
    expect(status.configured).toBe(true);
    expect(status.collectorId).toBe('123');
    expect(status.nickname).toBe('OFICINA_TEST');
  });

  it('busca pagamento por external_reference', async () => {
    global.fetch = jest.fn(async (url: string | URL) => {
      expect(String(url)).toContain('/v1/payments/search');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              id: 999,
              status: 'approved',
              external_reference: 'pay-9',
              transaction_amount: 10,
            },
          ],
        }),
        text: async () => '',
      } as Response;
    }) as typeof fetch;

    const gateway = new MercadoPagoPaymentGateway(
      configWith({ MP_ACCESS_TOKEN: 'APP_USR-test' }),
    );
    const found = await gateway.findPaymentByExternalReference('pay-9');
    expect(found?.providerPaymentId).toBe('999');
    expect(found?.status).toBe('approved');
  });

  describe('MP_FALLBACK_STUB', () => {
    const checkoutInput = {
      paymentId: 'pay-3',
      correlationId: 'os-3',
      serviceOrderId: 'os-3',
      amount: 50,
      description: 'OS os-3',
      payerEmail: 'a@b.com',
      payerName: 'Ana',
    };

    beforeEach(() => {
      global.fetch = jest.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'internal error',
      })) as typeof fetch;
    });

    it('com fallback, API fora cai no stub (checkout e aprovação)', async () => {
      const gateway = new MercadoPagoPaymentGateway(
        configWith({
          MP_ACCESS_TOKEN: 'APP_USR-test',
          MP_FALLBACK_STUB: 'true',
        }),
      );

      const checkout = await gateway.createCheckout(checkoutInput);
      expect(checkout.checkoutUrl).toContain('/payments/stub-checkout/pay-3');

      const providerPaymentId = gateway.stubApprove('pay-3', 50);
      const lookup = await gateway.getPayment(providerPaymentId);
      expect(lookup.status).toBe('approved');
      expect(
        (await gateway.findPaymentByExternalReference('pay-3'))?.status,
      ).toBe('approved');
    });

    it('sem fallback, erro da API sobe', async () => {
      const gateway = new MercadoPagoPaymentGateway(
        configWith({ MP_ACCESS_TOKEN: 'APP_USR-test' }),
      );
      await expect(gateway.createCheckout(checkoutInput)).rejects.toThrow(
        'Mercado Pago respondeu 500',
      );
    });

    it('refund nunca cai no stub', async () => {
      const gateway = new MercadoPagoPaymentGateway(
        configWith({
          MP_ACCESS_TOKEN: 'APP_USR-test',
          MP_FALLBACK_STUB: 'true',
        }),
      );
      await expect(gateway.refund('999')).rejects.toThrow(
        'Mercado Pago respondeu 500',
      );
    });
  });
});
