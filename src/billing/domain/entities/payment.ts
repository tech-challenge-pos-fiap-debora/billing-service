import { randomUUID } from 'crypto';
import { PaymentStatus } from './payment-status';

export type PaymentProps = {
  budgetId: string;
  serviceOrderId: string;
  correlationId: string;
  provider: string;
  preferenceId?: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  amount: number;
  checkoutUrl?: string;
  expiresAt?: Date;
  paidAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentInput = {
  budgetId: string;
  serviceOrderId: string;
  correlationId: string;
  amount: number;
  preferenceId?: string;
  checkoutUrl?: string;
  expiresAt?: Date;
  provider?: string;
};

export class Payment {
  public readonly id: string;
  private props: PaymentProps;

  private constructor(props: PaymentProps, id?: string) {
    this.id = id || randomUUID();
    this.props = props;
  }

  static create(input: CreatePaymentInput, id?: string): Payment {
    if (input.amount <= 0) {
      throw new Error('Payment amount must be > 0');
    }
    const now = new Date();
    return new Payment(
      {
        budgetId: input.budgetId,
        serviceOrderId: input.serviceOrderId,
        correlationId: input.correlationId,
        provider: input.provider ?? 'MERCADO_PAGO',
        preferenceId: input.preferenceId,
        status: PaymentStatus.PENDING,
        amount: input.amount,
        checkoutUrl: input.checkoutUrl,
        expiresAt: input.expiresAt,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static restore(props: PaymentProps, id: string): Payment {
    return new Payment(props, id);
  }

  get budgetId() {
    return this.props.budgetId;
  }
  get serviceOrderId() {
    return this.props.serviceOrderId;
  }
  get correlationId() {
    return this.props.correlationId;
  }
  get provider() {
    return this.props.provider;
  }
  get preferenceId() {
    return this.props.preferenceId;
  }
  get providerPaymentId() {
    return this.props.providerPaymentId;
  }
  get status() {
    return this.props.status;
  }
  get amount() {
    return this.props.amount;
  }
  get checkoutUrl() {
    return this.props.checkoutUrl;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }
  get paidAt() {
    return this.props.paidAt;
  }
  get refundedAt() {
    return this.props.refundedAt;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get updatedAt() {
    return this.props.updatedAt;
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }

  attachGatewayPreference(preferenceId: string, checkoutUrl: string): void {
    this.props.preferenceId = preferenceId;
    this.props.checkoutUrl = checkoutUrl;
    this.touch();
  }

  confirm(providerPaymentId: string, paidAt: Date = new Date()): void {
    if (this.props.status === PaymentStatus.CONFIRMED) {
      this.touch();
      return;
    }
    if (this.props.status !== PaymentStatus.PENDING) {
      throw new Error(`Cannot confirm payment in status ${this.props.status}`);
    }
    this.props.status = PaymentStatus.CONFIRMED;
    this.props.providerPaymentId = providerPaymentId;
    this.props.paidAt = paidAt;
    this.touch();
  }

  fail(providerPaymentId?: string): void {
    if (this.props.status === PaymentStatus.FAILED) {
      this.touch();
      return;
    }
    if (this.props.status !== PaymentStatus.PENDING) {
      throw new Error(`Cannot fail payment in status ${this.props.status}`);
    }
    this.props.status = PaymentStatus.FAILED;
    if (providerPaymentId) {
      this.props.providerPaymentId = providerPaymentId;
    }
    this.touch();
  }

  refund(): void {
    if (this.props.status === PaymentStatus.REFUNDED) {
      this.touch();
      return;
    }
    if (this.props.status !== PaymentStatus.CONFIRMED) {
      throw new Error(`Cannot refund payment in status ${this.props.status}`);
    }
    this.props.status = PaymentStatus.REFUNDED;
    this.props.refundedAt = new Date();
    this.touch();
  }

  isExpired(now: Date = new Date()): boolean {
    return (
      this.props.status === PaymentStatus.PENDING &&
      !!this.props.expiresAt &&
      this.props.expiresAt.getTime() <= now.getTime()
    );
  }

  toJSON() {
    return {
      id: this.id,
      budgetId: this.props.budgetId,
      serviceOrderId: this.props.serviceOrderId,
      correlationId: this.props.correlationId,
      provider: this.props.provider,
      preferenceId: this.props.preferenceId,
      providerPaymentId: this.props.providerPaymentId,
      status: this.props.status,
      amount: this.props.amount,
      checkoutUrl: this.props.checkoutUrl,
      expiresAt: this.props.expiresAt,
      paidAt: this.props.paidAt,
      refundedAt: this.props.refundedAt,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
