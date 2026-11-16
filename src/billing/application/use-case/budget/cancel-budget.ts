import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleViolationError } from '../../../../shared/domain/errors';
import type { Budget } from '../../../domain/entities/budget';
import type { BudgetRepositoryInterface } from '../../../domain/repositories/budget.repository';
import { BUDGET_REPOSITORY } from '../../../domain/repositories/tokens';

@Injectable()
export class CancelBudgetUseCase {
  constructor(
    @Inject(BUDGET_REPOSITORY)
    private readonly budgets: BudgetRepositoryInterface,
  ) {}

  async execute(
    serviceOrderId: string,
    reason?: string,
  ): Promise<Budget | null> {
    const budget = await this.budgets.findByServiceOrderId(serviceOrderId);
    if (!budget) {
      return null;
    }

    try {
      budget.cancel(reason);
    } catch (error) {
      throw new BusinessRuleViolationError(
        error instanceof Error ? error.message : 'Invalid operation',
      );
    }

    return this.budgets.save(budget);
  }
}
