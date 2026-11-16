import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IntegrationError } from '../../../shared/domain/errors';
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  GatewayConnectionStatus,
  GatewayPaymentLookup,
  GatewayPaymentStatus,
  PaymentGatewayPort,
} from '../../domain/ports/payment-gateway.port';

type StubPayment = {
  status: GatewayPaymentStatus;
  externalReference: string;
  amount: number;
};

type MpPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type MpPaymentResponse = {
  id: number | string;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
};

type MpUserMeResponse = {
  id?: number | string;
  nickname?: string;
  email?: string;
};

/**
 * Gateway Mercado Pago (Checkout Pro) — conta Mercado Livre / Mercado Pago.
 * Sem `MP_ACCESS_TOKEN`, usa stub em memória para lab local.
 * Com `MP_FALLBACK_STUB=true`, falhas da API também caem no stub (exceto refund).
 */
@Injectable()
export class MercadoPagoPaymentGateway implements PaymentGatewayPort {
  private readonly logger = new Logger(MercadoPagoPaymentGateway.name);
  private readonly stubPayments = new Map<string, StubPayment>();
  private readonly apiBase = 'https://api.mercadopago.com';

  constructor(private readonly config: ConfigService) {}

  private get accessToken(): string | undefined {
    return this.config.get<string>('MP_ACCESS_TOKEN')?.trim() || undefined;
  }

  private get useSandbox(): boolean {
    const raw = this.config.get<string>('MP_SANDBOX')?.trim().toLowerCase();
    if (raw === 'false' || raw === '0') return false;
    // Default sandbox quando token existe (lab / homologação).
    return raw !== undefined ? raw === 'true' || raw === '1' : true;
  }

  private get timeoutMs(): number {
    return Number(this.config.get<string>('MP_TIMEOUT_MS') ?? 10_000);
  }

  /** Lab: com token, cai no stub se a API do Mercado Pago falhar. Nunca ligar em produção. */
  private get fallbackToStub(): boolean {
    const raw = this.config
      .get<string>('MP_FALLBACK_STUB')
      ?.trim()
      .toLowerCase();
    return raw === 'true' || raw === '1';
  }

