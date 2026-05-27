require("dotenv").config();
const gmailService = require("./services/gmail");
const emailHandler = require("./handlers/emailHandler");

async function executar() {
  console.log(`\n========================================`);
  console.log(`[Cron] Iniciando varredura — ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  console.log(`========================================`);

  const mensagens = await gmailService.buscarEmailsPrestadores();

  if (mensagens.length === 0) {
    console.log("[Cron] Nenhum e-mail novo para processar.");
    return;
  }

  let processados = 0;
  let ignorados = 0;
  let erros = 0;

  for (const msg of mensagens) {
    try {
      const resultado = await emailHandler.processarEmail(msg.id);

      if (resultado.ignorado) {
        ignorados++;
      } else if (resultado.sucesso) {
        processados++;
      } else {
        console.log(`[Cron] E-mail ${msg.id} falhou: ${resultado.motivo}`);
        erros++;
      }
    } catch (err) {
      console.log(`[Cron] Erro inesperado ao processar ${msg.id}: ${err.message}`);
      erros++;
    }
  }

  console.log(`\n[Cron] Resumo:`);
  console.log(`  Cadastros salvos: ${processados}`);
  console.log(`  E-mails ignorados (não são prestadores): ${ignorados}`);
  console.log(`  Erros: ${erros}`);
  console.log(`========================================\n`);
}

executar().catch((err) => {
  console.error("[Cron] Falha crítica na execução:", err.message);
  process.exit(1);
});
