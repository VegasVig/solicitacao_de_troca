/**
 * VEGAS VIGILÂNCIA E SEGURANÇA
 * Backend — Solicitação de Troca de Horário / Turno / Posto
 * Banco de dados: Google Sheets | Assinaturas e documentos: Google Drive
 *
 * FLUXO (v2):
 *   1. Solicitante envia o pedido assinando só a assinatura dele  -> status "Aguardando colega"
 *   2. Sistema devolve um token; o formulário monta o link assinar.html?t=TOKEN
 *   3. Colega abre o link, confirma o CPF, assina (ou recusa)
 *   4. Assinou: gera o PDF com as duas assinaturas -> status "Pendente" (aparece no painel)
 *   5. Supervisor aprova/recusa -> PDF é regerado com a assinatura do supervisor
 */

// ───────────────────────── CONFIG ─────────────────────────
const PLANILHA_ID = '';                 // vazio = usa a planilha vinculada ao projeto
const ABA          = 'Trocas';
const ABA_LISTAS   = 'Listas';
const PASTA_ASSIN  = 'Vegas - Trocas - Assinaturas';
const PASTA_DOCS   = 'Vegas - Trocas - Documentos';
const TZ           = 'America/Sao_Paulo';
const SENHA_PADRAO = 'Vegas4747@';      // gravada em Script Properties no setup()
const WHATS_SUPERVISAO = '5524999999999'; // DDI+DDD+numero, sem sinais

const HEADERS = [
  'Protocolo','Registro','Nome','CPF','Funcao','Telefone',
  'Cidade Atual','Posto Atual','Turno Atual','Escala',
  'Tipo Troca','Modalidade','Data Origem','Data Destino',
  'Periodo Inicio','Periodo Fim','Turno Destino','Cidade Destino','Posto Destino',
  'Colega Nome','Colega CPF','Colega Telefone','Colega Cidade','Colega Posto',
  'Motivo','Assin Solicitante','Assin Colega',
  'Status','Supervisor','Assin Supervisor','Observacao Supervisor','Data Decisao',
  // ─── novos campos do fluxo de duas etapas ───
  'Token Colega','Data Assin Colega','Documento','Motivo Recusa Colega'
];

// chaves em JS na mesma ordem dos HEADERS
const CHAVES = ['protocolo','registro','nome','cpf','funcao','telefone',
  'cidadeAtual','postoAtual','turnoAtual','escala','tipoTroca','modalidade','dataOrigem','dataDestino',
  'periodoInicio','periodoFim','turnoDestino','cidadeDestino','postoDestino',
  'colegaNome','colegaCpf','colegaTelefone','colegaCidade','colegaPosto','motivo','assinSolicitante','assinColega',
  'status','supervisor','assinSupervisor','observacao','dataDecisao',
  'token','dataAssinColega','documento','motivoRecusaColega'];

const C_STATUS    = 28; // coluna 1-based do Status
const C_TOKEN     = 33;
const C_ASSIN_COL = 27;
const C_DATA_COL  = 34;
const C_DOC       = 35;
const C_RECUSA    = 36;

const ST_AGUARDA  = 'Aguardando colega';
const ST_PENDENTE = 'Pendente';
const ST_REC_COL  = 'Recusada pelo colega';

const ABA_POSTOS = 'Postos';
const ABA_CARGOS = 'Cargos';

const LISTAS_PADRAO = {
  Turnos: ['12x36 Diurno','12x36 Noturno','5x2 Diurno','5x2 Noturno','8h às 18h'],
  Supervisores: ['Supervisor Operacional','Supervisor de Área','Coordenador Operacional']
};

