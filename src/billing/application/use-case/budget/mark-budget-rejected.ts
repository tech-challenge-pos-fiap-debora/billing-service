import { Inject, Injectable } from '@nestjs/common';
import {
  BusinessRuleViolationError,
  EntityNotFoundError,
} from '../../../../shared/domain/errors';
import type { Budget } from '../../../domain/entities/budget';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import { BUDGET_REPOSITORY } from '../../../domain/repositories/tokens';

@Injectable()
export class MarkBudgetRejectedUseCase {
  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgets: BudgetRepositoryInterface,
  ) {}

  async execute(
    serviceOrderId: string,
    reason?: string,
    budgetId?: string,
  ): Promise<Budget> {
    const budget =
      (budgetId ? await this.budgets.findById(budgetId) : null) ??
      (await this.budgets.findByServiceOrderId(serviceOrderId));

    if (!budget) {
      throw new EntityNotFoundError('Budget not found');
    }
    if (budget.serviceOrderId !== serviceOrderId) {
      throw new BusinessRuleViolationError(
        'Budget does not belong to service order',
      );
    }

    try {
      budget.reject(reason);
    } catch (error) {
      throw new BusinessRuleViolationError(
        error instanceof Error ? error.message : 'Invalid operation',
      );
    }

    return this.budgets.save(budget);
  }
}
