#!/usr/bin/env node
/**
 * Smoke da conexão Mercado Pago: GET /users/me com MP_ACCESS_TOKEN.
 * Sem token, só valida modo stub.
 */
const token = process.env.MP_ACCESS_TOKEN?.trim();
if (!token) {
  console.log('OK stub: MP_ACCESS_TOKEN ausente (gateway local em stub)');
  process.exit(0);
}

const res = await fetch('https://api.mercadopago.com/users/me', {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(10_000),
});
const body = await res.text();
if (!res.ok) {
  console.error(`Falha Mercado Pago ${res.status}: ${body}`);
  process.exit(1);
}
const data = JSON.parse(body);
console.log(
  `OK Mercado Pago collectorId=${data.id} nickname=${data.nickname ?? ''} sandbox=${process.env.MP_SANDBOX ?? 'true'}`,
);
