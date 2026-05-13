# Deploy Web do CoreFlow com Vite + Vercel

O projeto agora tem frontend preparado com Vite. O backend C# continua rodando localmente/servidor próprio, e no Vercel o sistema abre em modo demo com `localStorage`.

## Rodar apenas a versão web

```bash
npm install
npm run dev
```

Acesse:

```txt
http://localhost:5173
```

## Rodar com backend C# em tempo real real

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

O Vite usa proxy para `/api` e `/ordersHub`, então o frontend em `5173` conversa com o backend em `5000`.

## Deploy no Vercel

Use:

```txt
Root Directory: TechServiceManager
Framework Preset: Vite
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

## Contas de teste

```txt
Admin: admin@coreflow.com / admin123
Balconista: balconista@coreflow.com / 123456
Técnico: tecnico@coreflow.com / 123456
```

## Novidades implementadas

- Atualização em tempo real via SignalR no backend C#.
- Modo web/demo com sincronização entre abas usando BroadcastChannel, storage event e polling leve.
- Campo de balconista responsável pela OS.
- Cupom de garantia imprimível quando a OS estiver Concluída ou Entregue.
