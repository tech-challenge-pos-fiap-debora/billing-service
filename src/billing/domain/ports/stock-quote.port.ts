export const STOCK_QUOTE = Symbol('STOCK_QUOTE');

export type StockQuoteDemandItem = {
  productCode: string;
  required: number;
};

export type StockQuoteItem = {
  productCode: string;
  required: number;
  totalCost: number;
  unitPrice: number;
};

export interface StockQuotePort {
  quoteFifoCost(
    demand: StockQuoteDemandItem[],
    correlationId: string,
  ): Promise<StockQuoteItem[]>;
}
