import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { HandlePaymentNotificationUseCase } from '../../../application/use-case/payment';

type MercadoPagoWebhookBody = {
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

@ApiTags('Billing / Webhooks')
@Controller('webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly handleNotification: HandlePaymentNotificationUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post()
  async handle(
    @Body() body: MercadoPagoWebhookBody,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ ok: true }> {
    this.assertSignature(body, signature, requestId);

    const providerPaymentId = body.data?.id ? String(body.data.id) : undefined;
    if (!providerPaymentId) {
      this.logger.warn('webhook sem data.id');
      return { ok: true };
    }

    if (body.type && body.type !== 'payment') {
      return { ok: true };
    }

    await this.handleNotification.execute(providerPaymentId);
    return { ok: true };
  }

  private assertSignature(
    body: MercadoPagoWebhookBody,
    signature: string | undefined,
    requestId: string | undefined,
  ): void {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      // Lab sem segredo: aceita. Em produção configure MP_WEBHOOK_SECRET.
      return;
    }
    if (!signature || !requestId || !body.data?.id) {
      throw new Error('Invalid Mercado Pago signature headers');
    }

    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k.trim(), v?.trim() ?? ''];
      }),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    const manifest = `id:${body.data.id};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(v1 || '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Invalid Mercado Pago signature');
    }
  }
}
