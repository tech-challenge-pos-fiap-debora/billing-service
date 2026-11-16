import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetBudgetUseCase } from '../../../application/use-case/budget';
import { UserRole } from '../../../domain/entities/user-role';
import { AuthRoles } from '../auth/decorators/auth-roles.decorator';
import { BudgetResponseDto } from './dtos/budget-response.dto';

@ApiTags('Billing / Orçamentos')
@Controller('budgets')
export class BudgetController {
  constructor(private readonly getBudget: GetBudgetUseCase) {}

  @Get(':id')
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: BudgetResponseDto })
  async byId(@Param('id') id: string): Promise<BudgetResponseDto> {
    return (await this.getBudget.byId(id)).toJSON() as BudgetResponseDto;
  }

  @Get()
  @AuthRoles(UserRole.ADMIN, UserRole.ATENDENTE)
  @ApiOkResponse({ type: BudgetResponseDto })
  async byServiceOrder(
    @Query('serviceOrderId') serviceOrderId: string,
  ): Promise<BudgetResponseDto> {
    return (
      await this.getBudget.byServiceOrderId(serviceOrderId)
    ).toJSON() as BudgetResponseDto;
  }
}
