import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  GatewayPaymentLookup,
  GatewayPaymentStatus,
  PaymentGatewayPort,
} from '../../domain/ports/payment-gateway.port';

type StubPayment = {
  status: GatewayPaymentStatus;
  externalReference: string;
  amount: number;
};

/**
 * Gateway Mercado Pago (Checkout Pro). Sem `MP_ACCESS_TOKEN`, usa stub em
 * memória para lab local / EKS / testes.
 */
@Injectable()
export class MercadoPagoPaymentGateway implements PaymentGatewayPort {
  private readonly logger = new Logger(MercadoPagoPaymentGateway.name);
  private readonly stubPayments = new Map<string, StubPayment>();

  constructor(private readonly config: ConfigService) {}

  private get accessToken(): string | undefined {
    return this.config.get<string>('MP_ACCESS_TOKEN')?.trim() || undefined;
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (!this.accessToken) {
      const preferenceId = `stub-pref-${input.paymentId}`;
      const checkoutUrl = `http://localhost:3004/stub-checkout/${input.paymentId}`;
      this.logger.warn(
        `MP_ACCESS_TOKEN ausente; checkout stub paymentId=${input.paymentId}`,
      );
      return {
        preferenceId,
        checkoutUrl,
        expiresAt: input.expiresAt,
      };
    }

    const notificationUrl = this.config.get<string>('MP_NOTIFICATION_URL');
    const body = {
      external_reference: input.paymentId,
      notification_url: notificationUrl,
      expires: Boolean(input.expiresAt),
      expiration_date_to: input.expiresAt?.toISOString(),
      items: [
        {
          id: input.serviceOrderId,
          title: input.description,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: Number(input.amount.toFixed(2)),
        },
      ],
      payer: {
        name: input.payerName,
        email: input.payerEmail,
      },
      back_urls: {
        success: this.config.get<string>('MP_SUCCESS_URL'),
        failure: this.config.get<string>('MP_FAILURE_URL'),
        pending: this.config.get<string>('MP_PENDING_URL'),
      },
      metadata: {
        correlation_id: input.correlationId,
        service_order_id: input.serviceOrderId,
      },
    };

    const response = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': input.paymentId,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mercado Pago preference failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      id: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    return {
      preferenceId: data.id,
      checkoutUrl: data.sandbox_init_point || data.init_point || '',
      expiresAt: input.expiresAt,
    };
  }

  async getPayment(providerPaymentId: string): Promise<GatewayPaymentLookup> {
    if (!this.accessToken) {
      const stub = this.stubPayments.get(providerPaymentId);
      if (!stub) {
        return {
          providerPaymentId,
          status: 'unknown',
        };
      }
      return {
        providerPaymentId,
        status: stub.status,
        externalReference: stub.externalReference,
        amount: stub.amount,
      };
    }

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${providerPaymentId}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mercado Pago get payment failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      id: number | string;
      status: string;
      external_reference?: string;
      transaction_amount?: number;
    };

    return {
      providerPaymentId: String(data.id),
      status: this.mapStatus(data.status),
      externalReference: data.external_reference,
      amount: data.transaction_amount,
    };
  }

  async refund(providerPaymentId: string): Promise<void> {
    if (!this.accessToken) {
      const stub = this.stubPayments.get(providerPaymentId);
      if (stub) stub.status = 'cancelled';
      this.logger.warn(`refund stub providerPaymentId=${providerPaymentId}`);
      return;
    }

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${providerPaymentId}/refunds`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': randomUUID(),
        },
        body: '{}',
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mercado Pago refund failed: ${response.status} ${text}`);
    }
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
}
