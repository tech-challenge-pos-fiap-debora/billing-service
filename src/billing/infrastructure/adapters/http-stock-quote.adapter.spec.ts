import { ConfigService } from '@nestjs/config';
import { HttpStockQuoteAdapter } from './http-stock-quote.adapter';
import type { IntegrationHttpClient } from './integration-http.client';

describe('HttpStockQuoteAdapter', () => {
  it('retorna [] sem demanda', async () => {
    const http = { request: jest.fn() };
    const adapter = new HttpStockQuoteAdapter(
      http as unknown as IntegrationHttpClient,
      { get: () => 'http://stock' } as ConfigService,
    );
    expect(await adapter.quoteFifoCost([], 'c1')).toEqual([]);
    expect(http.request).not.toHaveBeenCalled();
  });

  it('chama stock-service /stock/quote', async () => {
    const http = {
      request: jest.fn().mockResolvedValue([
        { productCode: 'OLEO', required: 1, totalCost: 10, unitPrice: 10 },
      ]),
    };
    const adapter = new HttpStockQuoteAdapter(
      http as unknown as IntegrationHttpClient,
      { get: () => 'http://stock' } as ConfigService,
    );
    const items = await adapter.quoteFifoCost(
      [{ productCode: 'OLEO', quantity: 1 }],
      'corr-1',
    );
    expect(items).toHaveLength(1);
    expect(http.request).toHaveBeenCalledWith(
      'stock-service',
      'POST',
      '/stock/quote',
      expect.objectContaining({
        baseUrl: 'http://stock',
        headers: { 'x-correlation-id': 'corr-1' },
      }),
    );
  });
});
