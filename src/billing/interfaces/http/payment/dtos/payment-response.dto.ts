import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaymentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  budgetId!: string;

  @ApiProperty()
  serviceOrderId!: string;

  @ApiProperty()
  correlationId!: string;

  @ApiProperty()
  provider!: string;

  @ApiPropertyOptional()
  preferenceId?: string;

  @ApiPropertyOptional()
  providerPaymentId?: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  amount!: number;

  @ApiPropertyOptional()
  checkoutUrl?: string;

  @ApiPropertyOptional()
  expiresAt?: Date;

  @ApiPropertyOptional()
  paidAt?: Date;

  @ApiPropertyOptional()
  refundedAt?: Date;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
