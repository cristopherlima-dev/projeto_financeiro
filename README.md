# Sistema Financeiro Pessoal

Sistema completo de gestao financeira pessoal com dashboard analitico, planejamento anual e bot do Telegram para alertas de vencimento.

## Funcionalidades

- **Dashboard** - Painel com metricas em tempo real: receitas recebidas/pendentes, despesas pagas/pendentes e saldo real
- **Graficos interativos** - Balanco mensal (pizza), analise por subtipo e categoria (doughnut) via Chart.js
- **Lancamentos** - CRUD completo de transacoes financeiras com upload de comprovantes e controle de status (efetivado/pendente)
- **Classificacao hierarquica** - Tipo (Entrada/Saida) > Subtipo > Categoria, configuravel via interface
- **Alertas de vencimento** - Contas fixas (todo dia X do mes) ou variaveis (data especifica), com ativacao/desativacao
- **Planejamento anual** - Visao consolidada por tipo/subtipo/categoria com breakdown mensal
- **Bot Telegram** - Consulta de contas vencendo hoje, neste mes e proximas contas

## Tecnologias

| Camada | Tecnologias |
|--------|-------------|
| Backend | Python, Flask, Flask-SQLAlchemy, SQLite |
| Frontend | HTML/Jinja2, JavaScript, Bootstrap 5, Chart.js |
| Bot | pyTelegramBotAPI |
| Utilitarios | python-dotenv, pandas, openpyxl |

## Pre-requisitos

- Python 3.10+
- Token de bot do Telegram (obter via [@BotFather](https://t.me/BotFather))

## Instalacao

1. Clone o repositorio:

```bash
git clone https://github.com/seu-usuario/projeto_financeiro.git
cd projeto_financeiro
```

2. Crie e ative um ambiente virtual:

```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
```

3. Instale as dependencias:

```bash
pip install -r requirements.txt
```

4. Crie o arquivo `.env` na raiz do projeto:

```env
SECRET_KEY=sua_chave_secreta_aqui
TELEGRAM_TOKEN=seu_token_do_telegram_aqui
```

5. Execute a aplicacao:

```bash
python app.py
```

A aplicacao estara disponivel em `http://localhost:5000`. O banco de dados SQLite (`financeiro.db`) sera criado automaticamente na primeira execucao.

## Estrutura do Projeto

```
projeto_financeiro/
├── app.py                   # Aplicacao Flask, modelos, rotas API e bot
├── requirements.txt         # Dependencias Python
├── .env                     # Variaveis de ambiente (nao versionado)
├── static/
│   ├── script.js            # Logica frontend (SPA)
│   └── style.css            # Estilos customizados
└── templates/
    ├── base.html            # Template base
    ├── index.html           # Dashboard principal
    └── components/
        ├── modal.html             # Modal de lancamentos
        ├── modal_config.html      # Gestao de classificacoes
        ├── modal_categorias.html  # Gestao de categorias
        └── modal_vencimento.html  # Alertas de vencimento
```

## Banco de Dados

SQLite com 5 tabelas:

```
Tipo (Entrada, Saida)
 └── Subtipo
      └── Categoria
           └── Lancamento (data, descricao, valor, status, comprovante)

Vencimento (descricao, tipo fixo/variavel, dia ou data, ativo)
```

- **Tipo** - Fixo: "Entrada" e "Saida"
- **Subtipo** - Subclassificacoes vinculadas a um tipo
- **Categoria** - Categorias vinculadas a um subtipo
- **Lancamento** - Transacoes com data, valor, status e comprovante opcional
- **Vencimento** - Alertas de contas a vencer (fixo mensal ou data especifica)

## API

| Metodo | Endpoint | Descricao |
|--------|----------|-----------|
| GET | `/` | Dashboard |
| GET | `/api/config/tipos` | Listar tipos |
| GET/POST/DELETE | `/api/config/subtipos` | CRUD de subtipos |
| GET/POST/DELETE | `/api/config/categorias` | CRUD de categorias |
| GET/POST | `/api/lancamentos` | Listar/criar lancamentos |
| DELETE | `/api/lancamentos/<id>` | Excluir lancamento |
| PATCH | `/api/lancamentos/<id>/status` | Alternar status efetivado |
| GET/POST | `/api/vencimentos` | Listar/criar vencimentos |
| PATCH | `/api/vencimentos/<id>/toggle` | Ativar/desativar vencimento |
| DELETE | `/api/vencimentos/<id>` | Excluir vencimento |
| GET | `/api/planejamento?ano=2025` | Dados do planejamento anual |
| GET | `/api/anos_disponiveis` | Anos com lancamentos registrados |

## Bot Telegram

O bot roda em uma thread separada junto com o servidor Flask. Comandos disponiveis:

| Comando | Descricao |
|---------|-----------|
| `/start` | Exibe o menu com os botoes abaixo |
| Vencendo Hoje | Contas fixas e variaveis com vencimento hoje |
| Vencem este Mes | Contas com vencimento do dia atual ate o fim do mes |
| Proximas Contas | Contas com vencimento a partir do proximo mes |

Para usar o bot, envie o token via `.env` e inicie a aplicacao com `python app.py`.

## Licenca

Este projeto e de uso pessoal.