const CARGOS_PADRAO = {
  'Operacional': ['VIGILANTE','VIGILANTE MOTORISTA','VIGIA','PORTEIRO','CONTROLADOR DE ACESSO','FISCAL','FISCAL DE LOJA','AUXILIAR DE SERVIÇOS GERAIS','AUXILIAR DE SERVIÇOS GERAIS II','ZELADOR','JOVEM APRENDIZ'],
  'Monitoramento': ['OPERADOR DE CFTV','OPERADOR DE CFTV II','ENCARREGADO DE MONITORAMENTO','GERENTE DE MONITORAMENTO'],
  'Alarmes': ['FISCAL DE ALARMES','FISCAL DE ALARMES I','FISCAL DE ALARMES II','OPERADOR DE SISTEMA ELETRONICO DE SEGURANÇA I','OPERADOR DE SISTEMA ELETRONICO DE SEGURANÇA II'],
  'Técnico': ['AUXILIAR TECNICO','AUXILIAR DE INSTALADOR','AUXILIAR DE INSTALADOR I','INSTALADOR DE SISTEMA ELETRONICO I','INSTALADOR DE SISTEMA ELETRONICO II','INSTALADOR DE SISTEMA ELETRONICO III','INSTALADOR/MANTENEDOR DE SISTEMA ELETRONICO II','TECNICO','TECNICO I','TECNICO II','TECNICO III','TECNICO DE MANUTENÇAO ELETRONICO','TECNICO DE MANUTENÇÃO ELETRONICO','TECNICO DE SEGURANÇA','ANALISTA DE SISTEMA DE AUTOMAÇÃO','ENCARREGADO TÉCNICO','SUPERVISOR TECNICO','COORDENADOR TECNICO'],
  'Administrativo': ['ADMINISTRADOR','ASSISTENTE ADMINISTRATIVO','ASSISTENTE DE DEPARTAMENTO PESSOAL','ASSISTENTE FINANCEIRO','ASSISTENTE JURIDICO','ANALISTA JURIDICO','AUXILIAR ADMINISTRATIVO','AUXILIAR DE ESCRITÓRIO','VENDEDOR'],
  'Liderança e gestão': ['SUPERVISOR DE POSTO','SUPERVISOR DE AREA','COORDENADOR DE OPERAÇÕES','COORDENADOR DE RECURSOS OPERACIONAIS','COORDENADOR(A) COMERCIAL','COORDENADOR(A) DE ESTOQUE E SUPRIMENTO','COORDENADOR(A) DE ESTOQUE E SUPRIMENTOS','COORDENADOR(A) DE FROTA','COORDENADOR(A) DE POS VENDAS','COORDENADOR(A) DE TI','COORDENADOR(A) FINANCEIRO','COORDENADORA FINANCEIRA','ENCARREGADO DE RH','ENCARREGADO FINANCEIRO','LIDER DE RH','GERENTE COMERCIAL','GERENTE DE ATENDIMENTO','GERENTE DE ESTOQUE E SUPRIMENTOS','GERENTE DE FROTA','GERENTE DE PÓS VENDAS','GERENTE DE RECURSOS HUMANOS','GERENTE DE TI','GERENTE FINANCEIRO','GESTOR DE SEGURANÇA','SUPERINTENDENTE DE RECURSOS HUMANOS','DIRETOR'],
  'Outro': ['Outra']
};

const POSTOS_PADRAO = {
  'Barra do Piraí': ['MCI Reciclagem','Ceneged BP'],
  'Barra Mansa': ['Royal Centro BM','Royal Boa Vista','Julio BF','Ceneged BM','Transporte Excelsior','Estik Filmes','Estik Filmes ASG','Expresso Massa Falida','Rede Aliança'],
  'Miguel Pereira': ['Ceneged ASG Miguel Pereira'],
  'Niterói': ['Sede Niterói'],
  'Nova Iguaçu': ['Royal'],
  'Pinheiral': ['Norsil','Perfyaço'],
  'Piraí': ["Peter's House",'Mata do Amador'],
  'Porto Real': ['Vila Vitória'],
  'Queimados': ['Lanlimp'],
  'Resende': ['Tachi-S Brasil Porteiro','Tachi-S Brasil Vigilante','Nagumo','Brabus','Zen Cozinha Oriental','Udiaço','Scapini','Royal Campos Elisios','Royal Manejo'],
  'Sapucaia': ['Ceneged Sapucaia'],
  'Três Rios': ['Royal 3 Rios','Ceneged TR'],
  'Valença': ['Ceneged'],
  'Volta Redonda': ['Sede Volta Redonda','Fast Broker','Cicuta','Lauer Engenharia','Administrativo','Área Técnica','Monitoramento','Comercial','Nagumo','Royal Vila Sta Cecilia','Royal Retiro','Royal Sessenta','Royal Aterrado','Royal Amaral Peixoto','Royal São Lucas','Royale','Vincol','Gerdau','Projeto Vida','Edifício Cecisa I','Condomínio Maximum','Sind. Met. Sul Fluminense','A. Abreu Beneficiamento','Arena Emirados','Transporte Excelsior','Economy','Gran Milano']
};

