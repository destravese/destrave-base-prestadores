# destrave-base-prestadores

Automação de cadastro de prestadores de serviço da Destrave.

Lê e-mails não lidos de `querofalarcom@destrave.se`, extrai dados dos prestadores via IA (suporta e-mail em texto, PDFs, imagens e planilhas em anexo) e salva tudo em uma planilha Google Sheets com deduplicação automática.

---

## Como funciona

1. Busca e-mails não lidos na caixa de entrada
2. Para cada e-mail, baixa o corpo e todos os anexos suportados (PDF, imagem, XLSX, DOCX)
3. Extrai texto de PDFs, DOCX e XLSX automaticamente
4. Envia corpo + textos extraídos + imagens para o GPT-4o
5. O modelo retorna um JSON estruturado com os dados do prestador
6. Verifica duplicidade na planilha por e-mail, telefone ou CNPJ
7. Insere novo registro ou atualiza o existente
8. Marca o e-mail como lido

---

## Setup local

```bash
npm install
cp .env.example .env
# Preencha as variáveis no .env
node src/index.js
```

---

## Variáveis de ambiente (Render)

| Variável | Descrição |
|---|---|
| `GMAIL_CLIENT_ID` | OAuth2 do Google Cloud (mesmo do destrave-automacao) |
| `GMAIL_CLIENT_SECRET` | OAuth2 do Google Cloud |
| `GMAIL_REFRESH_TOKEN` | Gerado no OAuth Playground |
| `OPENAI_API_KEY` | Chave da OpenAI |
| `SHEETS_PRESTADORES_ID` | ID da planilha Google Sheets |

---

## Deploy no Render (Cron Job)

1. Crie um novo serviço no Render do tipo **Cron Job**
2. Conecte este repositório
3. **Build Command:** `npm install`
4. **Start Command:** `node src/index.js`
5. **Schedule:** `0 * * * *` (executa a cada hora)
   - Ou `*/30 * * * *` para a cada 30 minutos
6. Adicione as variáveis de ambiente no painel do Render

---

## Permissões necessárias no Google Cloud

A conta OAuth precisa de acesso às seguintes APIs:
- **Gmail API** — escopos: `https://mail.google.com/`
- **Google Sheets API** — escopos: `https://www.googleapis.com/auth/spreadsheets`

Ative a **Google Sheets API** no mesmo projeto `raylets-bot` / `Emails Destrave` e regenere o refresh token no OAuth Playground com os dois escopos selecionados.

---

## Criar a planilha

1. Crie uma planilha nova em Google Sheets
2. Copie o ID da URL: `https://docs.google.com/spreadsheets/d/**ID_AQUI**/edit`
3. Coloque o ID na variável `SHEETS_PRESTADORES_ID`
4. A automação cria o cabeçalho automaticamente na primeira execução

---

## Estrutura do projeto

```
src/
├── index.js                  # Entry point do cron
├── handlers/
│   └── emailHandler.js       # Orquestra o fluxo completo
├── services/
│   ├── gmail.js              # Leitura de e-mails e anexos via Gmail API
│   ├── extrator.js           # Extração de texto de PDFs, DOCX, XLSX
│   ├── extractor.js          # Extração de dados via GPT-4o
│   └── sheets.js             # Leitura e escrita no Google Sheets
└── prompts/
    └── prestador.js          # Prompt e instruções para a IA
```
