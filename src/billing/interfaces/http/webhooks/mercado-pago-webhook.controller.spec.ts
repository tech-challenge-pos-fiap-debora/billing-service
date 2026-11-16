import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

describe('MercadoPagoWebhookController', () => {
  const handleNotification = { execute: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('aceita webhook sem secret (lab) e processa payment', async () => {
    const controller = new MercadoPagoWebhookController(
      handleNotification as never,
      configWith({}),
    );
    const result = await controller.handle(
      { type: 'payment', data: { id: 'mp-1' } },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(result).toEqual({ ok: true });
    expect(handleNotification.execute).toHaveBeenCalledWith('mp-1');
  });

  it('ignora evento que não é payment', async () => {
    const controller = new MercadoPagoWebhookController(
      handleNotification as never,
      configWith({}),
    );
    await controller.handle({ type: 'merchant_order', data: { id: '1' } });
    expect(handleNotification.execute).not.toHaveBeenCalled();
  });

  it('valida assinatura HMAC quando MP_WEBHOOK_SECRET está setado', async () => {
    const secret = 'whsec';
    const dataId = '99';
    const requestId = 'req-1';
    const ts = '123';
    const v1 = createHmac('sha256', secret)
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest('hex');
    const controller = new MercadoPagoWebhookController(
      handleNotification as never,
      configWith({ MP_WEBHOOK_SECRET: secret }),
    );
    await controller.handle(
      { type: 'payment', data: { id: dataId }, live_mode: false },
      undefined,
      undefined,
      undefined,
      `ts=${ts},v1=${v1}`,
      requestId,
    );
    expect(handleNotification.execute).toHaveBeenCalledWith(dataId);

    await expect(
      controller.handle(
        { type: 'payment', data: { id: dataId } },
        undefined,
        undefined,
        undefined,
        `ts=${ts},v1=deadbeef`,
        requestId,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolve id pela query IPN antiga', async () => {
    const controller = new MercadoPagoWebhookController(
      handleNotification as never,
      configWith({}),
    );
    await controller.handle({}, 'topic_payment', 'ipn-7');
    expect(handleNotification.execute).toHaveBeenCalledWith('ipn-7');
  });
});