// ───────────────────────── SETUP ─────────────────────────
function setup() {
  const ss = _ss();
  let sh = ss.getSheetByName(ABA);
  if (!sh) sh = ss.insertSheet(ABA);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#0A0A0A').setFontColor('#E8E8E8');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@'); // tudo texto: evita bug de data/hora
  } else {
    migrarColunas_(sh); // planilha que já existe: acrescenta as colunas novas
  }
  let li = ss.getSheetByName(ABA_LISTAS);
  if (!li) {
    li = ss.insertSheet(ABA_LISTAS);
    const chaves = Object.keys(LISTAS_PADRAO);
    li.getRange(1, 1, 1, chaves.length).setValues([chaves]).setFontWeight('bold');
    chaves.forEach(function (k, i) {
      const v = LISTAS_PADRAO[k].map(function (x) { return [x]; });
      li.getRange(2, i + 1, v.length, 1).setValues(v);
    });
  }
  let po = ss.getSheetByName(ABA_POSTOS);
  if (!po) {
    po = ss.insertSheet(ABA_POSTOS);
    po.getRange(1, 1, 1, 2).setValues([['Cidade', 'Posto']])
      .setFontWeight('bold').setBackground('#0A0A0A').setFontColor('#E8E8E8');
    po.setFrozenRows(1);
    const linhas = [];
    Object.keys(POSTOS_PADRAO).sort().forEach(function (c) {
      POSTOS_PADRAO[c].forEach(function (p) { linhas.push([c, p]); });
    });
    po.getRange(2, 1, linhas.length, 2).setValues(linhas);
    po.setColumnWidth(1, 170); po.setColumnWidth(2, 260);
  }
  let ca = ss.getSheetByName(ABA_CARGOS);
  if (!ca) {
    ca = ss.insertSheet(ABA_CARGOS);
    ca.getRange(1, 1, 1, 2).setValues([['Grupo', 'Cargo']])
      .setFontWeight('bold').setBackground('#0A0A0A').setFontColor('#E8E8E8');
    ca.setFrozenRows(1);
    const lc = [];
    Object.keys(CARGOS_PADRAO).forEach(function (g) {
      CARGOS_PADRAO[g].forEach(function (c) { lc.push([g, c]); });
    });
    ca.getRange(2, 1, lc.length, 2).setValues(lc);
    ca.setColumnWidth(1, 150); ca.setColumnWidth(2, 330);
  }
  PropertiesService.getScriptProperties().setProperty('SENHA_PAINEL', SENHA_PADRAO);
  ss.setSpreadsheetTimeZone(TZ);
  return 'setup ok';
}

/** Acrescenta as colunas do fluxo novo numa planilha que já tem dados. Seguro de rodar várias vezes. */
function migrarColunas_(sh) {
  const atuais = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), HEADERS.length)).getValues()[0];
  var mudou = false;
  for (var i = 0; i < HEADERS.length; i++) {
    if (String(atuais[i] || '') !== HEADERS[i]) {
      sh.getRange(1, i + 1).setValue(HEADERS[i])
        .setFontWeight('bold').setBackground('#0A0A0A').setFontColor('#E8E8E8');
      mudou = true;
    }
  }
  if (mudou) sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
  return mudou;
}

function _ss() {
  return PLANILHA_ID ? SpreadsheetApp.openById(PLANILHA_ID) : SpreadsheetApp.getActiveSpreadsheet();
}
function _out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function _senhaOk(s) {
  return String(s || '') === String(PropertiesService.getScriptProperties().getProperty('SENHA_PAINEL') || SENHA_PADRAO);
}
function _txt(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'dd/MM/yyyy HH:mm');
  return v === null || v === undefined ? '' : String(v);
}
function _agora() { return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm'); }

// ───────────────────────── ROTAS ─────────────────────────
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'listas': return _out({ ok: true, listas: lerListas_() });
      case 'consulta': return _out(consultar_(p.token));   // página do colega
      case 'listar':
        if (!_senhaOk(p.senha)) return _out({ ok: false, erro: 'Senha incorreta.' });
        return _out({ ok: true, dados: listar_() });
      default: return _out({ ok: true, servico: 'Trocas Vegas', versao: '2.0' });
    }
  } catch (err) { return _out({ ok: false, erro: String(err) }); }
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'criar')          return _out(criar_(d));
    if (d.action === 'assinarColega')  return _out(assinarColega_(d));
    if (d.action === 'recusarColega')  return _out(recusarColega_(d));
    if (d.action === 'decidir')        return _out(decidir_(d));
    if (d.action === 'gerarPdf')       return _out(gerarPdf_(d));
    if (d.action === 'excluir')        return _out(excluir_(d));
    return _out({ ok: false, erro: 'Ação desconhecida.' });
  } catch (err) { return _out({ ok: false, erro: String(err) }); }
}

// ───────────────────────── LISTAS ─────────────────────────
function lerListas_() {
  const li = _ss().getSheetByName(ABA_LISTAS);
  if (!li) return LISTAS_PADRAO;
  const v = li.getDataRange().getValues();
  const out = {};
  (v[0] || []).forEach(function (h, c) {
    if (!h) return;
    const col = [];
    for (var r = 1; r < v.length; r++) if (v[r][c] !== '') col.push(String(v[r][c]));
    out[String(h)] = col.length ? col : (LISTAS_PADRAO[h] || []);
  });
  out.Postos = lerPostos_();
  out.Cargos = lerCargos_();
  return out;
}

function lerCargos_() {
  const ca = _ss().getSheetByName(ABA_CARGOS);
  if (!ca || ca.getLastRow() < 2) return CARGOS_PADRAO;
  const v = ca.getRange(2, 1, ca.getLastRow() - 1, 2).getValues();
  const mapa = {};
  v.forEach(function (r) {
    const g = String(r[0]).trim() || 'Outros', c = String(r[1]).trim();
    if (!c) return;
    if (!mapa[g]) mapa[g] = [];
    if (mapa[g].indexOf(c) < 0) mapa[g].push(c);
  });
  return Object.keys(mapa).length ? mapa : CARGOS_PADRAO;
}

