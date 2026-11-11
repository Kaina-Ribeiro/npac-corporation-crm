/**
 * NPAC CRM: envia cada resposta do Google Forms para o CRM.
 *
 * Instalação: docs/integracao-forms/README.md.
 * O token fica em Configurações do projeto → Propriedades do script → CRM_TOKEN, nunca neste arquivo.
 */

// ===== Configuração: ajuste aqui se o título de alguma pergunta não for reconhecido =====
var CRM_URL = 'https://crm.5-189-167-204.sslip.io/api/webhooks/forms';

/** Trechos procurados no título da pergunta, sem acento e em minúsculas. */
var CAMPOS = {
  name: ['nome'],
  phone: ['whatsapp', 'telefone', 'celular'],
  instagram: ['instagram', ' insta'],
  email: ['e-mail', 'email'],
  income: ['renda', 'faturamento', 'quanto ganha', 'ganha por mes', 'salario'],
};
// ========================================================================================

/** Gatilho "Ao enviar formulário". */
function aoEnviarFormulario(e) {
  var token = PropertiesService.getScriptProperties().getProperty('CRM_TOKEN');
  if (!token) throw new Error('Defina CRM_TOKEN nas Propriedades do script.');

  var resposta = e.response;
  var dados = lerRespostas(resposta);
  var corpo = {
    responseId: resposta.getId(),
    submittedAt: resposta.getTimestamp().toISOString(),
    name: dados.name || 'Sem nome no formulário',
    incomeBand: faixaDeRenda(dados.income),
    answers: dados.answers,
  };
  if (dados.phone) corpo.phone = dados.phone;
  if (dados.instagram) corpo.instagram = dados.instagram;
  if (dados.email) corpo.email = dados.email;
  // Formulário que coleta o e-mail automaticamente: usa esse quando não há pergunta de e-mail.
  if (!corpo.email && resposta.getRespondentEmail()) corpo.email = resposta.getRespondentEmail();

  enviar(corpo, token);
}

function lerRespostas(resposta) {
  var dados = { answers: [] };
  resposta.getItemResponses().forEach(function (item) {
    var titulo = item.getItem().getTitle();
    var valor = item.getResponse();
    var texto = Array.isArray(valor) ? valor.join(', ') : String(valor == null ? '' : valor);
    dados.answers.push({ q: titulo.slice(0, 300), a: texto.slice(0, 5000) });
    var campo = campoDoTitulo(titulo);
    if (campo && !dados[campo] && texto) dados[campo] = texto;
  });
  dados.answers = dados.answers.slice(0, 100);
  return dados;
}

function semAcento(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function campoDoTitulo(titulo) {
  var t = ' ' + semAcento(titulo);
  // Contatos antes do nome: "Nome do Instagram" é a pergunta do Instagram.
  var ordem = ['email', 'instagram', 'phone', 'income', 'name'];
  for (var i = 0; i < ordem.length; i++) {
    var campo = ordem[i];
    if (
      CAMPOS[campo].some(function (trecho) {
        return t.indexOf(trecho) !== -1;
      })
    )
      return campo;
  }
  return null;
}

/**
 * Traduz o texto da renda para as faixas do CRM. Usa o menor valor citado: "De 5 a 8 mil" é 5 mil.
 * "Até 5 mil" e "Menos de 5 mil" ficam abaixo do mínimo e não criam lead.
 */
function faixaDeRenda(texto) {
  if (!texto) return 'UNKNOWN';
  var t = semAcento(texto);
  var valores = [];
  var padrao = /(\d+(?:[.,]\d+)*)\s*(mil|k)?/g;
  var m;
  while ((m = padrao.exec(t)) !== null) {
    var numero = parseFloat(m[1].replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!isNaN(numero)) valores.push({ numero: numero, mil: Boolean(m[2]) });
  }
  if (!valores.length) return 'UNKNOWN';
  // "De 5 a 8 mil": o "mil" do final vale para todos os números pequenos.
  var algumMil = valores.some(function (v) {
    return v.mil;
  });
  var reais = valores.map(function (v) {
    return v.mil || (algumMil && v.numero < 1000) ? v.numero * 1000 : v.numero;
  });
  var menor = Math.min.apply(null, reais);
  // Teto só com um valor: em "De 5 mil até 8 mil" o "até" fecha um intervalo.
  var teto = valores.length === 1 && /\b(ate|menos|abaixo|inferior)\b/.test(t);
  if (teto) return menor <= 5000 ? 'BELOW_5K' : 'UNKNOWN';
  if (menor < 5000) return 'BELOW_5K';
  if (menor < 8000) return 'R5_8K';
  if (menor < 15000) return 'R8_15K';
  if (menor < 50000) return 'R15_50K';
  return 'R50K_PLUS';
}

function enviar(corpo, token) {
  var resposta = UrlFetchApp.fetch(CRM_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-forms-token': token },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });
  var codigo = resposta.getResponseCode();
  // Falha aparece em Execuções e dispara o e-mail de erro do gatilho.
  if (codigo !== 200) throw new Error('CRM respondeu ' + codigo);
}

/** Rode uma vez pelo editor: confirma a configuração sem criar nada no CRM. */
function testarConexao() {
  var token = PropertiesService.getScriptProperties().getProperty('CRM_TOKEN');
  if (!token) throw new Error('Defina CRM_TOKEN nas Propriedades do script.');
  enviar(
    {
      responseId: 'teste-' + new Date().getTime(),
      submittedAt: new Date().toISOString(),
      name: 'Teste de conexão',
      incomeBand: 'BELOW_5K',
      answers: [],
    },
    token,
  );
  Logger.log('Conexão com o CRM funcionando.');
}