  private async withStubFallback<T>(
    operation: string,
    real: () => Promise<T>,
    stub: () => T,
  ): Promise<T> {
    if (!this.accessToken) return stub();
    try {
      return await real();
    } catch (error) {
      if (!this.fallbackToStub) throw error;
      this.logger.warn(
        `Mercado Pago indisponível em ${operation}; usando stub: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return stub();
    }
  }

  async verifyConnection(): Promise<GatewayConnectionStatus> {
    if (!this.accessToken) {
      return {
        configured: false,
        mode: 'stub',
        ok: true,
        detail: 'MP_ACCESS_TOKEN ausente; gateway em modo stub',
      };
    }

    try {
      const data = await this.mpRequest<MpUserMeResponse>('GET', '/users/me');
      return {
        configured: true,
        mode: this.useSandbox ? 'sandbox' : 'live',
        ok: true,
        collectorId: data.id !== undefined ? String(data.id) : undefined,
        nickname: data.nickname,
        email: data.email,
      };
    } catch (error) {
      return {
        configured: true,
        mode: this.useSandbox ? 'sandbox' : 'live',
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    return this.withStubFallback(
      'createCheckout',
      () => this.createMpCheckout(input),
      () => {
        this.logger.warn(`checkout stub paymentId=${input.paymentId}`);
        return {
          preferenceId: `stub-pref-${input.paymentId}`,
          checkoutUrl: `http://localhost:3004/payments/stub-checkout/${input.paymentId}`,
          expiresAt: input.expiresAt,
        };
      },
    );
  }

  private async createMpCheckout(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const { name, surname } = this.splitName(input.payerName);
    const backUrls = this.buildBackUrls();
    const notificationUrl = this.config
      .get<string>('MP_NOTIFICATION_URL')
      ?.trim();

    const body: Record<string, unknown> = {
      external_reference: input.paymentId,
      items: [
        {
          id: input.serviceOrderId,
          title: input.description.slice(0, 256),
          description: `Ordem de serviço ${input.serviceOrderId}`,
          category_id: 'services',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(input.amount.toFixed(2)),
        },
      ],
      payer: {
        name,
        surname,
        email: input.payerEmail,
      },
      statement_descriptor: (
        this.config.get<string>('MP_STATEMENT_DESCRIPTOR') || 'OFICINA'
      ).slice(0, 22),
      metadata: {
        correlation_id: input.correlationId,
        service_order_id: input.serviceOrderId,
        payment_id: input.paymentId,
      },
    };

    if (notificationUrl) {
      body.notification_url = notificationUrl;
    }

    if (Object.keys(backUrls).length > 0) {
      body.back_urls = backUrls;
      if (backUrls.success) {
        body.auto_return = 'approved';
      }
    }

    if (input.expiresAt) {
      body.expires = true;
      body.expiration_date_to = input.expiresAt.toISOString();
    }

    const data = await this.mpRequest<MpPreferenceResponse>(
      'POST',
      '/checkout/preferences',
      body,
      input.paymentId,
    );

    const checkoutUrl = this.pickCheckoutUrl(data);
    if (!checkoutUrl) {
      throw new IntegrationError(
        'Mercado Pago não retornou init_point/sandbox_init_point',
        { code: 'MP_PREFERENCE_NO_URL' },
      );
    }

    this.logger.log(
      `preference criada preferenceId=${data.id} paymentId=${input.paymentId} sandbox=${this.useSandbox}`,
    );

    return {
      preferenceId: data.id,
      checkoutUrl,
      expiresAt: input.expiresAt,
    };
  }

  getPayment(providerPaymentId: string): Promise<GatewayPaymentLookup> {
    return this.withStubFallback<GatewayPaymentLookup>(
      'getPayment',
      async () => {
        const data = await this.mpRequest<MpPaymentResponse>(
          'GET',
          `/v1/payments/${encodeURIComponent(providerPaymentId)}`,
        );
        return {
          providerPaymentId: String(data.id),
          status: this.mapStatus(data.status),
          externalReference: data.external_reference,
          amount: data.transaction_amount,
        };
      },
      () => {
        const stub = this.stubPayments.get(providerPaymentId);
        if (!stub) {
          return { providerPaymentId, status: 'unknown' };
        }
        return {
          providerPaymentId,
          status: stub.status,
          externalReference: stub.externalReference,
          amount: stub.amount,
        };
      },
    );
  }

  findPaymentByExternalReference(
    externalReference: string,
  ): Promise<GatewayPaymentLookup | null> {
    return this.withStubFallback(
      'findPaymentByExternalReference',
      async () => {
        const query = new URLSearchParams({
          external_reference: externalReference,
          sort: 'date_created',
          criteria: 'desc',
        });
        const data = await this.mpRequest<{ results?: MpPaymentResponse[] }>(
          'GET',
          `/v1/payments/search?${query.toString()}`,
        );
        const first = data.results?.[0];
        if (!first) return null;
        return {
          providerPaymentId: String(first.id),
          status: this.mapStatus(first.status),
          externalReference: first.external_reference,
          amount: first.transaction_amount,
        };
      },
      () => {
        for (const [providerPaymentId, stub] of this.stubPayments.entries()) {
          if (stub.externalReference === externalReference) {
            return {
              providerPaymentId,
              status: stub.status,
              externalReference: stub.externalReference,
              amount: stub.amount,
            };
          }
        }
        return null;
      },
    );
  }

  async refund(providerPaymentId: string): Promise<void> {
    if (!this.accessToken) {
      const stub = this.stubPayments.get(providerPaymentId);
      if (stub) stub.status = 'cancelled';
      this.logger.warn(`refund stub providerPaymentId=${providerPaymentId}`);
      return;
    }

    await this.mpRequest(
      'POST',
      `/v1/payments/${encodeURIComponent(providerPaymentId)}/refunds`,
      {},
      randomUUID(),
    );
  }

  /** Lab: simula webhook aprovando um pagamento pelo id interno. */
  stubApprove(paymentId: string, amount: number): string {
    const providerPaymentId = `stub-pay-${paymentId}`;
    this.stubPayments.set(providerPaymentId, {
      status: 'approved',
      externalReference: paymentId,
      amount,
    });
    return providerPaymentId;
  }

  stubReject(paymentId: string, amount: number): string {
    const providerPaymentId = `stub-pay-${paymentId}`;
    this.stubPayments.set(providerPaymentId, {
      status: 'rejected',
      externalReference: paymentId,
      amount,
    });
    return providerPaymentId;
  }

  private pickCheckoutUrl(data: MpPreferenceResponse): string {
    if (this.useSandbox) {
      return data.sandbox_init_point || data.init_point || '';
    }
    return data.init_point || data.sandbox_init_point || '';
  }

  private buildBackUrls(): Record<string, string> {
    const urls: Record<string, string> = {};
    const success = this.config.get<string>('MP_SUCCESS_URL')?.trim();
    const failure = this.config.get<string>('MP_FAILURE_URL')?.trim();
    const pending = this.config.get<string>('MP_PENDING_URL')?.trim();
    if (success) urls.success = success;
    if (failure) urls.failure = failure;
    if (pending) urls.pending = pending;
    return urls;
  }

  private splitName(fullName: string): { name: string; surname: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { name: 'Cliente', surname: 'Oficina' };
    if (parts.length === 1) return { name: parts[0], surname: parts[0] };
    return {
      name: parts[0],
      surname: parts.slice(1).join(' '),
    };
  }

  private mapStatus(status: string): GatewayPaymentStatus {
    switch (status) {
      case 'approved':
        return 'approved';
      case 'rejected':
        return 'rejected';
      case 'cancelled':
        return 'cancelled';
      case 'pending':
        return 'pending';
      case 'in_process':
      case 'in_mediation':
        return 'in_process';
      default:
        return 'unknown';
    }
  }

  private async mpRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const token = this.accessToken;
    if (!token) {
      throw new IntegrationError('MP_ACCESS_TOKEN não configurado', {
        code: 'MP_NOT_CONFIGURED',
      });
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    let response: Response;
    try {
      response = await fetch(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new IntegrationError(
        `Falha de rede no Mercado Pago (${method} ${path}): ${
          cause instanceof Error ? cause.message : 'erro desconhecido'
        }`,
        { code: 'MP_UNREACHABLE' },
      );
    }

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(
        `Mercado Pago ${method} ${path} status=${response.status} body=${text}`,
      );
      throw new IntegrationError(
        `Mercado Pago respondeu ${response.status} em ${method} ${path}`,
        { code: 'MP_BAD_RESPONSE' },
      );
    }

    if (response.status === 204) {
      return {} as T;
    }
    return (await response.json()) as T;
  }
}