function lerPostos_() {
  const po = _ss().getSheetByName(ABA_POSTOS);
  if (!po || po.getLastRow() < 2) return POSTOS_PADRAO;
  const v = po.getRange(2, 1, po.getLastRow() - 1, 2).getValues();
  const mapa = {};
  v.forEach(function (r) {
    const c = String(r[0]).trim(), p = String(r[1]).trim();
    if (!c || !p) return;
    if (!mapa[c]) mapa[c] = [];
    if (mapa[c].indexOf(p) < 0) mapa[c].push(p);
  });
  return Object.keys(mapa).length ? mapa : POSTOS_PADRAO;
}

// ───────────────────────── CRIAR (etapa 1) ─────────────────────────
function criar_(d) {
  const obrig = ['nome', 'cpf', 'funcao', 'telefone', 'cidadeAtual', 'postoAtual', 'turnoAtual',
                 'tipoTroca', 'modalidade', 'motivo', 'colegaNome', 'colegaCpf', 'colegaTelefone',
                 'colegaCidade', 'colegaPosto'];
  for (var i = 0; i < obrig.length; i++) {
    if (!String(d[obrig[i]] || '').trim()) return { ok: false, erro: 'Campo obrigatório ausente: ' + obrig[i] };
  }
  if (!cpfValido_(d.cpf))       return { ok: false, erro: 'CPF do solicitante inválido.' };
  if (!cpfValido_(d.colegaCpf)) return { ok: false, erro: 'CPF do colega inválido.' };
  if (soNum_(d.cpf) === soNum_(d.colegaCpf)) return { ok: false, erro: 'O CPF do colega não pode ser igual ao do solicitante.' };
  if (soNum_(d.colegaTelefone).length < 10) return { ok: false, erro: 'Informe o WhatsApp do colega com DDD — é por ele que o link de assinatura vai.' };
  if (!d.assinSolicitante) return { ok: false, erro: 'Assinatura do solicitante é obrigatória.' };
  if (String(d.motivo).trim().length < 15) return { ok: false, erro: 'Descreva o motivo com mais detalhe (mínimo 15 caracteres).' };
  if (d.modalidade === 'Temporária' && !(d.periodoInicio && d.periodoFim))
    return { ok: false, erro: 'Troca temporária exige período (início e fim).' };
  if (d.tipoTroca === 'Posto por posto' && !(d.cidadeDestino && d.postoDestino))
    return { ok: false, erro: 'Troca de posto exige cidade e posto de destino.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _ss().getSheetByName(ABA);
    if (!sh) return { ok: false, erro: 'Aba Trocas não encontrada. Rode setup().' };
    migrarColunas_(sh);

    const dup = duplicada_(sh, d);
    if (dup) return { ok: false, erro: 'Já existe uma solicitação sua em andamento (protocolo ' + dup + '). Aguarde a conclusão dela.' };

    const protocolo = novoProtocolo_(sh);
    const agora = _agora();
    const aSol = salvarAssinatura_(pastaAssinaturas_(), d.assinSolicitante, protocolo + '-solicitante');
    const token = gerarToken_();

    sh.appendRow([
      protocolo, agora, d.nome, formataCpf_(d.cpf), d.funcao || '', d.telefone,
      d.cidadeAtual, d.postoAtual, d.turnoAtual, escalaDe_(d.turnoAtual),
      d.tipoTroca, d.modalidade, d.dataOrigem || '', d.dataDestino || '',
      d.periodoInicio || '', d.periodoFim || '', d.turnoDestino || '', d.cidadeDestino || '', d.postoDestino || '',
      d.colegaNome, formataCpf_(d.colegaCpf), d.colegaTelefone || '', d.colegaCidade, d.colegaPosto,
      d.motivo, aSol, '',
      ST_AGUARDA, '', '', '', '',
      token, '', '', ''
    ]);

    return {
      ok: true,
      protocolo: protocolo,
      registro: agora,
      token: token,
      colegaWhats: soNum_(d.colegaTelefone).length >= 10 ? '55' + soNum_(d.colegaTelefone) : ''
    };
  } finally { lock.releaseLock(); }
}

function duplicada_(sh, d) {
  const n = sh.getLastRow();
  if (n < 2) return null;
  const v = sh.getRange(2, 1, n - 1, HEADERS.length).getValues();
  const alvo = soNum_(d.cpf);
  const abertos = [ST_PENDENTE, ST_AGUARDA];
  for (var r = v.length - 1; r >= 0 && r > v.length - 60; r--) {
    if (abertos.indexOf(String(v[r][27])) >= 0 &&
        soNum_(v[r][3]) === alvo &&
        String(v[r][10]) === String(d.tipoTroca)) return String(v[r][0]);
  }
  return null;
}

function soNum_(v) { return String(v || '').replace(/\D/g, ''); }

