(function () {
  'use strict';

  var state = {
    tab: 'registrar',
    tipo: 'veiculo',
    acessos: [],
    pessoas: [],
    demo: true,
    sessao: null,
    editPessoaId: null,
    filtros: { q: '', data: '', status: 'todos' },
    semanaRef: new Date(),
    semanaFiltros: { q: '', empresa: '', obra: '' },
    manMesRef: new Date(),
    manNovo: { nome: '', funcao: '', empresa: '' },
    manPessoas: {}
  };

  var useCloud = false;
  var fs = null;
  var auth = null;
  var dataUnsubs = [];

  var mem = { acessos: [], pessoas: [] };
  var memL = { acessos: [], pessoas: [] };

  var BASE = (typeof BASE_PLANILHA !== 'undefined') ? BASE_PLANILHA : [];

  function $(s, r) {
    return (r || document).querySelector(s);
  }

  function $$(s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v.toDate === 'function') {
      var d = v.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof v === 'object' && typeof v.seconds === 'number') {
      return new Date(v.seconds * 1000);
    }
    var dd = new Date(v);
    return isNaN(dd.getTime()) ? null : dd;
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function fmtDataHora(v) {
    var d = toDate(v);
    if (!d) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtHora(v) {
    var d = toDate(v);
    if (!d) return '';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDur(ms) {
    if (!ms || ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'min';
    if (m > 0) return m + 'min';
    return s + 's';
  }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function soDigitos(v) {
    return String(v == null ? '' : v).replace(/\D/g, '');
  }

  function normTxt(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function maskCpf(v) {
    var d = soDigitos(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }

  function validaCpf(v) {
    var c = soDigitos(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    var s = 0;
    var i;
    for (i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
    var r = (s * 10) % 11;
    if (r === 10) r = 0;
    if (r !== parseInt(c[9], 10)) return false;
    s = 0;
    for (i = 0; i < 10; i++) s += parseInt(c[i], 10) * (11 - i);
    r = (s * 10) % 11;
    if (r === 10) r = 0;
    return r === parseInt(c[10], 10);
  }

  function maskDoc(tipo, v) {
    if (tipo === 'cpf') return maskCpf(v);
    if (tipo === 'cnh') return soDigitos(v).slice(0, 11);
    return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9 ./-]/g, '').slice(0, 20);
  }

  function normDoc(v) {
    return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function placeholderDoc(tipo) {
    if (tipo === 'cpf') return '000.000.000-00';
    if (tipo === 'cnh') return '00000000000';
    return 'Ex.: MG-12.345.678';
  }

  function validaDoc(tipo, v) {
    if (!v) return true;
    if (tipo === 'cpf') return validaCpf(v);
    if (tipo === 'cnh') return soDigitos(v).length === 11;
    return normDoc(v).length >= 4;
  }

  function maskTelefone(v) {
    var d = soDigitos(v).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function maskPlaca(v) {
    var s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
    if (s.length <= 3) return s;
    var first = s.slice(0, 3);
    var rest = s.slice(3);
    if (/^[0-9]+$/.test(rest)) return first + '-' + rest;
    return first + rest;
  }

  function soPlaca(v) {
    return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function iniciais(nome) {
    var partes = String(nome || '').trim().split(/\s+/);
    var a = partes[0] ? partes[0][0] : '';
    var b = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (a + b).toUpperCase() || '?';
  }

  var toastTimer = null;
  function toast(msg, tipo) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (tipo === 'erro' ? ' erro' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
    }, 3400);
  }

  function ordenarAcessos(list) {
    return list.slice().sort(function (a, b) {
      var ta = toDate(a.dataEntrada);
      var tb = toDate(b.dataEntrada);
      var va = ta ? ta.getTime() : Date.now() + 1;
      var vb = tb ? tb.getTime() : Date.now() + 1;
      return vb - va;
    });
  }

  function ordenarPessoas(list) {
    return list.slice().sort(function (a, b) {
      var c = String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR');
      if (c !== 0) return c;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  }

  function initFirebase() {
    if (typeof firebase === 'undefined' || typeof firebase.firestore !== 'function' || typeof firebase.auth !== 'function') return false;
    var cfg = typeof firebaseConfig !== 'undefined' ? firebaseConfig : null;
    if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf('COLE_') === 0) return false;
    if (!cfg.projectId || cfg.projectId.indexOf('SEU_') === 0) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fs = firebase.firestore();
      auth = firebase.auth();
      try {
        fs.enablePersistence({ synchronizeTabs: true }).catch(function () {});
      } catch (e) {}
      return true;
    } catch (e) {
      console.error(e);
      auth = null;
      fs = null;
      return false;
    }
  }

  function tsNow() {
    if (!useCloud) return new Date();
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function persistDemo() {
    try {
      localStorage.setItem('portaria_demo_v2', JSON.stringify(mem));
    } catch (e) {}
  }

  function seedDemo() {
    var now = Date.now();
    mem.pessoas = BASE.map(function (p, i) {
      return {
        id: 'p' + (i + 1),
        nome: p.nome,
        funcao: p.funcao || null,
        cpf: null,
        telefone: null,
        empresa: p.empresa || null,
        tipo: 'Funcionário'
      };
    });
    if (!mem.pessoas.length) {
      mem.pessoas = [
        { id: 'p1', nome: 'Pessoa de teste', funcao: 'Visitante', cpf: null, telefone: null, empresa: 'Empresa de teste', tipo: 'Visitante' },
        { id: 'p2', nome: 'Visitante de teste', funcao: 'Convidado', cpf: null, telefone: null, empresa: 'Empresa de teste', tipo: 'Visitante' }
      ];
    }
    var ex1 = mem.pessoas[12] || mem.pessoas[0];
    var ex2 = mem.pessoas[0] || null;
    var ex3 = mem.pessoas[30] || mem.pessoas[1] || null;
    mem.acessos = [];
    if (ex1) {
      mem.acessos.push({
        id: 'a1', tipo: 'pessoa', nome: ex1.nome, funcao: ex1.funcao || null,
        empresa: ex1.empresa || null, cpf: null, veiculo: null, placa: null,
        notaFiscal: null, atividade: 'Fornecedor', obra: 'Obra A', obs: null,
        status: 'dentro', dataEntrada: new Date(now - 45 * 60000), dataSaida: null
      });
    }
    if (ex2) {
      mem.acessos.push({
        id: 'a2', tipo: 'pessoa', nome: ex2.nome, funcao: ex2.funcao || null,
        empresa: ex2.empresa || null, cpf: null, veiculo: null, placa: null,
        notaFiscal: null, atividade: 'Fornecedor', obra: 'Obra A', obs: null,
        status: 'fora', dataEntrada: new Date(now - 3 * 3600000), dataSaida: new Date(now - 90 * 60000)
      });
    }
    if (ex3) {
      mem.acessos.push({
        id: 'a3', tipo: 'veiculo', nome: ex3.nome, funcao: null,
        empresa: ex3.empresa || null, cpf: null, veiculo: 'Caminhonete', placa: 'ABC-1234',
        notaFiscal: 'NF-10258', atividade: 'Fornecedor', obra: 'Obra B',
        obs: 'Entrega de material', status: 'fora',
        dataEntrada: new Date(now - 26 * 3600000), dataSaida: new Date(now - 25 * 3600000)
      });
    }
  }

  function loadDemo() {
    try {
      var raw = localStorage.getItem('portaria_demo_v2');
      if (raw) {
        var p = JSON.parse(raw);
        mem.acessos = p.acessos || [];
        mem.pessoas = p.pessoas || [];
        if (mem.pessoas.length) return;
      }
    } catch (e) {}
    seedDemo();
    persistDemo();
  }

  function notify(coll) {
    memL[coll].slice().forEach(function (cb) {
      cb(mem[coll].slice());
    });
    persistDemo();
  }

  function watch(coll, cb) {
    if (!useCloud) {
      memL[coll].push(cb);
      cb(mem[coll].slice());
      return function () {
        var i = memL[coll].indexOf(cb);
        if (i >= 0) memL[coll].splice(i, 1);
      };
    }
    return fs.collection(coll).limit(2000).onSnapshot(function (snap) {
      var out = [];
      snap.docs.forEach(function (d) {
        var o = d.data();
        o.id = d.id;
        out.push(o);
      });
      cb(out);
    }, function (err) {
      console.error(err);
      toast('Falha ao carregar dados do Firebase', 'erro');
    });
  }

  function docAdd(coll, data) {
    if (!useCloud) {
      var id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      var novo = {};
      Object.keys(data).forEach(function (k) { novo[k] = data[k]; });
      novo.id = id;
      mem[coll].push(novo);
      notify(coll);
      return Promise.resolve(id);
    }
    return fs.collection(coll).add(data).then(function (r) { return r.id; });
  }

  function docUpdate(coll, id, data) {
    if (!useCloud) {
      var item = mem[coll].find(function (x) { return x.id === id; });
      if (!item) return Promise.reject(new Error('registro não encontrado'));
      Object.keys(data).forEach(function (k) { item[k] = data[k]; });
      notify(coll);
      return Promise.resolve();
    }
    return fs.collection(coll).doc(id).update(data);
  }

  function docDelete(coll, id) {
    if (!useCloud) {
      mem[coll] = mem[coll].filter(function (x) { return x.id !== id; });
      notify(coll);
      return Promise.resolve();
    }
    return fs.collection(coll).doc(id).delete();
  }

  function renderStatus() {
    var el = $('#statusConexao');
    if (useCloud) {
      el.className = 'conn';
      el.innerHTML = '<span class="dot"></span> Firebase';
    } else {
      el.className = 'conn off';
      el.innerHTML = '<span class="dot"></span> Modo local';
    }
  }

  function ehAdmin() {
    return !!(state.sessao && state.sessao.usuario === 'admin');
  }

  function exigirAdmin(mensagem) {
    if (ehAdmin()) return true;
    toast(mensagem || 'Esta ação é exclusiva do Admin.', 'erro');
    return false;
  }

  function aplicarPermissoes() {
    var admin = ehAdmin();
    var rotulo = $('#sessaoRotulo');
    if (rotulo) {
      rotulo.textContent = admin ? 'Admin' : 'Portaria';
      rotulo.classList.toggle('admin', admin);
      rotulo.hidden = !state.sessao;
    }
    var pa = $('#pessoasAdmin');
    if (pa) pa.hidden = !admin;
    var pb = $('#pessoasBusca');
    if (pb) pb.hidden = !admin;
    var nav = $('#navPessoas');
    if (nav) nav.hidden = !admin;
    if (!admin && state.tab === 'pessoas') setTab('registrar');
  }

  function animarNumero(el, novo) {
    novo = Number(novo) || 0;
    var atual = Number(el.textContent) || 0;
    if (atual === novo) return;
    var t0 = performance.now();
    var dur = 500;
    function passo(t) {
      var p = Math.min(1, (t - t0) / dur);
      p = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(atual + (novo - atual) * p);
      if (p < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  function renderStats() {
    var hoje = startOfDay(new Date());
    var amanha = new Date(hoje.getTime() + 86400000);
    var dentro = 0;
    var entradas = 0;
    var saidas = 0;
    state.acessos.forEach(function (a) {
      if (a.status === 'dentro') dentro++;
      var e = toDate(a.dataEntrada);
      if (e && e >= hoje && e < amanha) entradas++;
      var s = toDate(a.dataSaida);
      if (s && s >= hoje && s < amanha) saidas++;
    });
    animarNumero($('#statDentro'), dentro);
    animarNumero($('#statEntradas'), entradas);
    animarNumero($('#statSaidas'), saidas);
  }

  function subLinha(a) {
    var partes = [];
    if (a.funcao) partes.push(a.funcao);
    if (a.empresa) partes.push(a.empresa);
    if (a.tipo === 'veiculo') {
      if (a.veiculo) partes.push(a.veiculo);
      if (a.placa) partes.push(a.placa);
      if (a.notaFiscal) partes.push('NF ' + a.notaFiscal);
    }
    if (a.atividade) partes.push(a.atividade);
    if (a.obra) partes.push(a.obra);
    return partes.filter(Boolean).map(esc).join(' · ');
  }

  function itemDentroHTML(a) {
    var e = toDate(a.dataEntrada);
    var tempo = e ? fmtDur(Date.now() - e.getTime()) : '…';
    var meta = 'Entrada: ' + fmtDataHora(a.dataEntrada) + ' · dentro há ' + tempo;
    if (a.obs) meta += ' · ' + esc(a.obs);
    var cancelar = ehAdmin()
      ? '<button type="button" class="btn danger sm" data-act="excluirAcesso" data-id="' + esc(a.id) +
        '" title="Apagar este registro de acesso">Excluir</button>'
      : '';
    return '<div class="item">' +
      '<div class="item-main">' +
        '<div class="item-title">' + esc(a.nome) + '<span class="badge ok">Dentro</span></div>' +
        '<div class="item-sub">' + subLinha(a) + '</div>' +
        '<div class="item-meta">' + meta + '</div>' +
      '</div>' +
      '<div class="item-actions">' +
        '<button type="button" class="btn success sm" data-act="saida" data-id="' + esc(a.id) + '">Registrar saída</button>' +
        cancelar +
      '</div>' +
    '</div>';
  }

  function itemHistHTML(a) {
    var badge = a.status === 'dentro'
      ? '<span class="badge ok">Dentro</span>'
      : '<span class="badge off">Concluído</span>';
    var meta = 'Entrada: ' + fmtDataHora(a.dataEntrada) + ' · Saída: ' + fmtDataHora(a.dataSaida);
    if (a.obs) meta += ' · ' + esc(a.obs);
    var acoes = '';
    if (a.status === 'dentro') {
      acoes += '<button type="button" class="btn success sm" data-act="saida" data-id="' + esc(a.id) + '">Registrar saída</button>';
    }
    if (ehAdmin()) {
      acoes += '<button type="button" class="btn danger sm" data-act="excluirAcesso" data-id="' + esc(a.id) + '">Excluir</button>';
    }
    return '<div class="item">' +
      '<div class="item-main">' +
        '<div class="item-title">' + esc(a.nome) + badge + '</div>' +
        '<div class="item-sub">' + subLinha(a) + '</div>' +
        '<div class="item-meta">' + meta + '</div>' +
      '</div>' +
      '<div class="item-actions">' + acoes + '</div>' +
    '</div>';
  }

  function itemPessoaHTML(p) {
    var detalhes = [p.funcao, p.cpf, p.telefone, p.empresa].filter(Boolean).map(esc).join(' · ');
    var acoes = '<button type="button" class="btn success sm" data-act="entrada" data-id="' + esc(p.id) + '">Entrada</button>';
    if (ehAdmin()) {
      acoes += '<button type="button" class="btn ghost sm" data-act="editar" data-id="' + esc(p.id) + '">Editar</button>';
      acoes += '<button type="button" class="btn danger sm" data-act="excluirPessoa" data-id="' + esc(p.id) + '">Excluir</button>';
    }
    return '<div class="item with-avatar">' +
      '<div class="avatar">' + esc(iniciais(p.nome)) + '</div>' +
      '<div class="item-main">' +
        '<div class="item-title">' + esc(p.nome) + '</div>' +
        '<div class="item-sub">' + detalhes + '</div>' +
      '</div>' +
      '<div class="item-actions">' + acoes + '</div>' +
    '</div>';
  }

  function renderDentro() {
    var itens = state.acessos.filter(function (a) { return a.status === 'dentro'; });
    itens.sort(function (a, b) {
      var ta = toDate(a.dataEntrada);
      var tb = toDate(b.dataEntrada);
      return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
    });
    $('#dentroContagem').textContent = itens.length +
      (itens.length === 1 ? ' registro ativo' : ' registros ativos');
    $('#listaDentro').innerHTML = itens.length
      ? itens.map(itemDentroHTML).join('')
      : '<div class="empty"><strong>Ninguém dentro agora</strong>As entradas registradas aparecem aqui.</div>';
  }

  function acessosFiltrados() {
    var q = state.filtros.q.trim().toLowerCase();
    var dia = state.filtros.data;
    var st = state.filtros.status;
    return state.acessos.filter(function (a) {
      if (st === 'dentro' && a.status !== 'dentro') return false;
      if (st === 'fora' && a.status === 'dentro') return false;
      if (dia) {
        var e = toDate(a.dataEntrada);
        if (!e || isoDate(e) !== dia) return false;
      }
      if (q) {
        var alvo = [a.nome, a.empresa, a.funcao, a.placa, a.cpf, a.veiculo, a.obs, a.notaFiscal, a.obra, a.atividade]
          .filter(Boolean).join(' ').toLowerCase();
        if (alvo.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderHistorico() {
    var itens = acessosFiltrados();
    $('#histContagem').textContent = itens.length + (itens.length === 1 ? ' registro' : ' registros');
    $('#listaHistorico').innerHTML = itens.length
      ? itens.map(itemHistHTML).join('')
      : '<div class="empty"><strong>Nenhum registro encontrado</strong>Ajuste a busca ou os filtros.</div>';
  }

  function renderCalendario() {
    var agr = isoDate(new Date());
    var val = ($('#calData').value || agr).trim();
    var ref = new Date(val + 'T00:00:00');
    if (isNaN(ref.getTime())) ref = new Date();
    if ($('#calData').value !== isoDate(ref)) $('#calData').value = isoDate(ref);

    var inicioSemana = segundaDaSemana(ref);
    var fimSemana = new Date(inicioSemana.getTime() + 6 * 86400000);
    var inicioMes = new Date(ref.getFullYear(), ref.getMonth(), 1);
    var fimMes = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);

    var semana = 0;
    var mes = 0;
    state.acessos.forEach(function (a) {
      var e = toDate(a.dataEntrada);
      if (!e) return;
      if (dentroDoIntervalo(e, inicioSemana, fimSemana)) semana++;
      if (dentroDoIntervalo(e, inicioMes, fimMes)) mes++;
    });
    animarNumero($('#calSemana'), semana);
    animarNumero($('#calMes'), mes);
  }

  function renderPessoas() {
    var q = ($('#pessoasBusca').value || '').trim().toLowerCase();
    var itens = state.pessoas.filter(function (p) {
      if (!q) return true;
      var alvo = [p.nome, p.funcao, p.cpf, p.empresa, p.telefone, p.tipo].filter(Boolean).join(' ').toLowerCase();
      return alvo.indexOf(q) >= 0;
    });
    $('#pessoasContagem').textContent = itens.length + (itens.length === 1 ? ' pessoa' : ' pessoas');
    $('#listaPessoasList').innerHTML = itens.length
      ? itens.map(itemPessoaHTML).join('')
      : '<div class="empty"><strong>Nenhuma pessoa cadastrada</strong>' +
        (ehAdmin() ? 'Cadastre trabalhadores ou importe a base da planilha.' : 'A lista de cadastros fica disponível para os administradores.') + '</div>';

    var btn = $('#btnImportar');
    btn.hidden = !ehAdmin() || !useCloud || !BASE.length;
    btn.textContent = 'Importar base da planilha (' + BASE.length + ')';
  }

  function renderDatalist() {}

  function segundaDaSemana(ref) {
    var d = startOfDay(ref);
    var dia = d.getDay();
    var diff = (dia === 0 ? -6 : 1 - dia);
    d.setDate(d.getDate() + diff);
    return d;
  }

  function diasDaSemana(ref) {
    var inicio = segundaDaSemana(ref);
    var dias = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(inicio.getTime());
      d.setDate(inicio.getDate() + i);
      dias.push(d);
    }
    return dias;
  }

  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function dentroDoIntervalo(d, inicio, fim) {
    return d >= inicio && d <= new Date(fim.getTime() + 86400000 - 1);
  }

  function linhasSemanal() {
    var dias = diasDaSemana(state.semanaRef);
    var inicio = dias[0];
    var fim = dias[6];
    var mapa = {};

    state.pessoas.forEach(function (p) {
      var k = normTxt(p.nome);
      if (!mapa[k]) {
        mapa[k] = {
          nome: p.nome, funcao: p.funcao || '', empresa: p.empresa || '',
          obra: '', ids: [], dias: dias.map(function () { return { e: '', s: '' }; })
        };
      }
    });

    state.acessos.forEach(function (a) {
      var te = toDate(a.dataEntrada);
      var ts = toDate(a.dataSaida);
      var k = normTxt(a.nome);
      if (!k) return;
      if (!mapa[k]) {
        mapa[k] = {
          nome: a.nome, funcao: a.funcao || '', empresa: a.empresa || '',
          obra: a.obra || '', ids: [], dias: dias.map(function () { return { e: '', s: '' }; })
        };
      }
      var row = mapa[k];
      if (a.obra && !row.obra) row.obra = a.obra;
      if (a.funcao && !row.funcao) row.funcao = a.funcao;
      if (te && dentroDoIntervalo(te, inicio, fim)) {
        row.ids.push(a.id);
        for (var i = 0; i < 7; i++) {
          if (mesmoDia(te, dias[i])) {
            var hora = pad(te.getHours()) + ':' + pad(te.getMinutes());
            if (!row.dias[i].e || hora < row.dias[i].e) row.dias[i].e = hora;
            break;
          }
        }
      }
      if (ts && dentroDoIntervalo(ts, inicio, fim)) {
        row.ids.push(a.id);
        for (var j = 0; j < 7; j++) {
          if (mesmoDia(ts, dias[j])) {
            var horaS = pad(ts.getHours()) + ':' + pad(ts.getMinutes());
            if (!row.dias[j].s || horaS > row.dias[j].s) row.dias[j].s = horaS;
            break;
          }
        }
      }
    });

    var fq = normTxt(state.semanaFiltros.q);
    var femp = normTxt(state.semanaFiltros.empresa);
    var fobra = normTxt(state.semanaFiltros.obra);

    return Object.keys(mapa).map(function (k) { return mapa[k]; }).filter(function (r) {
      if (fq && normTxt(r.nome + ' ' + r.funcao).indexOf(fq) < 0) return false;
      if (femp && normTxt(r.empresa) !== femp) return false;
      if (fobra && normTxt(r.obra) !== fobra) return false;
      var temMov = r.dias.some(function (d) { return d.e || d.s; });
      var filtrado = fq || femp || fobra;
      return filtrado ? true : temMov;
    }).sort(function (a, b) {
      var c = a.empresa.localeCompare(b.empresa, 'pt-BR');
      if (c !== 0) return c;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }

  function renderOpcoesEmpresa() {
    var sel = $('#semEmpresa');
    var atual = sel.value;
    var mapa = {};
    state.pessoas.forEach(function (p) { if (p.empresa) mapa[p.empresa] = true; });
    state.acessos.forEach(function (a) { if (a.empresa) mapa[a.empresa] = true; });
    var empresas = Object.keys(mapa).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    sel.innerHTML = '<option value="">Todas</option>' +
      empresas.map(function (e) {
        return '<option' + (e === atual ? ' selected' : '') + '>' + esc(e) + '</option>';
      }).join('');
  }

  var DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  function renderSemanal() {
    var dias = diasDaSemana(state.semanaRef);
    var ini = dias[0];
    var fim = dias[6];
    $('#semanaLabel').textContent =
      pad(ini.getDate()) + '/' + pad(ini.getMonth() + 1) + ' a ' +
      pad(fim.getDate()) + '/' + pad(fim.getMonth() + 1) + '/' + fim.getFullYear();

    renderOpcoesEmpresa();
    var linhas = linhasSemanal();
    var comMov = linhas.filter(function (r) {
      return r.dias.some(function (d) { return d.e || d.s; });
    }).length;
    $('#semanalContagem').textContent = linhas.length + ' pessoas · ' + comMov + ' com movimento';

    var head1 = '<tr>' +
      '<th class="pessoa" rowspan="2">Nome Completo</th>' +
      '<th class="sub" rowspan="2">Função</th>' +
      '<th class="sub" rowspan="2">Empresa</th>';
    dias.forEach(function (d) {
      head1 += '<th colspan="2">' + DIAS_CURTOS[d.getDay() === 0 ? 6 : d.getDay() - 1] +
        ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '</th>';
    });
    if (ehAdmin()) head1 += '<th rowspan="2" class="excluir-col">Excluir</th>';
    head1 += '</tr>';
    var head2 = '<tr>';
    dias.forEach(function () {
      head2 += '<th>E</th><th>S</th>';
    });
    head2 += '</tr>';

    var cols = 3 + 14 + (ehAdmin() ? 1 : 0);
    var corpo = '';
    var ultimaEmpresa = null;
    linhas.forEach(function (r) {
      if (r.empresa && r.empresa !== ultimaEmpresa) {
        ultimaEmpresa = r.empresa;
        corpo += '<tr class="grupo-empresa"><td class="pessoa" colspan="' + cols + '">' +
          esc(r.empresa) + '</td></tr>';
      }
      corpo += '<tr>' +
        '<td class="pessoa">' + esc(r.nome) + '</td>' +
        '<td class="sub">' + esc(r.funcao) + '</td>' +
        '<td class="sub">' + esc(r.empresa) + '</td>';
      r.dias.forEach(function (d) {
        corpo += '<td class="hora' + (d.e ? ' e' : ' vazio') + '">' + (d.e || '·') + '</td>';
        corpo += '<td class="hora' + (d.s ? ' s' : ' vazio') + '">' + (d.s || '·') + '</td>';
      });
      if (ehAdmin()) {
        corpo += '<td class="excluir-col">' + (r.ids.length
          ? '<button type="button" class="btn danger sm" data-act="excluirSemana" data-ids="' +
            esc(r.ids.filter(function (v, i, s2) { return s2.indexOf(v) === i; }).join(',')) +
            '" data-nome="' + esc(r.nome) + '">Excluir</button>'
          : '—') + '</td>';
      }
      corpo += '</tr>';
    });

    if (!linhas.length) {
      corpo = '<tr><td colspan="' + cols + '" style="padding:28px;color:#64748b">Nenhuma pessoa encontrada para os filtros.</td></tr>';
    }

    $('#tabelaSemanal').innerHTML =
      '<thead>' + head1 + head2 + '</thead><tbody>' + corpo + '</tbody>';
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function baixarCsv(nomeArquivo, linhas) {
    var blob = new Blob(['\ufeff' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportarCsv() {
    var itens = acessosFiltrados();
    if (!itens.length) {
      toast('Nenhum registro para exportar', 'erro');
      return;
    }
    var linhas = [['Nome', 'Tipo', 'Função', 'Empresa', 'Veículo', 'Placa', 'Nota Fiscal', 'CPF', 'Atividade', 'Obra', 'Entrada', 'Saída', 'Status', 'Observação'].join(';')];
    itens.forEach(function (a) {
      linhas.push([
        a.nome,
        a.tipo === 'veiculo' ? 'Veículo' : 'Pessoa',
        a.funcao,
        a.empresa,
        a.veiculo,
        a.placa,
        a.notaFiscal,
        a.cpf,
        a.atividade,
        a.obra,
        fmtDataHora(a.dataEntrada),
        fmtDataHora(a.dataSaida),
        a.status === 'dentro' ? 'Dentro' : 'Concluído',
        a.obs
      ].map(csvCell).join(';'));
    });
    baixarCsv('historico-acessos-' + isoDate(new Date()) + '.csv', linhas);
    toast('CSV exportado · ' + itens.length + ' registros');
  }

  function exportarSemana() {
    var dias = diasDaSemana(state.semanaRef);
    var linhas = linhasSemanal();
    if (!linhas.length) {
      toast('Nada para exportar nesta semana', 'erro');
      return;
    }
    var cabecalho = ['Nome Completo', 'Função', 'Empresa'];
    dias.forEach(function (d) {
      var rot = pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
      cabecalho.push(rot + ' Entrada', rot + ' Saída');
    });
    var out = [cabecalho.join(';')];
    linhas.forEach(function (r) {
      var row = [r.nome, r.funcao, r.empresa];
      r.dias.forEach(function (d) {
        row.push(d.e, d.s);
      });
      out.push(row.map(csvCell).join(';'));
    });
    baixarCsv('espelho-semanal-' + isoDate(dias[0]) + '.csv', out);
    toast('Espelho exportado · ' + linhas.length + ' pessoas');
  }

  function renderAll() {
    renderStats();
    renderDentro();
    renderHistorico();
    renderCalendario();
    renderPessoas();
    renderSemanal();
    renderManual();
  }

  function setTab(name) {
    if (name === 'pessoas' && !ehAdmin()) {
      toast('Acesso restrito ao Admin.', 'erro');
      name = 'registrar';
    }
    state.tab = name;
    $$('.tab').forEach(function (s) {
      s.classList.toggle('active', s.id === 'tab-' + name);
    });
    $$('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    if (name === 'dentro') renderDentro();
    if (name === 'semanal') renderSemanal();
    if (name === 'historico') { renderHistorico(); renderCalendario(); }
    if (name === 'pessoas') renderPessoas();
    if (name === 'manual') renderManual();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function atualizarObrigatorioPlaca() {
    var bicicleta = $('#regTipoVeiculo').value === 'Bicicleta';
    $('#regPlaca').required = state.tipo === 'veiculo' && !bicicleta;
  }

  function setTipo(t) {
    state.tipo = t;
    $$('[data-tipo]').forEach(function (b) {
      var active = b.getAttribute('data-tipo') === t;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    $$('.grupo-veiculo').forEach(function (el) { el.hidden = t !== 'veiculo'; });
    $$('.grupo-pessoa').forEach(function (el) { el.hidden = t !== 'pessoa'; });
    atualizarObrigatorioPlaca();
  }

  function registrarEntrada(ev) {
    ev.preventDefault();
    var tipo = state.tipo;
    var nome = $('#regNome').value.trim();
    var funcao = $('#regFuncao').value.trim();
    var empresa = $('#regEmpresa').value.trim();
    var placa = maskPlaca($('#regPlaca').value);
    var cpf = maskDoc($('#regTipoDoc').value, $('#regCpf').value);
    var veiculo = $('#regTipoVeiculo').value;
    var obra = $('#regObra').value;
    var atividade = $('#regAtividade').value;

    if (!nome) {
      toast('Informe o nome completo', 'erro');
      $('#regNome').focus();
      return;
    }

    if (tipo === 'veiculo' && veiculo !== 'Bicicleta') {
      if (soPlaca(placa).length < 7) {
        toast('Informe a placa completa (7 caracteres)', 'erro');
        $('#regPlaca').focus();
        return;
      }
      var pl = soPlaca(placa);
      var dup = state.acessos.find(function (a) {
        return a.status === 'dentro' && a.placa && soPlaca(a.placa) === pl;
      });
      if (dup && !confirm('A placa ' + placa + ' já está dentro (' + dup.nome + ').\nRegistrar mesmo assim?')) {
        return;
      }
    }

    if (cpf && !validaDoc($('#regTipoDoc').value, cpf)) {
      toast($('#regTipoDoc').value === 'cpf' ? 'CPF inválido' : $('#regTipoDoc').value === 'cnh' ? 'CNH inválida (deve ter 11 dígitos)' : 'RG inválido', 'erro');
      $('#regCpf').focus();
      return;
    }

    var btn = $('#btnRegistrar');
    btn.disabled = true;
    btn.textContent = 'Salvando…';

    var data = {
      tipo: tipo,
      nome: nome,
      funcao: tipo === 'pessoa' ? (funcao || null) : null,
      empresa: empresa || null,
      veiculo: tipo === 'veiculo' ? veiculo : null,
      placa: tipo === 'veiculo' ? (soPlaca(placa) ? placa : null) : null,
      notaFiscal: null,
      cpf: cpf || null,
      tipoDoc: cpf ? $('#regTipoDoc').value : null,
      atividade: atividade || null,
      obra: obra || null,
      obs: null,
      status: 'dentro',
      dataEntrada: tsNow(),
      dataSaida: null
    };

    docAdd('acessos', data).then(function () {
      toast('Entrada registrada · ' + nome);
      $('#formEntrada').reset();
      setTipo(state.tipo);
      $('#regNome').focus();
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao salvar. Verifique o Firebase.', 'erro');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Registrar entrada';
    });
  }

  function registrarSaida(id) {
    var a = state.acessos.find(function (x) { return x.id === id; });
    docUpdate('acessos', id, { status: 'fora', dataSaida: tsNow() }).then(function () {
      toast('Saída registrada · ' + (a ? a.nome : ''));
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao registrar saída', 'erro');
    });
  }

  function excluirAcesso(id, msg) {
    if (!exigirAdmin('Somente o Admin pode excluir ou cancelar registros.')) return;
    if (!confirm(msg || 'Excluir este registro de acesso?')) return;
    docDelete('acessos', id).then(function () {
      toast('Registro excluído');
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao excluir registro', 'erro');
    });
  }

  function excluirVarios(idsCsv, msg) {
    if (!exigirAdmin('Somente o Admin pode excluir registros.')) return;
    var ids = String(idsCsv || '').split(',').filter(function (v) { return v; });
    if (!ids.length) return;
    if (!confirm(msg || 'Excluir ' + ids.length + ' registros?')) return;
    Promise.all(ids.map(function (id) {
      return docDelete('acessos', id);
    })).then(function () {
      toast(ids.length + ' registro(s) excluído(s)');
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao excluir registros', 'erro');
    });
  }

  function entradaRapida(pessoaId) {
    var p = state.pessoas.find(function (x) { return x.id === pessoaId; });
    if (!p) return;
    var cpfDig = p.cpf ? soDigitos(p.cpf) : null;
    var jaDentro = cpfDig && state.acessos.some(function (a) {
      return a.status === 'dentro' && a.cpf && soDigitos(a.cpf) === cpfDig;
    });
    var jaDentroNome = !cpfDig && state.acessos.some(function (a) {
      return a.status === 'dentro' && normTxt(a.nome) === normTxt(p.nome);
    });
    if ((jaDentro || jaDentroNome) && !confirm(p.nome + ' já está registrado dentro.\nRegistrar nova entrada?')) {
      return;
    }

    docAdd('acessos', {
      tipo: 'pessoa',
      nome: p.nome,
      funcao: p.funcao || null,
      empresa: p.empresa || null,
      cpf: p.cpf || null,
      tipoDoc: p.tipoDoc || null,
      veiculo: null,
      placa: null,
      notaFiscal: null,
      atividade: 'Fornecedor',
      obra: null,
      obs: null,
      status: 'dentro',
      dataEntrada: tsNow(),
      dataSaida: null
    }).then(function () {
      toast('Entrada registrada · ' + p.nome);
      setTab('dentro');
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao registrar entrada', 'erro');
    });
  }

  function salvarPessoa(ev) {
    ev.preventDefault();
    if (!exigirAdmin('Somente o Admin pode gerenciar o cadastro de pessoas.')) return;
    var nome = $('#pesNome').value.trim();
    var funcao = $('#pesFuncao').value.trim();
    var tipoDoc = $('#pesTipoDoc').value;
    var cpf = maskDoc(tipoDoc, $('#pesCpf').value);

    if (!nome) {
      toast('Informe o nome completo', 'erro');
      $('#pesNome').focus();
      return;
    }
    if (!validaDoc(tipoDoc, cpf)) {
      toast(tipoDoc === 'cpf' ? 'CPF inválido' : tipoDoc === 'cnh' ? 'CNH inválida (deve ter 11 dígitos)' : 'RG inválido', 'erro');
      $('#pesCpf').focus();
      return;
    }
    var dig = normDoc(cpf);
    var dup = state.pessoas.find(function (p) {
      var mesmoTipo = (p.tipoDoc || 'cpf') === tipoDoc;
      return p.id !== state.editPessoaId && mesmoTipo && p.cpf && normDoc(p.cpf) === dig;
    });
    if (dig && dup) {
      toast('Documento já cadastrado: ' + dup.nome, 'erro');
      $('#pesCpf').focus();
      return;
    }

    var data = {
      nome: nome,
      funcao: funcao || null,
      cpf: cpf || null,
      tipoDoc: cpf ? tipoDoc : null,
      telefone: $('#pesTelefone').value.trim() || null,
      empresa: $('#pesEmpresa').value.trim() || null,
      tipo: $('#pesTipo').value
    };

    var btn = $('#btnPessoaSalvar');
    btn.disabled = true;

    var editando = !!state.editPessoaId;
    var promessa = editando
      ? docUpdate('pessoas', state.editPessoaId, data)
      : docAdd('pessoas', data);

    promessa.then(function () {
      toast(editando ? 'Pessoa atualizada · ' + nome : 'Pessoa cadastrada · ' + nome);
      limparFormPessoa();
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao salvar pessoa', 'erro');
    }).finally(function () {
      btn.disabled = false;
    });
  }

  function editarPessoa(id) {
    if (!exigirAdmin('Somente o Admin pode editar cadastros.')) return;
    var p = state.pessoas.find(function (x) { return x.id === id; });
    if (!p) return;
    state.editPessoaId = id;
    $('#pesNome').value = p.nome || '';
    $('#pesFuncao').value = p.funcao || '';
    $('#pesCpf').value = p.cpf || '';
    var td = $('#pesTipoDoc');
    td.value = p.tipoDoc || 'cpf';
    $('#pesCpf').placeholder = placeholderDoc(td.value);
    $('#pesTelefone').value = p.telefone || '';
    $('#pesEmpresa').value = p.empresa || '';
    $('#pesTipo').value = p.tipo || 'Fornecedor';
    $('#pessoasTitulo').textContent = 'Editar pessoa';
    $('#btnPessoaSalvar').textContent = 'Salvar alterações';
    $('#btnPessoaCancelar').hidden = false;
    $('#formPessoa').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#pesNome').focus();
  }

  function limparFormPessoa() {
    $('#formPessoa').reset();
    state.editPessoaId = null;
    $('#pessoasTitulo').textContent = 'Cadastrar pessoa';
    $('#btnPessoaSalvar').textContent = 'Cadastrar pessoa';
    $('#btnPessoaCancelar').hidden = true;
  }

  function excluirPessoa(id) {
    if (!exigirAdmin('Somente o Admin pode excluir cadastros.')) return;
    var p = state.pessoas.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('Excluir ' + p.nome + ' do cadastro?')) return;
    docDelete('pessoas', id).then(function () {
      if (state.editPessoaId === id) limparFormPessoa();
      toast('Pessoa excluída');
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao excluir pessoa', 'erro');
    });
  }

  function importarBase() {
    if (!exigirAdmin('Somente o Admin pode importar a base.')) return;
    if (!useCloud || !BASE.length || !fs) return;
    var existentes = {};
    state.pessoas.forEach(function (p) { existentes[normTxt(p.nome)] = true; });
    var novos = BASE.filter(function (p) { return !existentes[normTxt(p.nome)]; });
    if (!novos.length) {
      toast('Base já importada · ' + state.pessoas.length + ' pessoas');
      return;
    }
    if (!confirm('Importar ' + novos.length + ' pessoas da planilha para o Firebase?')) return;

    var batch = fs.batch();
    var contador = 0;
    var promessas = [];
    novos.forEach(function (p) {
      var ref = fs.collection('pessoas').doc();
      batch.set(ref, {
        nome: p.nome,
        funcao: p.funcao || null,
        cpf: null,
        telefone: null,
        empresa: p.empresa || null,
        tipo: 'Funcionário'
      });
      contador++;
      if (contador === 400) {
        promessas.push(batch.commit());
        batch = fs.batch();
        contador = 0;
      }
    });
    if (contador > 0) promessas.push(batch.commit());

    Promise.all(promessas).then(function () {
      toast('Importadas ' + novos.length + ' pessoas da planilha');
    }).catch(function (e) {
      console.error(e);
      toast('Erro ao importar base', 'erro');
    });
  }

  function onListaClick(ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');
    if (act === 'saida') registrarSaida(id);
    else if (act === 'cancelar') excluirAcesso(id, 'Cancelar esta entrada? O registro será apagado.');
    else if (act === 'excluirAcesso') excluirAcesso(id);
    else if (act === 'excluirSemana') excluirVarios(
      btn.getAttribute('data-ids'),
      'Excluir todos os horários de ' + btn.getAttribute('data-nome') + ' nesta semana?'
    );
    else if (act === 'entrada') entradaRapida(id);
    else if (act === 'editar') editarPessoa(id);
    else if (act === 'excluirPessoa') excluirPessoa(id);
  }

  function manItens() {
    return (state.acessos || []).filter(function (a) { return a.origem === 'manual'; });
  }

  function manFiltrados() {
    return manItens();
  }

  var MAN_INI = new Date(2026, 8, 21);

  function semanasDoMes(ref) {
    var ano = ref.getFullYear();
    var mes = ref.getMonth();
    var ultimo = new Date(ano, mes + 1, 0);
    var ini = segundaDaSemana(new Date(ano, mes, 1));
    var semanas = [];
    for (var i = 0; ; i++) {
      var d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i * 7);
      if (d > ultimo) break;
      semanas.push(diasDaSemana(d));
    }
    return semanas;
  }

  function rotuloMes(ref) {
    var f = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
      'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var m = f[ref.getMonth()] || '';
    return m.charAt(0).toUpperCase() + m.slice(1) + ' / ' + ref.getFullYear();
  }

  function rotuloData(d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function limitesDoMes(ref) {
    var primeiro = new Date(ref.getFullYear(), ref.getMonth(), 1);
    var ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { de: primeiro > MAN_INI ? primeiro : MAN_INI, ate: ultimo };
  }

  function diasVisiveis(semana, ref) {
    var lim = limitesDoMes(ref);
    return semana.filter(function (d) {
      return d >= lim.de && d <= lim.ate;
    });
  }

  function manPessoas() {
    var mapa = {};
    manFiltrados().forEach(function (a) {
      var k = normTxt(a.nome);
      if (!k) return;
      if (!mapa[k]) {
        mapa[k] = {
          chave: k, nome: a.nome, funcao: a.funcao || '', empresa: a.empresa || '',
          placa: a.placa || '', veiculo: a.veiculo || '', tipo: a.tipo || 'pessoa', ids: []
        };
      }
      mapa[k].ids.push(a.id);
      if (a.funcao && !mapa[k].funcao) mapa[k].funcao = a.funcao;
      if (a.empresa && !mapa[k].empresa) mapa[k].empresa = a.empresa;
      if (a.placa && !mapa[k].placa) mapa[k].placa = a.placa;
    });
    state.manPessoas = mapa;
    return mapa;
  }

  function manLinhas(dias) {
    var inicio = dias[0];
    var fim = dias[dias.length - 1];
    var total = dias.length;
    var mapa = {};
    var ordem = [];

    manFiltrados().forEach(function (a) {
      var k = normTxt(a.nome);
      if (!k) return;
      var dentro = false;
      var te = toDate(a.dataEntrada);
      var ts = toDate(a.dataSaida);
      if (te && dentroDoIntervalo(te, inicio, fim)) dentro = true;
      if (ts && dentroDoIntervalo(ts, inicio, fim)) dentro = true;
      if (!dentro) return;

      if (!mapa[k]) {
        mapa[k] = {
          chave: k, nome: a.nome, funcao: a.funcao || '', empresa: a.empresa || '',
          placa: a.placa || '', veiculo: a.veiculo || '', tipo: a.tipo || 'pessoa',
          ids: [],
          dias: dias.map(function () { return { e: null, s: null }; })
        };
        ordem.push(k);
      }
      var row = mapa[k];
      row.ids.push(a.id);
      if (a.funcao && !row.funcao) row.funcao = a.funcao;
      if (a.placa && !row.placa) row.placa = a.placa;

      if (te && dentroDoIntervalo(te, inicio, fim)) {
        for (var i = 0; i < total; i++) {
          if (mesmoDia(te, dias[i])) {
            var hE = pad(te.getHours()) + ':' + pad(te.getMinutes());
            if (!row.dias[i].e || hE < row.dias[i].e.hora) {
              row.dias[i].e = { hora: hE, id: a.id };
            }
            break;
          }
        }
      }
      if (ts && dentroDoIntervalo(ts, inicio, fim)) {
        for (var j = 0; j < total; j++) {
          if (mesmoDia(ts, dias[j])) {
            var hS = pad(ts.getHours()) + ':' + pad(ts.getMinutes());
            if (!row.dias[j].s || hS > row.dias[j].s.hora) {
              row.dias[j].s = { hora: hS, id: a.id };
            }
            break;
          }
        }
      }
    });

    ordem.sort(function (a, b) {
      var x = mapa[a].empresa || '';
      var y = mapa[b].empresa || '';
      if (x !== y) return x < y ? -1 : 1;
      return (mapa[a].nome || '') < (mapa[b].nome || '') ? -1 : 1;
    });

    return ordem.map(function (k) { return mapa[k]; });
  }

  function manInput(campo, valor, extra) {
    return '<input type="text" class="celula-input c-' + campo + '" value="' + esc(valor || '') + '"' +
      (extra || '') + '>';
  }

  function manInputHora(mov, chave, diaIso) {
    var val = mov ? mov.hora : '';
    var attrs = ' data-man-chave="' + esc(chave) + '" data-man-dia="' + esc(diaIso) + '"' +
      ' data-man-mov="' + mov + '" aria-label="Hora"';
    if (mov && mov.id) attrs += ' data-man-id="' + esc(mov.id) + '"';
    return '<input type="time" class="celula-input hora-input ' + mov + '" value="' + esc(val) + '"' + attrs + '>';
  }

  function manLinhaNova(dias) {
    var n = state.manNovo;
    var corpo = '<tr class="nova-linha">' +
      '<td class="pessoa"><input type="text" class="celula-input c-nome" data-man-novo="nome" ' +
      'placeholder="Nova pessoa" value="' + esc(n.nome) + '"></td>' +
      '<td class="sub"><input type="text" class="celula-input c-funcao" data-man-novo="funcao" ' +
      'placeholder="Função" value="' + esc(n.funcao) + '"></td>' +
      '<td class="sub"><input type="text" class="celula-input c-empresa" data-man-novo="empresa" ' +
      'placeholder="Empresa" value="' + esc(n.empresa) + '"></td>';
    dias.forEach(function (d) {
      var diaIso = isoDate(d);
      corpo += '<td class="hora e"><input type="time" class="celula-input hora-input e" data-man-novo-hora="e" ' +
        'data-man-dia="' + esc(diaIso) + '" aria-label="Hora da entrada"></td>' +
        '<td class="hora s"><input type="time" class="celula-input hora-input s" data-man-novo-hora="s" ' +
        'data-man-dia="' + esc(diaIso) + '" aria-label="Hora da saída"></td>';
    });
    if (ehAdmin()) corpo += '<td class="nowrap">—</td>';
    return corpo + '</tr>';
  }

  function manCabecalho(dias) {
    var head1 = '<tr>' +
      '<th class="pessoa" rowspan="2">Nome Completo</th>' +
      '<th class="sub" rowspan="2">Função</th>' +
      '<th class="sub" rowspan="2">Empresa</th>';
    var head2 = '<tr>';
    var hoje = new Date();
    dias.forEach(function (d) {
      var cls = 'dia-col' + (mesmoDia(d, hoje) ? ' hoje' : '');
      head1 += '<th class="' + cls + '" colspan="2"><b>' + d.getDate() + '</b> ' +
        DIAS_CURTOS[d.getDay() === 0 ? 6 : d.getDay() - 1] + '</th>';
      head2 += '<th class="' + cls + ' rot-e">E</th><th class="' + cls + ' rot-s">S</th>';
    });
    if (ehAdmin()) head1 += '<th rowspan="2">Excluir</th>';
    return head1 + '</tr>' + head2 + '</tr>';
  }

  function blocoSemana(dias, ehAtual) {
    var ini = dias[0];
    var fim = dias[dias.length - 1];
    var linhas = manLinhas(dias);
    var cols = 3 + dias.length * 2 + (ehAdmin() ? 1 : 0);
    var corpo = '';
    var ultimaEmpresa = null;

    linhas.forEach(function (r) {
      if (r.empresa && r.empresa !== ultimaEmpresa) {
        ultimaEmpresa = r.empresa;
        corpo += '<tr class="grupo-empresa"><td class="pessoa" colspan="' + cols + '">' +
          esc(r.empresa) + '</td></tr>';
      }
      var who = ' data-man-chave="' + esc(r.chave) + '"';
      corpo += '<tr>' +
        '<td class="pessoa">' + manInput('nome', r.nome, who) + '</td>' +
        '<td class="sub">' + manInput('funcao', r.funcao, who) + '</td>' +
        '<td class="sub">' + manInput('empresa', r.empresa, who) + '</td>';
      r.dias.forEach(function (d, i) {
        var diaIso = isoDate(dias[i]);
        corpo += '<td class="hora e' + (d.e ? '' : ' vazio') + '">' + manInputHora(d.e, r.chave, diaIso) + '</td>' +
          '<td class="hora s' + (d.s ? '' : ' vazio') + '">' + manInputHora(d.s, r.chave, diaIso) + '</td>';
      });
      if (ehAdmin()) {
        corpo += '<td class="nowrap"><button type="button" class="btn danger sm" data-man-excluir="' +
          esc(r.ids.join(',')) + '" data-man-nome="' + esc(r.nome) + '">Excluir</button></td>';
      }
      corpo += '</tr>';
    });

    if (!linhas.length) {
      corpo = '<tr class="semana-vazia"><td colspan="' + cols + '">' +
        'Sem registros nesta semana — use a primeira linha para incluir alguém.</td></tr>';
    }

    return '<section class="semana-bloco' + (ehAtual ? ' atual' : '') + '">' +
      '<header class="semana-head">' +
      '<strong>Semana de ' + rotuloData(ini) + ' a ' + rotuloData(fim) + '</strong>' +
      (ehAtual ? '<span class="tag-atual">atual</span>' : '') +
      '</header>' +
      '<div class="espelho-wrap"><table class="espelho">' +
      '<thead>' + manCabecalho(dias) + '</thead>' +
      '<tbody>' + manLinhaNova(dias) + corpo + '</tbody>' +
      '</table></div></section>';
  }

  function renderManual() {
    var cont = $('#manSemanas');
    if (!cont) return;
    manPessoas();

    var hoje = new Date();
    var rotulo = $('#manMesLabel');
    if (rotulo) rotulo.textContent = rotuloMes(state.manMesRef);

    var ref = state.manMesRef;
    var lim = limitesDoMes(ref);

    var cab = '<div class="mes-divisor"><span>' + rotuloMes(ref) + '</span>' +
      (lim.de > new Date(ref.getFullYear(), ref.getMonth(), 1)
        ? '<span class="mes-nota">a partir de ' + rotuloData(lim.de) + '</span>' : '') +
      '</div>';

    var corpo = '';
    var blocos = 0;
    semanasDoMes(ref).forEach(function (dias) {
      var vis = diasVisiveis(dias, ref);
      if (!vis.length) return;
      blocos++;
      corpo += blocoSemana(vis, mesmoDia(dias[0], segundaDaSemana(hoje)));
    });

    if (!blocos) {
      corpo = '<p class="semana-vazia-bloco">O registro começa em ' + rotuloData(MAN_INI) + '.</p>';
    }
    cont.innerHTML = cab + corpo;

    var contagem = $('#manContagem');
    if (contagem) {
      var totalPessoas = Object.keys(state.manPessoas || {}).length;
      contagem.textContent = blocos + ' semanas · ' + totalPessoas + ' pessoas';
    }
  }

  function manPessoa(chave) {
    return (state.manPessoas || {})[chave] || null;
  }

  function salvarTextoManual(input) {
    var chave = input.getAttribute('data-man-chave');
    var m = input.className.match(/c-(nome|empresa|funcao)/);
    if (!chave || !m) return;
    var p = manPessoa(chave);
    if (!p) return;
    var valor = input.value.trim();
    if (m[1] === 'nome' && !valor) { renderManual(); return; }

    var patch = {};
    patch[m[1]] = valor || null;
    Promise.all(p.ids.map(function (id) {
      return docUpdate('acessos', id, patch);
    })).catch(function (err) {
      console.error(err);
      toast('Erro ao salvar', 'erro');
      renderManual();
    });
  }

  function salvarHoraManual(input) {
    var chave = input.getAttribute('data-man-chave');
    var diaIso = input.getAttribute('data-man-dia');
    var mov = input.getAttribute('data-man-mov');
    var id = input.getAttribute('data-man-id');
    var hora = input.value;

    if (!hora) {
      if (!id) { renderManual(); return; }
      if (!confirm('Apagar este horário?')) { renderManual(); return; }
      docDelete('acessos', id).then(function () {
        toast('Horário removido');
      }).catch(function (err) {
        console.error(err);
        toast('Erro ao remover', 'erro');
        renderManual();
      });
      return;
    }

    var dt = new Date(diaIso + 'T' + hora + ':00');
    if (isNaN(dt)) { renderManual(); return; }
    var iso = dt.toISOString();
    var p = manPessoa(chave);

    var base = { origem: 'manual', dataMovimento: iso };
    if (mov === 'e') {
      base.tipoManual = 'entrada';
      base.dataEntrada = iso;
      base.dataSaida = null;
      base.status = 'dentro';
    } else {
      base.tipoManual = 'saida';
      base.dataSaida = iso;
      base.status = 'fora';
    }
    if (p) {
      base.nome = p.nome;
      base.empresa = p.empresa || null;
      base.funcao = p.funcao || null;
      base.tipo = p.tipo || 'pessoa';
      base.veiculo = p.veiculo || null;
      base.placa = p.placa || null;
    }

    var acao = id
      ? docUpdate('acessos', id, base).then(function () { toast('Horário atualizado'); })
      : docAdd('acessos', base).then(function () { toast('Horário registrado'); });

    acao.catch(function (err) {
      console.error(err);
      toast('Erro ao salvar o horário', 'erro');
      renderManual();
    });
  }

  function registrarNovoHorario(input) {
    var mov = input.getAttribute('data-man-novo-hora');
    var diaIso = input.getAttribute('data-man-dia');
    var hora = input.value;
    var linha = input.closest('tr');
    var campoNome = linha.querySelector('[data-man-novo="nome"]');
    var campoFuncao = linha.querySelector('[data-man-novo="funcao"]');
    var campoEmpresa = linha.querySelector('[data-man-novo="empresa"]');
    var nome = campoNome.value.trim();

    if (!hora) { renderManual(); return; }
    if (!nome) {
      toast('Digite o nome na primeira linha', 'erro');
      renderManual();
      return;
    }

    var dt = new Date(diaIso + 'T' + hora + ':00');
    if (isNaN(dt)) { renderManual(); return; }
    var iso = dt.toISOString();

    docAdd('acessos', {
      origem: 'manual',
      tipoManual: mov === 'e' ? 'entrada' : 'saida',
      tipo: 'pessoa',
      nome: nome,
      empresa: (campoEmpresa.value || '').trim() || null,
      funcao: (campoFuncao.value || '').trim() || null,
      veiculo: null,
      placa: null,
      dataMovimento: iso,
      dataEntrada: mov === 'e' ? iso : null,
      dataSaida: mov === 's' ? iso : null,
      status: mov === 'e' ? 'dentro' : 'fora'
    }).then(function () {
      state.manNovo.nome = nome;
      state.manNovo.empresa = (campoEmpresa.value || '').trim();
      state.manNovo.funcao = (campoFuncao.value || '').trim();
      toast(mov === 'e' ? 'Entrada registrada' : 'Saída registrada');
    }).catch(function (err) {
      console.error(err);
      toast('Erro ao salvar. Verifique o Firebase.', 'erro');
    });
  }

  function excluirLinhaManual(idsCsv, nome) {
    var ids = idsCsv.split(',').filter(function (x) { return x; });
    if (!ids.length) return;
    if (!confirm('Excluir os horários de ' + nome + ' nesta semana?')) return;
    Promise.all(ids.map(function (id) {
      return docDelete('acessos', id);
    })).then(function () {
      toast('Registros excluídos');
    }).catch(function (err) {
      console.error(err);
      toast('Erro ao excluir', 'erro');
    });
  }

  function exportarManualCsv() {
    var ref = state.manMesRef;
    var linhas = [];
    semanasDoMes(ref).forEach(function (dias) {
      var vis = diasVisiveis(dias, ref);
      if (!vis.length) return;
      var head = ['Semana ' + rotuloData(vis[0]) + ' a ' + rotuloData(vis[vis.length - 1])];
      vis.forEach(function (d) {
        var lbl = DIAS_CURTOS[d.getDay() === 0 ? 6 : d.getDay() - 1] + ' ' + d.getDate();
        head.push(lbl + ' E');
        head.push(lbl + ' S');
      });
      linhas.push(head.map(csvCell).join(';'));
      manLinhas(vis).forEach(function (r) {
        var l = [r.nome, r.funcao, r.empresa];
        r.dias.forEach(function (d) {
          l.push(d.e ? d.e.hora : '');
          l.push(d.s ? d.s.hora : '');
        });
        linhas.push(l.map(csvCell).join(';'));
      });
      linhas.push('');
    });
    baixarCsv('registro-manual-' + rotuloMes(ref).toLowerCase().replace(/[^a-z0-9]+/g, '-') +
      '.csv', linhas);
  }

  function bind() {
    $$('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        setTab(b.getAttribute('data-tab'));
      });
    });

    $$('[data-tipo]').forEach(function (b) {
      b.addEventListener('click', function () {
        setTipo(b.getAttribute('data-tipo'));
      });
    });

    $('#formEntrada').addEventListener('submit', registrarEntrada);
    $('#formPessoa').addEventListener('submit', salvarPessoa);
    $('#btnPessoaCancelar').addEventListener('click', limparFormPessoa);
    $('#btnExportar').addEventListener('click', exportarCsv);
    $('#btnExportarSemana').addEventListener('click', exportarSemana);
    $('#btnImportar').addEventListener('click', importarBase);

    $('#loginForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      entrar();
    });
    $('#loginLocal').addEventListener('click', entrarLocal);
    $('#btnSair').addEventListener('click', sair);

    $('#regTipoVeiculo').addEventListener('change', atualizarObrigatorioPlaca);

    $('#regTipoDoc').addEventListener('change', function () {
      var td = $('#regTipoDoc').value;
      $('#regCpf').value = maskDoc(td, $('#regCpf').value);
      $('#regCpf').placeholder = placeholderDoc(td);
    });
    $('#regCpf').addEventListener('input', function () {
      this.value = maskDoc($('#regTipoDoc').value, this.value);
    });
    $('#regPlaca').addEventListener('input', function () { this.value = maskPlaca(this.value); });
    $('#pesTipoDoc').addEventListener('change', function () {
      var td = $('#pesTipoDoc').value;
      $('#pesCpf').value = maskDoc(td, $('#pesCpf').value);
      $('#pesCpf').placeholder = placeholderDoc(td);
    });
    $('#pesCpf').addEventListener('input', function () {
      this.value = maskDoc($('#pesTipoDoc').value, this.value);
    });
    $('#pesTelefone').addEventListener('input', function () { this.value = maskTelefone(this.value); });

    $('#filtQ').addEventListener('input', function () {
      state.filtros.q = this.value;
      renderHistorico();
    });
    $('#filtData').addEventListener('change', function () {
      state.filtros.data = this.value;
      renderHistorico();
    });
    $('#filtStatus').addEventListener('change', function () {
      state.filtros.status = this.value;
      renderHistorico();
    });
    $('#calData').addEventListener('change', renderCalendario);
    $('#calHoje').addEventListener('click', function () {
      $('#calData').value = isoDate(new Date());
      renderCalendario();
    });
    $('#pessoasBusca').addEventListener('input', renderPessoas);

    $('#semQ').addEventListener('input', function () {
      state.semanaFiltros.q = this.value;
      renderSemanal();
    });
    $('#semEmpresa').addEventListener('change', function () {
      state.semanaFiltros.empresa = this.value;
      renderSemanal();
    });
    $('#semObra').addEventListener('change', function () {
      state.semanaFiltros.obra = this.value;
      renderSemanal();
    });
    $('#semanaAnterior').addEventListener('click', function () {
      state.semanaRef = new Date(state.semanaRef.getTime() - 7 * 86400000);
      renderSemanal();
    });
    $('#semanaProxima').addEventListener('click', function () {
      state.semanaRef = new Date(state.semanaRef.getTime() + 7 * 86400000);
      renderSemanal();
    });
    $('#semanaAtual').addEventListener('click', function () {
      state.semanaRef = new Date();
      renderSemanal();
    });

    $('#listaDentro').addEventListener('click', onListaClick);
    $('#listaHistorico').addEventListener('click', onListaClick);
    $('#listaPessoasList').addEventListener('click', onListaClick);
    $('#tabelaSemanal').addEventListener('click', onListaClick);

    $('#btnManExportar').addEventListener('click', exportarManualCsv);
    $('#manMesAnterior').addEventListener('click', function () {
      state.manMesRef = new Date(state.manMesRef.getFullYear(), state.manMesRef.getMonth() - 1, 1);
      renderManual();
    });
    $('#manMesProximo').addEventListener('click', function () {
      state.manMesRef = new Date(state.manMesRef.getFullYear(), state.manMesRef.getMonth() + 1, 1);
      renderManual();
    });
    $('#manMesAtual').addEventListener('click', function () {
      state.manMesRef = new Date();
      renderManual();
    });
    $('#manSemanas').addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-man-novo');
      if (!k) return;
      state.manNovo[k] = e.target.value;
    });
    $('#manSemanas').addEventListener('change', function (e) {
      var novo = e.target.closest('[data-man-novo-hora]');
      if (novo) { registrarNovoHorario(novo); return; }
      var hora = e.target.closest('.hora-input');
      if (hora) { salvarHoraManual(hora); return; }
      var txt = e.target.closest('.celula-input');
      if (txt) { salvarTextoManual(txt); return; }
    });
    $('#manSemanas').addEventListener('click', function (e) {
      var ex = e.target.closest('[data-man-excluir]');
      if (ex) {
        if (!exigirAdmin('Somente o Admin pode excluir registros.')) return;
        excluirLinhaManual(ex.getAttribute('data-man-excluir'), ex.getAttribute('data-man-nome'));
      }
    });

    $('#bannerFechar').addEventListener('click', function () {
      $('#demoBanner').hidden = true;
    });
  }

  function pararDados() {
    dataUnsubs.forEach(function (unsubscribe) {
      if (typeof unsubscribe === 'function') unsubscribe();
    });
    dataUnsubs = [];
  }

  function iniciarDados() {
    pararDados();
    dataUnsubs.push(watch('acessos', function (list) {
      state.acessos = ordenarAcessos(list);
      renderAll();
    }));
    dataUnsubs.push(watch('pessoas', function (list) {
      state.pessoas = ordenarPessoas(list);
      renderAll();
    }));
  }

  function entrar() {
    var usuario = ($('#loginEmail').value || '').trim().toLowerCase();
    var senha = $('#loginSenha').value;

    if (usuario === 'admin' && senha === '4080') {
      state.sessao = { usuario: 'admin' };
      $('#loginErro').textContent = '';
      abrirApp();
      return;
    }

    if (usuario === 'portaria' && senha === '1234') {
      state.sessao = { usuario: 'portaria' };
      $('#loginErro').textContent = '';
      abrirApp();
      return;
    }

    $('#loginErro').textContent = 'Usuário ou senha incorretos.';
  }

  function entrarLocal() {
    if (useCloud) return;
    state.sessao = { usuario: 'admin' };
    abrirApp();
  }

  function sair() {
    var btn = $('#btnSair');
    btn.disabled = true;
    try {
      encerrarSessao();
    } catch (e) {
      console.error(e);
      toast('Não foi possível sair', 'erro');
    }
    if (auth && auth.currentUser) {
      auth.signOut().catch(function (error) {
        console.warn('signOut do Firebase Auth ignorado:', error);
      });
    }
    btn.disabled = false;
  }

  function encerrarSessao() {
    pararDados();
    state.sessao = null;
    state.acessos = [];
    state.pessoas = [];
    state.editPessoaId = null;
    $('#loginScreen').hidden = false;
    $('#btnSair').hidden = true;
    $('#loginSenha').value = '';
    $('#loginErro').textContent = '';
    $('#loginLocal').hidden = !state.demo;
    $('#loginEmail').focus();
    var r = $('#sessaoRotulo');
    if (r) r.hidden = true;
    var nav = $('#navPessoas');
    if (nav) nav.hidden = true;
    $$('.nav-btn').forEach(function (b) { b.hidden = true; });
    renderAll();
  }

  function abrirApp() {
    if (!state.sessao) return;
    $('#loginScreen').hidden = true;
    $('#btnSair').hidden = false;
    $('#loginSenha').value = '';
    $('#loginErro').textContent = '';
    $$('.nav-btn').forEach(function (b) { b.hidden = false; });
    aplicarPermissoes();
    iniciarDados();
    setTab('registrar');
    renderAll();
  }

  function atualizarRelogio() {
    var now = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    var hora = z(now.getHours()) + ':' + z(now.getMinutes()) + ':' + z(now.getSeconds());
    var dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    var mes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    var elH = $('#relogioHora');
    var elD = $('#relogioData');
    if (elH) elH.textContent = hora;
    if (elD) elD.textContent = dias[now.getDay()] + ', ' + z(now.getDate()) + ' ' + mes[now.getMonth()] + ' ' + now.getFullYear();
  }

  function boot() {
    useCloud = initFirebase();
    state.demo = !useCloud;
    if (state.demo) {
      loadDemo();
      $('#demoBanner').hidden = false;
    }
    renderStatus();
    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    bind();
    setTipo('veiculo');
    $('#loginScreen').hidden = false;
    $('#loginLocal').hidden = !state.demo;
    $('#loginEmail').focus();

    if (auth && auth.currentUser) {
      auth.signOut().catch(function () {});
    }

    setInterval(function () {
      if (state.tab === 'dentro') renderDentro();
    }, 30000);
  }

  boot();
})();
