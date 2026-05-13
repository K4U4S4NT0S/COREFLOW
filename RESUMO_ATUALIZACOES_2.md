# Atualizações implementadas no CoreFlow

## Cupom de garantia em tamanho real de bobina
- Cupom ajustado para largura de 80mm, padrão de impressora térmica.
- Loja configurada como ORIENTE.
- Cupom com nome do cliente, número, CPF/RG, datas de entrada/retirada, aparelho, descrição do serviço, valor, responsável e condições da garantia.
- Botão disponível nas OS com status Concluído ou Entregue.

## Status de conexão
- Texto "Tempo real demo" trocado por "Online".

## Valor do serviço
- Campo "Valor do serviço" adicionado no cadastro e edição da OS.
- Valor aparece na visualização da OS e no cupom de garantia.

## WhatsApp do cliente
- Botão "Chamar no WhatsApp" adicionado na visualização da OS.
- O botão usa o número cadastrado no campo de contato do cliente e abre o WhatsApp com mensagem pronta sobre a OS.

## Banco de dados
- Adicionadas as colunas CustomerDocument e ServiceValue na tabela ServiceOrders.
- As colunas são criadas automaticamente ao iniciar o sistema.
