import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Budget,
  type BudgetClient,
  type BudgetItem,
} from '../../../../../billing/domain/entities/budget';
import { BudgetStatus } from '../../../../../billing/domain/entities/budget-status';
import type { BudgetRepositoryInterface } from '../../../../../billing/domain/repositories/budget.repository';
import { BudgetEntity } from '../entities/budget.entity';

@Injectable()
export class TypeormBudgetRepository implements BudgetRepositoryInterface {
  constructor(
    @InjectRepository(BudgetEntity)
    private readonly repo: Repository<BudgetEntity>,
  ) {}

  private toDomain(row: BudgetEntity): Budget {
    return Budget.restore(
      {
        serviceOrderId: row.serviceOrderId,
        correlationId: row.correlationId,
        status: row.status as BudgetStatus,
        items: (row.items as BudgetItem[]) ?? [],
        servicesTotal: Number(row.servicesTotal),
        partsTotal: Number(row.partsTotal),
        total: Number(row.total),
        client: row.client as BudgetClient,
        approvedAt: row.approvedAt ?? undefined,
        rejectedAt: row.rejectedAt ?? undefined,
        reason: row.reason ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      row.id,
    );
  }

  private toRow(budget: Budget): BudgetEntity {
    return this.repo.create({
      id: budget.id,
      serviceOrderId: budget.serviceOrderId,
      correlationId: budget.correlationId,
      status: budget.status,
      items: budget.items,
      servicesTotal: String(budget.servicesTotal),
      partsTotal: String(budget.partsTotal),
      total: String(budget.total),
      client: budget.client,
      approvedAt: budget.approvedAt ?? null,
      rejectedAt: budget.rejectedAt ?? null,
      reason: budget.reason ?? null,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
    });
  }

  async create(budget: Budget): Promise<Budget> {
    const saved = await this.repo.save(this.toRow(budget));
    return this.toDomain(saved);
  }

  async save(budget: Budget): Promise<Budget> {
    const saved = await this.repo.save(this.toRow(budget));
    return this.toDomain(saved);
  }

  async findById(id: string): Promise<Budget | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async findByServiceOrderId(serviceOrderId: string): Promise<Budget | null> {
    const row = await this.repo.findOne({ where: { serviceOrderId } });
    return row ? this.toDomain(row) : null;
  }
}
