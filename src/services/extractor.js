const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

// Tipos que o Claude lê como imagem (base64)
const TIPOS_IMAGEM = ["image/jpeg", "image/jpg", "image/png"];

// Tipos que extraímos texto antes de mandar para a IA
const TIPOS_PDF = ["application/pdf"];
const TIPOS_DOCX = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const TIPOS_XLSX = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

// Extrai texto de PDF
async function extrairTextoPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim();
  } catch (err) {
    console.log(`[Extrator] Erro ao extrair PDF: ${err.message}`);
    return null;
  }
}

// Extrai texto de DOCX
async function extrairTextoDOCX(buffer) {
  try {
    const resultado = await mammoth.extractRawText({ buffer });
    return resultado.value.trim();
  } catch (err) {
    console.log(`[Extrator] Erro ao extrair DOCX: ${err.message}`);
    return null;
  }
}

// Converte XLSX/XLS para texto tabular simples
function extrairTextoXLSX(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let texto = "";
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        texto += `[Planilha: ${sheetName}]\n${csv}\n\n`;
      }
    }
    return texto.trim();
  } catch (err) {
    console.log(`[Extrator] Erro ao extrair XLSX: ${err.message}`);
    return null;
  }
}

// Processa todos os anexos de um e-mail
// Retorna: { textos: string[], imagens: [{base64, mimeType}] }
async function processarAnexos(anexos) {
  const textos = [];
  const imagens = [];

  for (const anexo of anexos) {
    const { filename, mimeType, buffer } = anexo;

    if (TIPOS_IMAGEM.includes(mimeType)) {
      // Envia como imagem para o Claude ver diretamente
      imagens.push({
        filename,
        base64: buffer.toString("base64"),
        mimeType,
      });
      console.log(`[Extrator] Imagem preparada para visão: ${filename}`);
      continue;
    }

    if (TIPOS_PDF.includes(mimeType)) {
      const texto = await extrairTextoPDF(buffer);
      if (texto) {
        textos.push(`--- Conteúdo do arquivo: ${filename} ---\n${texto}`);
        console.log(`[Extrator] PDF extraído: ${filename} (${texto.length} chars)`);
      }
      continue;
    }

    if (TIPOS_DOCX.includes(mimeType)) {
      const texto = await extrairTextoDOCX(buffer);
      if (texto) {
        textos.push(`--- Conteúdo do arquivo: ${filename} ---\n${texto}`);
        console.log(`[Extrator] DOCX extraído: ${filename}`);
      }
      continue;
    }

    if (TIPOS_XLSX.includes(mimeType)) {
      const texto = extrairTextoXLSX(buffer);
      if (texto) {
        textos.push(`--- Conteúdo da planilha: ${filename} ---\n${texto}`);
        console.log(`[Extrator] XLSX extraído: ${filename}`);
      }
      continue;
    }

    console.log(`[Extrator] Tipo não suportado ignorado: ${mimeType} (${filename})`);
  }

  return { textos, imagens };
}

module.exports = { processarAnexos };
