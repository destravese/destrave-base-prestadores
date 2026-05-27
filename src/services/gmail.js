require("dotenv").config();
const { google } = require("googleapis");

const OAuth2 = google.auth.OAuth2;

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

async function getGmailClient() {
  const auth = getOAuthClient();
  return google.gmail({ version: "v1", auth });
}

// Busca e-mails não lidos do remetente/assunto relevante
async function buscarEmailsPrestadores() {
  const gmail = await getGmailClient();

  // Busca e-mails não lidos com qualquer assunto na caixa de entrada
  // A IA vai filtrar depois se é prestador ou não
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox",
    maxResults: 50,
  });

  const messages = res.data.messages || [];
  console.log(`[Gmail] ${messages.length} e-mail(s) não lido(s) encontrado(s)`);
  return messages;
}

// Decodifica base64 URL-safe do Gmail
function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Extrai texto plano ou HTML do payload do e-mail
function extrairCorpo(payload) {
  function buscaPartes(parts) {
    for (const part of parts || []) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        return decodeBase64(part.body.data).toString("utf-8");
      }
      if (part.parts) {
        const resultado = buscaPartes(part.parts);
        if (resultado) return resultado;
      }
    }
    // Fallback para HTML se não tiver text/plain
    for (const part of parts || []) {
      if (part.mimeType === "text/html" && part.body && part.body.data) {
        const html = decodeBase64(part.body.data).toString("utf-8");
        // Remove tags HTML básico para deixar mais limpo para a IA
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    return null;
  }

  if (payload.mimeType === "text/plain" && payload.body && payload.body.data) {
    return decodeBase64(payload.body.data).toString("utf-8");
  }

  if (payload.mimeType === "text/html" && payload.body && payload.body.data) {
    const html = decodeBase64(payload.body.data).toString("utf-8");
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return buscaPartes(payload.parts) || "";
}

// Extrai anexos do payload (PDFs, imagens, XLSX, DOCX)
function extrairAnexos(payload, lista = []) {
  const tiposSuportados = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];

  for (const part of payload.parts || []) {
    if (tiposSuportados.includes(part.mimeType) && part.filename) {
      lista.push({
        filename: part.filename,
        mimeType: part.mimeType,
        attachmentId: part.body.attachmentId || null,
        data: part.body.data || null, // inline pequeno
      });
    }
    if (part.parts) {
      extrairAnexos(part, lista);
    }
  }

  return lista;
}

// Baixa o conteúdo binário de um anexo pelo attachmentId
async function baixarAnexo(messageId, attachmentId) {
  const gmail = await getGmailClient();
  const res = await gmail.users.messages.attachments.get({
    userId: "me",
    messageId: messageId,
    id: attachmentId,
  });
  return decodeBase64(res.data.data);
}

// Carrega um e-mail completo com corpo e anexos baixados
async function carregarEmail(messageId) {
  const gmail = await getGmailClient();

  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = msg.data.payload.headers || [];
  const get = (name) => (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || "";

  const corpo = extrairCorpo(msg.data.payload);
  const anexosInfo = extrairAnexos(msg.data.payload);

  // Baixa conteúdo binário de cada anexo
  const anexos = [];
  for (const anexo of anexosInfo) {
    try {
      let buffer;
      if (anexo.attachmentId) {
        buffer = await baixarAnexo(messageId, anexo.attachmentId);
      } else if (anexo.data) {
        buffer = decodeBase64(anexo.data);
      } else {
        continue;
      }
      anexos.push({
        filename: anexo.filename,
        mimeType: anexo.mimeType,
        buffer: buffer,
      });
      console.log(`[Gmail] Anexo baixado: ${anexo.filename} (${anexo.mimeType})`);
    } catch (err) {
      console.log(`[Gmail] Falha ao baixar anexo ${anexo.filename}: ${err.message}`);
    }
  }

  return {
    messageId: msg.data.id,
    remetente: get("From"),
    assunto: get("Subject"),
    data: get("Date"),
    corpo: corpo,
    anexos: anexos,
  };
}

// Marca e-mail como lido após processar
async function marcarComoLido(messageId) {
  const gmail = await getGmailClient();
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
    },
  });
}

module.exports = {
  buscarEmailsPrestadores,
  carregarEmail,
  marcarComoLido,
};
