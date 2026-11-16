# language: pt
Funcionalidade: Saga coreografada de orçamento e pagamento
  Como oficina mecânica distribuída
  Quero coordenar orçamento, reserva e pagamento via eventos
  Para manter consistência com compensação em caso de falha

  Contexto:
    Dado uma ordem de serviço "os-bdd-1" com serviço e peça
    E o gateway de pagamento em modo stub

  Cenário: Fluxo feliz até confirmação do pagamento
    Quando o billing recebe o evento "order.budget.requested"
    Então um orçamento é gerado com status "PENDING"
    E o evento "billing.budget.generated" é publicado
    Quando o billing recebe o evento "order.budget.approved"
    Então o orçamento fica com status "APPROVED"
    Quando o billing recebe o evento "stock.reserved"
    Então um pagamento pendente é criado
    E o evento "billing.payment.created" é publicado
    Quando o Mercado Pago confirma o pagamento
    Então o pagamento fica com status "CONFIRMED"
    E o evento "billing.payment.confirmed" é publicado

  Cenário: Compensação quando a reserva de estoque falha
    Quando o billing recebe o evento "order.budget.requested"
    E o billing recebe o evento "order.budget.approved"
    Quando o billing recebe o evento "stock.reservation.failed"
    Então o orçamento fica com status "CANCELLED"
    E nenhum pagamento ativo permanece para a ordem
