require("dotenv").config();
const { google } = require("googleapis");

const OAuth2 = google.auth.OAuth2;

const SPREADSHEET_ID = process.env.SHEETS_PRESTADORES_ID;
const ABA_PRINCIPAL = "PRESTADORES";
const ABA_LOOKUP = "LOOKUP";

// Colunas na ordem exata da planilha
const COLUNAS = [
  "data_cadastro",       // A
  "nome_empresa",        // B
  "responsavel",         // C
  "telefone",            // D
  "whatsapp",            // E
  "email_prestador",     // F
  "cidade",              // G
  "regioes_atendidas",   // H
  "estado",              // I
  "tipos_servico",       // J
  "emite_nf",            // K
  "cnpj",                // L
  "valor_informado",     // M
  "previsao_chegada",    // N
  "horario_atendimento", // O
  "observacoes",         // P
  "ultima_atualizacao",  // Q
  "status_cadastro",     // R
  "email_origem",        // S — e-mail do remetente para rastreabilidade
];

function getOAuthClient() {
  const oauth2Client = new OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return oauth2Client;
}

async function getSheetsClient() {
  const auth = getOAuthClient();
  return google.sheets({ version: "v4", auth });
}

// Converte array para um valor ou array para o Sheets
function formatar(valor) {
  if (Array.isArray(valor)) return valor.join(", ");
  if (valor === null || valor === undefined) return "";
  return String(valor);
}

// Lê todas as linhas existentes e retorna um Map com chaves de dedup
// Chaves: email_prestador, telefone, whatsapp, cnpj — qualquer match = duplicata
async function carregarPrestadoresExistentes() {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_PRINCIPAL}!A:S`,
  });

  const linhas = res.data.values || [];
  if (linhas.length <= 1) return { linhas, indiceEmail: {}, indiceTelefone: {}, indiceCNPJ: {} };

  // Índices das colunas relevantes (linha 0 é o cabeçalho)
  const header = linhas[0];
  const iEmail = header.indexOf("email_prestador");
  const iTel = header.indexOf("telefone");
  const iWhats = header.indexOf("whatsapp");
  const iCNPJ = header.indexOf("cnpj");

  const indiceEmail = {};
  const indiceTelefone = {};
  const indiceCNPJ = {};

  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i];
    const email = (row[iEmail] || "").toLowerCase().trim();
    const tel = (row[iTel] || "").replace(/\D/g, "");
    const whats = (row[iWhats] || "").replace(/\D/g, "");
    const cnpj = (row[iCNPJ] || "").replace(/\D/g, "");

    if (email) indiceEmail[email] = i + 1; // +1 porque Sheets é 1-indexed + cabeçalho
    if (tel) indiceTelefone[tel] = i + 1;
    if (whats && whats !== tel) indiceTelefone[whats] = i + 1;
    if (cnpj) indiceCNPJ[cnpj] = i + 1;
  }

  return { linhas, indiceEmail, indiceTelefone, indiceCNPJ };
}

// Verifica se o prestador já existe, retorna o número da linha ou null
function encontrarDuplicata(dados, indiceEmail, indiceTelefone, indiceCNPJ) {
  const email = (dados.email_prestador || "").toLowerCase().trim();
  const tel = (dados.telefone || "").replace(/\D/g, "");
  const whats = (dados.whatsapp || "").replace(/\D/g, "");
  const cnpj = (dados.cnpj || "").replace(/\D/g, "");

  if (email && indiceEmail[email]) return indiceEmail[email];
  if (tel && indiceTelefone[tel]) return indiceTelefone[tel];
  if (whats && indiceTelefone[whats]) return indiceTelefone[whats];
  if (cnpj && indiceCNPJ[cnpj]) return indiceCNPJ[cnpj];

  return null;
}

// Converte objeto de dados extraídos para array na ordem das colunas
function dadosParaLinha(dados, dataCadastro, dataAtualizacao, emailOrigem, isNovo) {
  return COLUNAS.map((col) => {
    if (col === "data_cadastro") return isNovo ? dataCadastro : ""; // só preenche na criação
    if (col === "ultima_atualizacao") return dataAtualizacao;
    if (col === "status_cadastro") return isNovo ? "Novo" : "Atualizado";
    if (col === "email_origem") return emailOrigem;
    return formatar(dados[col]);
  });
}

// Insere novo prestador
async function inserirPrestador(dados, emailOrigem) {
  const sheets = await getSheetsClient();
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const linha = dadosParaLinha(dados, agora, agora, emailOrigem, true);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_PRINCIPAL}!A:S`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [linha] },
  });

  console.log(`[Sheets] Novo prestador inserido: ${dados.nome_empresa || dados.email_prestador}`);
}

// Atualiza prestador existente na linha indicada
async function atualizarPrestador(dados, numeroLinha, emailOrigem) {
  const sheets = await getSheetsClient();

  // Primeiro lê a linha atual para preservar data_cadastro e email_origem originais
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_PRINCIPAL}!A${numeroLinha}:S${numeroLinha}`,
  });

  const linhaAtual = (res.data.values || [[]])[0];
  const dataCadastroOriginal = linhaAtual[0] || ""; // preserva data original

  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const linha = dadosParaLinha(dados, dataCadastroOriginal, agora, emailOrigem, false);
  // Restaura data_cadastro original
  linha[0] = dataCadastroOriginal;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ABA_PRINCIPAL}!A${numeroLinha}:S${numeroLinha}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [linha] },
  });

  console.log(`[Sheets] Prestador atualizado na linha ${numeroLinha}: ${dados.nome_empresa || dados.email_prestador}`);
}

// Verifica se a aba existe, senão cria com cabeçalho
async function garantirAba() {
  const sheets = await getSheetsClient();

  const info = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const abas = info.data.sheets.map((s) => s.properties.title);

  if (!abas.includes(ABA_PRINCIPAL)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ABA_PRINCIPAL } } }],
      },
    });

    // Insere cabeçalho
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ABA_PRINCIPAL}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [COLUNAS] },
    });

    console.log(`[Sheets] Aba '${ABA_PRINCIPAL}' criada com cabeçalho`);
  }
}

// Função principal: insere ou atualiza conforme duplicidade
async function salvarPrestador(dados, emailOrigem) {
  await garantirAba();

  const { indiceEmail, indiceTelefone, indiceCNPJ } = await carregarPrestadoresExistentes();

  const linhaDuplicata = encontrarDuplicata(dados, indiceEmail, indiceTelefone, indiceCNPJ);

  if (linhaDuplicata) {
    await atualizarPrestador(dados, linhaDuplicata, emailOrigem);
    return { acao: "atualizado", linha: linhaDuplicata };
  } else {
    await inserirPrestador(dados, emailOrigem);
    return { acao: "inserido" };
  }
}

module.exports = { salvarPrestador, garantirAba };
