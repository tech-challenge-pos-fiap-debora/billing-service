import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BudgetItemResponseDto {
  @ApiProperty({ enum: ['SERVICE', 'PART'] })
  type!: 'SERVICE' | 'PART';

  @ApiProperty()
  referenceId!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty()
  total!: number;
}

export class BudgetClientResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  document!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

export class BudgetResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  serviceOrderId!: string;

  @ApiProperty()
  correlationId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [BudgetItemResponseDto] })
  items!: BudgetItemResponseDto[];

  @ApiProperty()
  servicesTotal!: number;

  @ApiProperty()
  partsTotal!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: BudgetClientResponseDto })
  client!: BudgetClientResponseDto;

  @ApiPropertyOptional()
  approvedAt?: Date;

  @ApiPropertyOptional()
  rejectedAt?: Date;

  @ApiPropertyOptional()
  reason?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
