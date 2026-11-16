import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Payment } from '../../../../../billing/domain/entities/payment';
import { PaymentStatus } from '../../../../../billing/domain/entities/payment-status';
import type { PaymentRepositoryInterface } from '../../../../../billing/domain/repositories/payment.repository';
import { PaymentEntity } from '../entities/payment.entity';

@Injectable()
export class TypeormPaymentRepository implements PaymentRepositoryInterface {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repo: Repository<PaymentEntity>,
  ) {}

  private toDomain(row: PaymentEntity): Payment {
    return Payment.restore(
      {
        budgetId: row.budgetId,
        serviceOrderId: row.serviceOrderId,
        correlationId: row.correlationId,
        provider: row.provider,
        preferenceId: row.preferenceId ?? undefined,
        providerPaymentId: row.providerPaymentId ?? undefined,
        status: row.status as PaymentStatus,
        amount: Number(row.amount),
        checkoutUrl: row.checkoutUrl ?? undefined,
        expiresAt: row.expiresAt ?? undefined,
        paidAt: row.paidAt ?? undefined,
        refundedAt: row.refundedAt ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  }

  private toRow(payment: Payment): PaymentEntity {
    return this.repo.create({
      id: payment.id,
      budgetId: payment.budgetId,
      serviceOrderId: payment.serviceOrderId,
      correlationId: payment.correlationId,
      provider: payment.provider,
      preferenceId: payment.preferenceId ?? null,
      providerPaymentId: payment.providerPaymentId ?? null,
      status: payment.status,
      amount: String(payment.amount),
      checkoutUrl: payment.checkoutUrl ?? null,
      expiresAt: payment.expiresAt ?? null,
      paidAt: payment.paidAt ?? null,
      refundedAt: payment.refundedAt ?? null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });
  }

  async create(payment: Payment): Promise<Payment> {
    const saved = await this.repo.save(this.toRow(payment));
    return this.toDomain(saved);
  }

  async save(payment: Payment): Promise<Payment> {
    const saved = await this.repo.save(this.toRow(payment));
    return this.toDomain(saved);
  }

  async findById(id: string): Promise<Payment | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findActiveByBudgetId(budgetId: string): Promise<Payment | null> {
    const row = await this.repo.findOne({
      where: {
        budgetId,
        status: In([PaymentStatus.PENDING, PaymentStatus.CONFIRMED]),
      },
      order: { createdAt: 'DESC' },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Payment[]> {
    const rows = await this.repo.find({
      where: { serviceOrderId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findExpiredPending(now: Date): Promise<Payment[]> {
    const rows = await this.repo.find({
      where: {
        status: PaymentStatus.PENDING,
        expiresAt: LessThanOrEqual(now),
      },
    });
    return rows.map((r) => this.toDomain(r));
  }
}
