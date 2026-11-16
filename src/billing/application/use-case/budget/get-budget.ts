import { Inject, Injectable } from '@nestjs/common';
import { EntityNotFoundError } from '../../../../shared/domain/errors';
import type { Budget } from '../../../domain/entities/budget';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import { BUDGET_REPOSITORY } from '../../../domain/repositories/tokens';

@Injectable()
export class GetBudgetUseCase {
  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgets: BudgetRepositoryInterface,
  ) {}

  async byId(id: string): Promise<Budget> {
    const budget = await this.budgets.findById(id);
    if (!budget) throw new EntityNotFoundError('Budget not found');
    return budget;
  }

  async byServiceOrderId(serviceOrderId: string): Promise<Budget> {
    const budget = await this.budgets.findByServiceOrderId(serviceOrderId);
    if (!budget) throw new EntityNotFoundError('Budget not found');
    return budget;
  }
}
