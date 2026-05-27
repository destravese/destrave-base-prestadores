const gmailService = require("../services/gmail");
const extratorService = require("../services/extrator");
const extractorAI = require("../services/extractor");
const sheetsService = require("../services/sheets");

async function processarEmail(messageId) {
  console.log(`\n[Handler] === Processando e-mail: ${messageId} ===`);

  // 1. Carrega e-mail completo com corpo e anexos baixados
  let email;
  try {
    email = await gmailService.carregarEmail(messageId);
    console.log(`[Handler] E-mail de: ${email.remetente} | Assunto: ${email.assunto}`);
    console.log(`[Handler] Anexos encontrados: ${email.anexos.length}`);
  } catch (err) {
    console.log(`[Handler] Erro ao carregar e-mail: ${err.message}`);
    return { sucesso: false, motivo: "erro_leitura_email" };
  }

  // 2. Processa anexos: extrai texto de PDFs/DOCX/XLSX e prepara imagens
  let textosAnexos = [];
  let imagensAnexos = [];

  if (email.anexos.length > 0) {
    try {
      const resultado = await extratorService.processarAnexos(email.anexos);
      textosAnexos = resultado.textos;
      imagensAnexos = resultado.imagens;
      console.log(`[Handler] Textos extraídos de anexos: ${textosAnexos.length}`);
      console.log(`[Handler] Imagens para visão: ${imagensAnexos.length}`);
    } catch (err) {
      console.log(`[Handler] Erro ao processar anexos: ${err.message}`);
      // Continua sem os anexos
    }
  }

  // 3. Extrai dados do prestador via IA
  let dados;
  try {
    dados = await extractorAI.extrairDadosPrestador(email, textosAnexos, imagensAnexos);
    console.log(`[Handler] Dados extraídos pela IA`);
  } catch (err) {
    console.log(`[Handler] Erro na extração via IA: ${err.message}`);
    await gmailService.marcarComoLido(messageId); // marca como lido para não reprocessar
    return { sucesso: false, motivo: "erro_extracao_ai" };
  }

  if (!dados) {
    console.log(`[Handler] IA não retornou dados válidos`);
    await gmailService.marcarComoLido(messageId);
    return { sucesso: false, motivo: "dados_invalidos" };
  }

  // 4. Verifica se é e-mail de prestador
  if (dados.nao_e_prestador) {
    console.log(`[Handler] E-mail ignorado: não é de prestador de serviço`);
    await gmailService.marcarComoLido(messageId);
    return { sucesso: true, motivo: "nao_e_prestador", ignorado: true };
  }

  // 5. Valida que temos pelo menos algum dado identificador
  const temIdentificador = dados.email_prestador || dados.telefone || dados.whatsapp || dados.cnpj;
  if (!temIdentificador) {
    console.log(`[Handler] E-mail sem identificador — sem e-mail, telefone ou CNPJ`);
    await gmailService.marcarComoLido(messageId);
    return { sucesso: false, motivo: "sem_identificador" };
  }

  // 6. Salva na planilha (insere ou atualiza)
  try {
    const resultado = await sheetsService.salvarPrestador(dados, email.remetente);
    console.log(`[Handler] Planilha: ${resultado.acao}${resultado.linha ? ` (linha ${resultado.linha})` : ""}`);
  } catch (err) {
    console.log(`[Handler] Erro ao salvar na planilha: ${err.message}`);
    // Não marca como lido para tentar novamente na próxima execução
    return { sucesso: false, motivo: "erro_sheets" };
  }

  // 7. Marca como lido — só depois que tudo deu certo
  await gmailService.marcarComoLido(messageId);

  console.log(`[Handler] === E-mail processado com sucesso ===\n`);
  return { sucesso: true, empresa: dados.nome_empresa, email: dados.email_prestador };
}

module.exports = { processarEmail };
