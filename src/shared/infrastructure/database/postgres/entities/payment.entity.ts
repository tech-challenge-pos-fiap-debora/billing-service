import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payments')
export class PaymentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'budget_id', type: 'uuid' })
  budgetId!: string;

  @Column({ name: 'service_order_id', type: 'uuid' })
  serviceOrderId!: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ type: 'varchar', length: 32, default: 'MERCADO_PAGO' })
  provider!: string;

  @Column({ name: 'preference_id', type: 'varchar', length: 128, nullable: true })
  preferenceId?: string | null;

  @Column({
    name: 'provider_payment_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  providerPaymentId?: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl?: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
