# Atualizações implementadas no CoreFlow

## Tempo real

- Backend C# mantém SignalR em `/ordersHub`.
- Quando uma OS, usuário ou status é alterado, o sistema emite evento para todas as telas abertas.
- No modo Vercel/demo, foi adicionada sincronização entre abas com `BroadcastChannel`, `storage event` e polling leve.

## Cupom de garantia

- O botão agora aparece como **Imprimir cupom de garantia**.
- A opção fica disponível somente quando a OS está com status **Concluído** ou **Entregue**.
- O cupom abre em uma janela pronta para impressão e inclui:
  - dados do cliente;
  - contato;
  - aparelho;
  - datas de entrada e saída;
  - balconista responsável;
  - técnico responsável;
  - descrição do problema;
  - condição de entrada;
  - diagnóstico;
  - serviço realizado;
  - observações;
  - termo de garantia;
  - assinatura do cliente e da empresa.

## Campo de balconista

- O cadastro e edição da OS possuem campo para selecionar o balconista responsável pelo atendimento.

## Vite/Web

Arquivos adicionados/ajustados:

- `vite.config.js`
- `package.json`
- `vercel.json`
- `DEPLOY_VERCEL.md`

### Rodar web

```bash
npm install
npm run dev
```

Acesse:

```txt
http://localhost:5173
```

### Rodar backend C# junto

Terminal 1:

```bash
dotnet restore
dotnet run
```

Terminal 2:

```bash
npm install
npm run dev
```

## Logins

```txt
Admin: admin@coreflow.com / admin123
Balconista: balconista@coreflow.com / 123456
Técnico: tecnico@coreflow.com / 123456
```