function gerarToken_() {
  const b = Utilities.getUuid().replace(/-/g, '');
  const r = Utilities.base64EncodeWebSafe(Utilities.getUuid()).replace(/[^a-zA-Z0-9]/g, '');
  return (b + r).slice(0, 40);
}

/** Deriva a escala a partir do horário escolhido: '12x36 Noturno' -> '12x36'. */
function escalaDe_(turno) {
  const s = String(turno || '');
  const m = s.match(/^\s*(\d+\s*x\s*\d+)/);
  if (m) return m[1].replace(/\s/g, '');
  return 'Expediente';
}

function formataCpf_(v) {
  const c = soNum_(v);
  return c.length === 11 ? c.slice(0,3)+'.'+c.slice(3,6)+'.'+c.slice(6,9)+'-'+c.slice(9) : String(v || '');
}

/** 123.456.789-09 -> ***.456.789-** (mostrado na página do colega) */
function mascaraCpf_(v) {
  const c = soNum_(v);
  if (c.length !== 11) return '';
  return '***.' + c.slice(3,6) + '.' + c.slice(6,9) + '-**';
}

function cpfValido_(v) {
  const c = soNum_(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (var t = 9; t < 11; t++) {
    var s = 0;
    for (var i = 0; i < t; i++) s += parseInt(c.charAt(i), 10) * ((t + 1) - i);
    var dig = (s * 10) % 11; if (dig === 10) dig = 0;
    if (dig !== parseInt(c.charAt(t), 10)) return false;
  }
  return true;
}

function novoProtocolo_(sh) {
  const n = sh.getLastRow();
  var max = 0;
  if (n > 1) {
    sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) {
      const m = String(r[0]).match(/TRC-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return 'TRC-' + ('0000' + (max + 1)).slice(-4);
}

function pastaAssinaturas_() { return pastaPorNome_(PASTA_ASSIN); }
function pastaDocumentos_()  { return pastaPorNome_(PASTA_DOCS); }
function pastaPorNome_(nome) {
  const it = DriveApp.getFoldersByName(nome);
  return it.hasNext() ? it.next() : DriveApp.createFolder(nome);
}

function salvarAssinatura_(pasta, dataUrl, nome) {
  if (!dataUrl) return '';
  const partes = String(dataUrl).split(',');
  const b64 = partes.length > 1 ? partes[1] : partes[0];
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', nome + '.png');
  const f = pasta.createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/uc?id=' + f.getId();
}

function idDeUrl_(url) {
  const m = String(url || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}
function blobDeUrl_(url) {
  const id = idDeUrl_(url);
  if (!id) return null;
  try { return DriveApp.getFileById(id).getBlob(); } catch (e) { return null; }
}

// ───────────────────────── CONSULTA DO COLEGA ─────────────────────────
function consultar_(token) {
  if (!token) return { ok: false, erro: 'Link inválido.' };
  const sh = _ss().getSheetByName(ABA);
  const linha = linhaPorToken_(sh, token);
  if (linha < 0) return { ok: false, erro: 'Link inválido ou expirado. Peça ao colega para gerar um novo.' };

  const o = lerLinha_(sh, linha);
  return {
    ok: true,
    protocolo: o.protocolo, registro: o.registro, status: o.status,
    nome: o.nome, funcao: o.funcao, telefone: o.telefone,
    cidadeAtual: o.cidadeAtual, postoAtual: o.postoAtual, turnoAtual: o.turnoAtual, escala: o.escala,
    tipoTroca: o.tipoTroca, modalidade: o.modalidade,
    dataOrigem: o.dataOrigem, dataDestino: o.dataDestino,
    periodoInicio: o.periodoInicio, periodoFim: o.periodoFim,
    turnoDestino: o.turnoDestino, cidadeDestino: o.cidadeDestino, postoDestino: o.postoDestino,
    colegaNome: o.colegaNome, colegaCpfMascarado: mascaraCpf_(o.colegaCpf),
    colegaCidade: o.colegaCidade, colegaPosto: o.colegaPosto,
    motivo: o.motivo, assinSolicitante: o.assinSolicitante,
    dataAssinColega: o.dataAssinColega, documento: o.documento,
    motivoRecusaColega: o.motivoRecusaColega,
    whatsSupervisao: WHATS_SUPERVISAO
  };
}

function linhaPorToken_(sh, token) {
  if (!sh || sh.getLastRow() < 2) return -1;
  const n = sh.getLastRow();
  const v = sh.getRange(2, C_TOKEN, n - 1, 1).getValues();
  const alvo = String(token).trim();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]).trim() === alvo) return i + 2;
  return -1;
}
function linhaPorProtocolo_(sh, proto) {
  if (!sh || sh.getLastRow() < 2) return -1;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < v.length; i++) if (String(v[i][0]) === String(proto)) return i + 2;
  return -1;
}
function lerLinha_(sh, linha) {
  const r = sh.getRange(linha, 1, 1, HEADERS.length).getValues()[0];
  const o = {};
  CHAVES.forEach(function (k, i) { o[k] = _txt(r[i]); });
  return o;
}

