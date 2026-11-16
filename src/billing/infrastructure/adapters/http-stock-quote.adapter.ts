import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  StockQuoteDemandItem,
  StockQuoteItem,
  StockQuotePort,
} from '../../domain/ports/stock-quote.port';
import { IntegrationHttpClient } from './integration-http.client';

@Injectable()
export class HttpStockQuoteAdapter implements StockQuotePort {
  constructor(
    private readonly http: IntegrationHttpClient,
    private readonly config: ConfigService,
  ) {}

  async quoteFifoCost(
    demand: StockQuoteDemandItem[],
    correlationId: string,
  ): Promise<StockQuoteItem[]> {
    if (demand.length === 0) return [];
    const result = await this.http.request<StockQuoteItem[]>(
      'stock-service',
      'POST',
      '/stock/quote',
      {
        baseUrl: this.config.get<string>('STOCK_SERVICE_URL'),
        body: { items: demand },
        headers: { 'x-correlation-id': correlationId },
      },
    );
    return result ?? [];
  }
}
