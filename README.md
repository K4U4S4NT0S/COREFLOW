<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> e1c79448a598f0e7bf0a392e2906b1b81f7271e0
# CoreFlow

Sistema web para controle real de ordens de serviço em assistência técnica.

## Perfis do sistema

- **Balconista**
  - Cadastra clientes e aparelhos
  - Registra condição de entrada
  - Define data de entrada e saída prevista
  - Acompanha status do serviço

- **Técnico**
  - Visualiza serviços cadastrados
  - Atualiza status
  - Informa diagnóstico técnico
  - Registra serviço realizado
  - Marca conclusão

- **Administrador**
  - Visualiza e edita tudo
  - Gerencia usuários
  - Gerencia status personalizados
  - Acompanha relatórios
  - Consulta histórico/auditoria

## Recursos principais

- Login por perfil
- Cadastro de ordem de serviço
- Status personalizável
- Registro de quem cadastrou o serviço
- Registro de quem realizou/alterou o serviço
- Histórico de alterações
- Relatórios por dia, semana e mês
- Painel separado para balconista, técnico e administrador
- Banco SQLite local

## Tecnologias

- C#
- ASP.NET Core 8
- SQLite
- HTML
- CSS
- JavaScript

## Como rodar

### 1. Instale o .NET SDK 8

Baixe pelo site oficial da Microsoft.

### 2. Abra a pasta do projeto no terminal

```bash
cd CoreFlowManager
```

### 3. Restaure as dependências

```bash
dotnet restore
```

### 4. Execute o sistema

```bash
dotnet run
```

### 5. Acesse no navegador

```text
http://localhost:5000
```

ou a URL mostrada no terminal.

## Usuários de teste

### Administrador
```text
Email: admin@techservice.com
Senha: admin123
```

### Balconista
```text
Email: balc@techservice.com
Senha: balc123
```

### Técnico
```text
Email: tecnico@techservice.com
Senha: tecnico123
```

## Observação

Este projeto é uma base funcional e organizada para uso real. Para colocar em produção, recomenda-se adicionar:

- HTTPS obrigatório
- Backup automático do banco
- Hospedagem em servidor/VPS
- Logs externos
- Controle avançado de permissões
- Notificações por WhatsApp ou e-mail
- Upload de fotos do aparelho


## Atualização desta versão

Esta versão recebeu:

- Interface moderna com estilo glassmorphism
- Fundo animado
- Cards de métricas mais profissionais
- Barra lateral com status de conexão
- Notificações visuais na tela
- Campo de busca nas ordens de serviço
- Atualização em tempo real com SignalR

## Tempo real

Quando uma ordem de serviço é criada ou alterada:

- O dashboard atualiza automaticamente
- A lista de ordens é recarregada
- Os usuários recebem uma notificação
- A conexão aparece como Online/Reconnecting/Offline

## Como rodar

```bash
cd CoreFlowManager
dotnet restore
dotnet run
```

Acesse:

```text
http://localhost:5000
```


## Atualizações implementadas

- Favicon aplicado com a identidade visual enviada.
- Nome atualizado para CoreFlow.
- Tela da OS separada em Visualizar e Editar.
- Campos de entrada/saída alterados para data e hora.
- Administrador agora edita função, dados, senha, status ativo/inativo e apaga usuários.
- Permissões separadas: balconista não edita campos técnicos; técnico não edita campos do balconista.
<<<<<<< HEAD
=======
# COREFLOW
Gestão moderna de ordens de serviço para assistência técnica.
>>>>>>> b38a3eab52085bb606a8d6951569ce4f18d8e6ff
=======
>>>>>>> e1c79448a598f0e7bf0a392e2906b1b81f7271e0
