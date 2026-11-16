import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { HandlePaymentNotificationUseCase } from '../../../application/use-case/payment';

type MercadoPagoWebhookBody = {
  id?: string | number;
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  live_mode?: boolean;
};

/**
 * Webhook / IPN do Mercado Pago.
 * Aceita JSON moderno (`type=payment`, `data.id`) e query antiga (`topic`/`id`).
 */
@ApiTags('Billing / Webhooks')
@Controller('webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(
    private readonly handleNotification: HandlePaymentNotificationUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handle(
    @Body() body: MercadoPagoWebhookBody,
    @Query('topic') topic?: string,
    @Query('id') queryId?: string,
    @Query('data.id') dataIdQuery?: string,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ): Promise<{ ok: true }> {
    const providerPaymentId = this.resolvePaymentId(
      body,
      queryId,
      dataIdQuery,
    );
    const eventType = body.type || body.topic || topic;

    this.assertSignature(body, providerPaymentId, signature, requestId);

    if (!providerPaymentId) {
      this.logger.warn('webhook sem id de pagamento');
      return { ok: true };
    }

    if (eventType && !this.isPaymentEvent(eventType)) {
      this.logger.debug(`evento ignorado type=${eventType}`);
      return { ok: true };
    }

    this.logger.log(
      `webhook payment id=${providerPaymentId} type=${eventType ?? 'payment'}`,
    );
    await this.handleNotification.execute(providerPaymentId);
    return { ok: true };
  }

  private resolvePaymentId(
    body: MercadoPagoWebhookBody,
    queryId?: string,
    dataIdQuery?: string,
  ): string | undefined {
    if (body.data?.id !== undefined && body.data.id !== null) {
      return String(body.data.id);
    }
    if (dataIdQuery) return String(dataIdQuery);
    if (queryId) return String(queryId);
    if (body.id !== undefined && body.id !== null && !body.data) {
      // IPN antigo às vezes manda id na raiz
      return String(body.id);
    }
    return undefined;
  }

  private isPaymentEvent(type: string): boolean {
    const normalized = type.toLowerCase();
    return (
      normalized === 'payment' ||
      normalized.startsWith('payment.') ||
      normalized === 'topic_payment'
    );
  }

  private assertSignature(
    body: MercadoPagoWebhookBody,
    dataId: string | undefined,
    signature: string | undefined,
    requestId: string | undefined,
  ): void {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      // Lab sem segredo: aceita. Em produção configure MP_WEBHOOK_SECRET.
      return;
    }
    if (!signature || !requestId || !dataId) {
      throw new UnauthorizedException('Invalid Mercado Pago signature headers');
    }

    const parts = Object.fromEntries(
      signature.split(',').map((p) => {
        const [k, v] = p.split('=');
        return [k.trim(), v?.trim() ?? ''];
      }),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) {
      throw new UnauthorizedException('Invalid Mercado Pago signature format');
    }

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn(
        `assinatura inválida requestId=${requestId} dataId=${dataId}`,
      );
      throw new UnauthorizedException('Invalid Mercado Pago signature');
    }

    // body.live_mode só para log
    if (body.live_mode === false) {
      this.logger.debug('webhook sandbox/live_mode=false');
    }
  }
}
