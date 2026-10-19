# Finora — controle financeiro pessoal

Aplicativo web responsivo (PWA) para organizar a vida financeira. Funciona no computador, no celular e no tablet, e pode ser instalado na tela inicial.

## Funcionalidades

| Área | O que faz |
|---|---|
| **Painel** | Patrimônio líquido, receitas e despesas do mês, projeção de gastos, taxa de poupança, gráfico dos últimos 6 meses, gastos por categoria, vencimentos, cartões e metas |
| **Lançamentos** | Cadastro manual, compras parceladas, filtros, busca, importação e exportação de CSV |
| **Cartões** | Fatura aberta calculada pelo dia de fechamento, uso do limite, compras e parcelas da fatura |
| **Contas** | Conta corrente, poupança, investimentos, dinheiro e cartões |
| **Contratos e fixas** | Aluguel, financiamentos (com juros ao mês), seguros, escola e assinaturas, com dia de vencimento |
| **Renda** | Salários, pró-labore e freelas, como pessoa física ou jurídica, com valor bruto e líquido |
| **Categorias e regras** | Categorias próprias com orçamento mensal. Regras do tipo "se a descrição contém X, use a categoria Y", aplicadas também ao histórico |
| **Alertas** | Orçamento em 80% e 100%, gasto acima do normal, limite do cartão, vencimentos em até 3 dias, mês projetado no vermelho, saldo negativo e excesso de assinaturas |
| **Consultor** | Relatório mensal e perguntas livres. Usa a API do Claude com pesquisa na web para ver o mercado atual e cita as fontes |
| **Mercado** | Selic, CDI e IPCA (Banco Central), dólar e euro, Ibovespa, juro real e simulador de investimentos com IR |
| **Open Finance** | Integração com a Pluggy: conexão pelo widget, sincronização por webhook e a cada 6 horas, e categorização automática |
| **LGPD** | Consentimento no cadastro, exportação dos dados e exclusão da conta (também revoga as conexões na Pluggy) |

**Categorização automática:** as regras do usuário vêm primeiro, depois a categoria enviada pela Pluggy e, por último, as palavras-chave padrão.

**Dados separados por cliente:** todas as consultas são filtradas pelo usuário logado, e uma conexão bancária não pode ser vinculada a dois usuários.

## Rodar localmente

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# abra http://localhost:8000
```

Sem `DATABASE_URL` definida, o sistema usa SQLite (`finora.db`).

## Produção (VPS com Docker)

```bash
cp .env.example .env      # preencha DOMAIN, SECRET_KEY, POSTGRES_PASSWORD e as chaves
docker compose up -d --build
```

- **Requisito de DNS:** o domínio precisa apontar para o IP da VPS.
- **HTTPS:** o Caddy emite e renova o certificado sozinho.
- **Banco de dados:** fica no PostgreSQL, no volume `pgdata`. Faça backup com `docker compose exec db pg_dump -U finora finora > backup.sql`.

## Configurar a Pluggy

1. **Criar a aplicação:** crie a conta e a aplicação em https://dashboard.pluggy.ai e copie o `CLIENT_ID` e o `CLIENT_SECRET` para o `.env`.
2. **Uso comercial:** vender o app exige um **plano pago** da Pluggy. O Meu Pluggy gratuito só pode ser usado com as suas próprias contas.
3. **Webhooks:** o app registra o webhook sozinho em cada conexão (`PUBLIC_URL/api/pluggy/webhook`), desde que `PUBLIC_URL` use HTTPS. Com `PLUGGY_WEBHOOK_SECRET` definido, o webhook só é aceito com esse segredo.
4. **Versão do widget:** confira a versão atual do Pluggy Connect na documentação e ajuste `PLUGGY_CONNECT_SRC` no início de `frontend/app.js`, se preciso.
5. **Contas do Meu Pluggy:** para uso pessoal, vá em *Conexões bancárias → Tenho um Item ID* e cole o ID do item.

## Nora no WhatsApp

A pessoa conversa com a Nora pelo WhatsApp: pergunta saldo, resumo do mês, vencimentos e faturas, e lança gastos e receitas ("gastei 35 na padaria"). Mensagens mandadas em sequência viram uma resposta só (espera `WHATSAPP_BUFFER_SECONDS` de silêncio), e a resposta chega em partes, com "digitando…".

1. **Instância UAZAPI:** conecte o número do bot (`GET /instance/connect`, QR code) e copie o token da **instância** para `UAZAPI_INSTANCE_TOKEN`, a URL para `UAZAPI_BASE_URL` e o número (só dígitos) para `WHATSAPP_BOT_NUMBER`.
2. **Segredo do webhook:** gere `WHATSAPP_WEBHOOK_SECRET` e cadastre o webhook:
   ```bash
   curl -X PUT "$UAZAPI_BASE_URL/webhook" -H "token: $UAZAPI_INSTANCE_TOKEN" -H "Content-Type: application/json"      -d '{"webhookUrl": "https://SEU-DOMINIO/api/whatsapp/webhook/SEU_SEGREDO", "events": ["message"]}'
   ```
3. **Vínculo:** no app, *Configurações → WhatsApp → Conectar WhatsApp* gera um código; a pessoa manda `FINORA <código>` do próprio celular e o número que enviou fica ligado à conta. Número não vinculado só recebe a instrução, sem passar pela IA.

- **Requisito:** precisa de `ANTHROPIC_API_KEY`. O modelo é `WHATSAPP_MODEL` (padrão `claude-opus-5-5`, esforço `low`).
- **Dados usados:** a Nora no WhatsApp usa sempre os dados pessoais da conta, nunca os de uma empresa.
- **O que ela grava:** lançamentos com origem `whatsapp`. Só esses, e só nas últimas 24 h, podem ser desfeitos pela conversa.
- **Memória:** o histórico da conversa e o agrupamento das mensagens ficam na memória do processo. Por isso o app roda com **um worker só**, e reiniciar apaga o histórico. Na Vercel essa integração fica desligada.

## Consultor com IA

Defina `ANTHROPIC_API_KEY`. Sem a chave, o consultor gera um relatório por regras, sem pesquisa na web.

O conteúdo é educativo e não é recomendação de investimento. Se o app for vendido, revise com um advogado as regras da CVM sobre consultoria de valores mobiliários.

## Checklist antes de vender

- [ ] Termos de uso e política de privacidade (LGPD) escritos e publicados
- [ ] Plano comercial da Pluggy contratado
- [ ] Backups automáticos do PostgreSQL
- [ ] Limite de tentativas no login (ex.: Cloudflare ou fail2ban)
- [ ] Recuperação de senha por e-mail
- [ ] Cobrança/assinaturas (ex.: Stripe, Asaas, Mercado Pago), usando o campo `plan` do usuário
- [ ] Monitoramento (ex.: Zabbix/Grafana, já usados por você)

## Estrutura

```
backend/app/
  main.py              app, arquivos estáticos, sincronização periódica
  models.py            tabelas (todas com user_id)
  routers/api.py       endpoints REST (/api/...)
  services/
    analytics.py       painel, faturas, vencimentos, alertas
    categorizer.py     categorias padrão e regras
    pluggy.py          Open Finance
    market.py          indicadores e simulador
    advisor.py         consultor (Claude + web search)
frontend/              PWA (HTML/CSS/JS, bibliotecas locais em vendor/)
```
