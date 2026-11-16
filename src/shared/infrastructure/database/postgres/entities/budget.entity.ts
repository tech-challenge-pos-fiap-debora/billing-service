import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('budgets')
export class BudgetEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'service_order_id', type: 'uuid', unique: true })
  serviceOrderId!: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  items!: unknown;

  @Column({
    name: 'services_total',
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  servicesTotal!: string;

  @Column({ name: 'parts_total', type: 'numeric', precision: 12, scale: 2 })
  partsTotal!: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  total!: string;

  @Column({ type: 'jsonb' })
  client!: unknown;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
