export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type CreateCheckoutInput = {
  paymentId: string;
  correlationId: string;
  serviceOrderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  expiresAt?: Date;
};

export type CreateCheckoutResult = {
  preferenceId: string;
  checkoutUrl: string;
  expiresAt?: Date;
};

export type GatewayPaymentStatus =
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'pending'
  | 'in_process'
  | 'unknown';

export type GatewayPaymentLookup = {
  providerPaymentId: string;
  status: GatewayPaymentStatus;
  externalReference?: string;
  amount?: number;
};

export type GatewayConnectionStatus = {
  configured: boolean;
  mode: 'live' | 'sandbox' | 'stub';
  ok: boolean;
  collectorId?: string;
  nickname?: string;
  email?: string;
  detail?: string;
};

export interface PaymentGatewayPort {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  getPayment(providerPaymentId: string): Promise<GatewayPaymentLookup>;
  findPaymentByExternalReference(
    externalReference: string,
  ): Promise<GatewayPaymentLookup | null>;
  refund(providerPaymentId: string): Promise<void>;
  verifyConnection(): Promise<GatewayConnectionStatus>;
}
