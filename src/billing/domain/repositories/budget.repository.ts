import type { Budget } from '../entities/budget';

export interface BudgetRepositoryInterface {
  create(budget: Budget): Promise<Budget>;
  save(budget: Budget): Promise<Budget>;
  findById(id: string): Promise<Budget | null>;
  findByServiceOrderId(serviceOrderId: string): Promise<Budget | null>;
}