// ───────────────────────── ASSINATURA DO COLEGA (etapa 2) ─────────────────────────
function assinarColega_(d) {
  if (!d.token) return { ok: false, erro: 'Link inválido.' };
  if (!d.assinColega) return { ok: false, erro: 'Assine no campo de assinatura antes de confirmar.' };
  if (!d.aceite) return { ok: false, erro: 'Marque a declaração de concordância.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _ss().getSheetByName(ABA);
    migrarColunas_(sh);
    const linha = linhaPorToken_(sh, d.token);
    if (linha < 0) return { ok: false, erro: 'Link inválido ou expirado.' };

    const o = lerLinha_(sh, linha);
    if (o.status !== ST_AGUARDA)
      return { ok: false, erro: 'Esta solicitação não está mais aguardando a sua assinatura (situação atual: ' + o.status + ').' };
    if (soNum_(d.cpfConfirma) !== soNum_(o.colegaCpf))
      return { ok: false, erro: 'O CPF informado não confere com o CPF cadastrado nesta solicitação.' };

    const urlCol = salvarAssinatura_(pastaAssinaturas_(), d.assinColega, o.protocolo + '-colega');
    const quando = _agora();
    sh.getRange(linha, C_ASSIN_COL).setValue(urlCol);
    sh.getRange(linha, C_STATUS).setValue(ST_PENDENTE);
    sh.getRange(linha, C_DATA_COL).setValue(quando);

    var doc = '';
    try { doc = gerarDocumento_(sh, linha); } catch (e) { doc = ''; }

    const msg = 'Troca ' + o.protocolo + ' assinada pelos dois envolvidos.%0A' +
                encodeURIComponent(o.nome) + ' e ' + encodeURIComponent(o.colegaNome) +
                '%0APosto: ' + encodeURIComponent(o.postoAtual + ' / ' + o.cidadeAtual) +
                '%0AAguardando aprovação da supervisão.';

    return {
      ok: true, protocolo: o.protocolo, status: ST_PENDENTE, documento: doc, dataAssinatura: quando,
      whatsapp: 'https://wa.me/' + WHATS_SUPERVISAO + '?text=' + msg
    };
  } finally { lock.releaseLock(); }
}

