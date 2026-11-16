import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BUDGET_REPOSITORY,
  PAYMENT_REPOSITORY,
} from '../../domain/repositories/tokens';
import {
  BudgetEntity,
  PaymentEntity,
} from '../../../shared/infrastructure/database/postgres/entities';
import { TypeormBudgetRepository } from '../../../shared/infrastructure/database/postgres/repositories/typeorm-budget.repository';
import { TypeormPaymentRepository } from '../../../shared/infrastructure/database/postgres/repositories/typeorm-payment.repository';

@Module({
  imports: [TypeOrmModule.forFeature([BudgetEntity, PaymentEntity])],
  providers: [
    { provide: BUDGET_REPOSITORY, useClass: TypeormBudgetRepository },
    { provide: PAYMENT_REPOSITORY, useClass: TypeormPaymentRepository },
  ],
  exports: [BUDGET_REPOSITORY, PAYMENT_REPOSITORY, TypeOrmModule],
})
export class BillingDatabaseModule {}