function recusarColega_(d) {
  if (!d.token) return { ok: false, erro: 'Link inválido.' };
  if (String(d.motivo || '').trim().length < 10)
    return { ok: false, erro: 'Escreva o motivo da recusa (mínimo 10 caracteres).' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _ss().getSheetByName(ABA);
    migrarColunas_(sh);
    const linha = linhaPorToken_(sh, d.token);
    if (linha < 0) return { ok: false, erro: 'Link inválido ou expirado.' };
    const o = lerLinha_(sh, linha);
    if (o.status !== ST_AGUARDA)
      return { ok: false, erro: 'Esta solicitação não está mais aguardando a sua resposta.' };
    if (soNum_(d.cpfConfirma) !== soNum_(o.colegaCpf))
      return { ok: false, erro: 'O CPF informado não confere com o CPF cadastrado nesta solicitação.' };

    sh.getRange(linha, C_STATUS).setValue(ST_REC_COL);
    sh.getRange(linha, C_RECUSA).setValue(String(d.motivo).trim());
    sh.getRange(linha, C_DATA_COL).setValue(_agora());
    return { ok: true, protocolo: o.protocolo, status: ST_REC_COL };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── DOCUMENTO PDF ─────────────────────────
/**
 * Monta um PDF único com os dados da troca e as assinaturas.
 * Chamado quando o colega assina e de novo quando o supervisor decide.
 * Devolve a URL do PDF (e grava na coluna Documento).
 */
function gerarDocumento_(sh, linha) {
  const o = lerLinha_(sh, linha);
  const pasta = pastaDocumentos_();

  const doc = DocumentApp.create('tmp-' + o.protocolo + '-' + Date.now());
  const body = doc.getBody();
  body.setMarginTop(36).setMarginBottom(36).setMarginLeft(42).setMarginRight(42);

  const titulo = body.appendParagraph('VEGAS VIGILÂNCIA E SEGURANÇA');
  titulo.setHeading(DocumentApp.ParagraphHeading.TITLE)
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('Termo de solicitação de troca de horário / turno / posto')
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setBold(true);
  body.appendParagraph('Protocolo ' + o.protocolo + '  ·  Registrado em ' + o.registro +
                       '  ·  Situação: ' + o.status)
      .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .setFontSize(9).setBold(false);

  const rota = rotaTexto_(o);
  const periodo = o.modalidade === 'Temporária' && o.periodoInicio
    ? dataBr_(o.periodoInicio) + ' a ' + dataBr_(o.periodoFim) : 'Definitiva';

  const linhas = [
    ['Solicitante', o.nome + (o.cpf ? '  —  CPF ' + o.cpf : '')],
    ['Cargo / escala', (o.funcao || '—') + '  /  ' + (o.escala || '—')],
    ['Contato', o.telefone || '—'],
    ['Posto e turno atual', o.postoAtual + ' (' + o.cidadeAtual + ')  —  ' + o.turnoAtual],
    ['Tipo de troca', o.tipoTroca],
    ['Modalidade', o.modalidade + (o.modalidade === 'Temporária' ? '  (' + periodo + ')' : '')],
    ['Troca solicitada', rota],
    ['Colega envolvido', o.colegaNome + (o.colegaCpf ? '  —  CPF ' + o.colegaCpf : '')],
    ['Posto do colega', o.colegaPosto + ' (' + o.colegaCidade + ')'],
    ['Motivo', o.motivo],
    ['Assinatura do colega em', o.dataAssinColega || '—']
  ];
  if (o.status === 'Aprovada' || o.status === 'Recusada') {
    linhas.push(['Decisão da supervisão', o.status + (o.supervisor ? ' por ' + o.supervisor : '') +
                                          (o.dataDecisao ? ' em ' + o.dataDecisao : '')]);
    if (o.observacao) linhas.push(['Observação da supervisão', o.observacao]);
  }

  body.appendParagraph('');
  const tab = body.appendTable(linhas);
  tab.setBorderColor('#999999');
  for (var i = 0; i < linhas.length; i++) {
    tab.getRow(i).getCell(0).setWidth(150)
      .editAsText().setBold(true).setFontSize(9);
    tab.getRow(i).getCell(1).editAsText().setBold(false).setFontSize(10);
  }

  body.appendParagraph('');
  body.appendParagraph('Declaramos que a troca acima foi combinada entre as partes e que ela só passa a valer após a aprovação da supervisão de postos.')
      .setFontSize(9).setItalic(true);
  body.appendParagraph('');

  // assinaturas lado a lado
  const temSup = !!o.assinSupervisor;
  const celulas = temSup ? [['', '', '']] : [['', '']];
  const tSig = body.appendTable(celulas);
  tSig.setBorderWidth(0);

  assinaturaNaCelula_(tSig.getRow(0).getCell(0), o.assinSolicitante, 'Solicitante', o.nome);
  assinaturaNaCelula_(tSig.getRow(0).getCell(1), o.assinColega, 'Colega envolvido', o.colegaNome);
  if (temSup) assinaturaNaCelula_(tSig.getRow(0).getCell(2), o.assinSupervisor, 'Supervisão de postos', o.supervisor || '');

  body.appendParagraph('')
      .appendText('Documento gerado eletronicamente em ' + _agora() + ' · Vegas Vigilância e Segurança')
      .setFontSize(8).setForegroundColor('#666666');

  doc.saveAndClose();

  const nomePdf = o.protocolo + ' - troca' +
    (o.status === 'Aprovada' ? ' (aprovada)' : o.status === 'Recusada' ? ' (recusada)' : '') + '.pdf';
  const pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(nomePdf);
  const arq = pasta.createFile(pdf);
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // limpa o Doc temporário e o PDF anterior
  try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (e) {}
  const antigo = idDeUrl_(o.documento);
  if (antigo) { try { DriveApp.getFileById(antigo).setTrashed(true); } catch (e) {} }

  const url = 'https://drive.google.com/file/d/' + arq.getId() + '/view';
  sh.getRange(linha, C_DOC).setValue(url);
  return url;
}

function assinaturaNaCelula_(cel, urlAssin, rotulo, nome) {
  const p = cel.getChild(0).asParagraph();
  p.clear().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  const blob = blobDeUrl_(urlAssin);
  if (blob) {
    try { p.appendInlineImage(blob).setWidth(170).setHeight(60); } catch (e) { p.appendText(' '); }
  } else {
    p.appendText('\n\n');
  }
  cel.appendParagraph('______________________________')
     .setAlignment(DocumentApp.HorizontalAlignment.CENTER).setFontSize(8);
  cel.appendParagraph(rotulo).setAlignment(DocumentApp.HorizontalAlignment.CENTER)
     .setFontSize(8).setBold(true);
  cel.appendParagraph(nome || '—').setAlignment(DocumentApp.HorizontalAlignment.CENTER)
     .setFontSize(8).setBold(false);
}

function rotaTexto_(o) {
  if (o.tipoTroca === 'Dia por dia')
    return 'De ' + dataBr_(o.dataDestino) + ' (data de início) para ' + dataBr_(o.dataOrigem) + ' (data de retorno)';
  var txt;
  if (o.tipoTroca === 'Turno por turno') txt = (o.turnoAtual || '—') + '  →  ' + (o.turnoDestino || '—');
  else txt = (o.postoAtual || '—') + ' (' + (o.cidadeAtual || '') + ')  →  ' +
             (o.postoDestino || '—') + ' (' + (o.cidadeDestino || '') + ')';
  if (o.modalidade === 'Temporária' && o.periodoInicio)
    txt += '\nDe ' + dataBr_(o.periodoInicio) + ' (data de início) para ' + dataBr_(o.periodoFim) + ' (data de retorno)';
  return txt;
}
function dataBr_(iso) {
  const s = String(iso || '');
  if (!s) return '—';
  if (s.indexOf('/') > 0) return s.split(' ')[0];   // tira o "00:00" que a planilha acrescenta
  const p = s.split(' ')[0].split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
}

// ───────────────────────── DECIDIR ─────────────────────────
function decidir_(d) {
  if (!_senhaOk(d.senha)) return { ok: false, erro: 'Senha incorreta.' };
  if (!d.protocolo) return { ok: false, erro: 'Protocolo não informado.' };
  if (['Aprovada', 'Recusada'].indexOf(d.status) < 0) return { ok: false, erro: 'Status inválido.' };
  if (!String(d.supervisor || '').trim()) return { ok: false, erro: 'Informe o nome do supervisor.' };
  if (!d.assinSupervisor) return { ok: false, erro: 'Assinatura do supervisor é obrigatória.' };
  if (d.status === 'Recusada' && String(d.observacao || '').trim().length < 10)
    return { ok: false, erro: 'Recusa exige justificativa (mínimo 10 caracteres).' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _ss().getSheetByName(ABA);
    migrarColunas_(sh);
    const linha = linhaPorProtocolo_(sh, d.protocolo);
    if (linha < 0) return { ok: false, erro: 'Protocolo não encontrado.' };

    const atual = String(sh.getRange(linha, C_STATUS).getValue());
    if (atual === ST_AGUARDA)
      return { ok: false, erro: 'O colega ainda não assinou esta solicitação. Só é possível decidir depois das duas assinaturas.' };
    if (atual !== ST_PENDENTE)
      return { ok: false, erro: 'Esta solicitação já foi decidida (' + atual + ').' };

    const url = salvarAssinatura_(pastaAssinaturas_(), d.assinSupervisor, d.protocolo + '-supervisor');
    sh.getRange(linha, C_STATUS, 1, 5).setValues([[
      d.status, d.supervisor, url, d.observacao || '', _agora()
    ]]);

    var doc = '';
    try { doc = gerarDocumento_(sh, linha); } catch (e) { doc = ''; }

    return { ok: true, protocolo: d.protocolo, status: d.status, documento: doc };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── GERAR PDF (painel) ─────────────────────────
function gerarPdf_(d) {
  if (!_senhaOk(d.senha)) return { ok: false, erro: 'Senha incorreta.' };
  if (!d.protocolo) return { ok: false, erro: 'Protocolo não informado.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _ss().getSheetByName(ABA);
    migrarColunas_(sh);
    const linha = linhaPorProtocolo_(sh, d.protocolo);
    if (linha < 0) return { ok: false, erro: 'Protocolo não encontrado.' };
    const url = gerarDocumento_(sh, linha);
    const id = idDeUrl_(url);
    return { ok: true, protocolo: d.protocolo, documento: url,
             download: id ? 'https://drive.google.com/uc?export=download&id=' + id : url };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── EXCLUIR FICHA (painel) ─────────────────────────
function excluir_(d) {
  if (!_senhaOk(d.senha)) return { ok: false, erro: 'Senha incorreta.' };
  if (!d.protocolo) return { ok: false, erro: 'Protocolo não informado.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = _ss().getSheetByName(ABA);
    const linha = linhaPorProtocolo_(sh, d.protocolo);
    if (linha < 0) return { ok: false, erro: 'Protocolo não encontrado (talvez já tenha sido excluído).' };
    const o = lerLinha_(sh, linha);
    // manda para a lixeira do Drive o PDF e as assinaturas (dá para recuperar por 30 dias)
    [o.documento, o.assinSolicitante, o.assinColega, o.assinSupervisor].forEach(function (u) {
      const id = idDeUrl_(u);
      if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
    });
    sh.deleteRow(linha);
    return { ok: true, protocolo: d.protocolo };
  } finally { lock.releaseLock(); }
}

// ───────────────────────── LISTAR ─────────────────────────
function listar_() {
  const sh = _ss().getSheetByName(ABA);
  if (!sh || sh.getLastRow() < 2) return [];
  const largura = Math.max(sh.getLastColumn(), HEADERS.length);
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, largura).getValues();
  return v.filter(function (r) { return r[0]; }).map(function (r) {
    const o = {};
    CHAVES.forEach(function (k, i) { o[k] = _txt(r[i]); });
    if (!o.status) o.status = ST_PENDENTE; // linhas antigas do fluxo v1
    return o;
  }).reverse();
}

/** Rode uma vez pelo editor para liberar as permissões de Docs e Drive. */
function autorizar() {
  const doc = DocumentApp.create('teste-autorizacao');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return 'Permissões liberadas';
}
