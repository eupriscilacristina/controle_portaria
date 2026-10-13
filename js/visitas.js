// Módulo Visitas: cadastros de apartamentos, moradores (com PIN) e visitantes.
// Usa os helpers de js/api-config.js (JWT já existente). A API é a autoridade:
// esconder botões aqui é só visual. ADMIN edita e exclui; PORTEIRO lista e
// cadastra visitantes (o que a API permite a ele).
(function () {
  'use strict';

  var PIN_RE = /^\d{6}$/;
  var state = {
    apartamentos: [],
    moradores: [],
    visitantes: [],
    edicao: { apartamentos: null, moradores: null, visitantes: null }
  };

  function $(sel) { return document.querySelector(sel); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ehAdmin() {
    try {
      var u = JSON.parse(localStorage.getItem('eugestao_user') || 'null');
      return !!u && String(u.papel || '').toUpperCase() === 'ADMIN';
    } catch (e) {
      return false;
    }
  }

  function msgErro(e) {
    if (e && e.status === 401) return 'Sessão expirada. Saia e entre novamente.';
    if (e && e.status === 403) return 'Você não tem permissão para esta ação.';
    if (e && e.mensagem) return e.mensagem;
    return 'Não foi possível falar com o servidor. Verifique a conexão.';
  }

  function aviso(el, texto, ok) {
    el.textContent = texto || '';
    el.classList.toggle('ok', !!ok);
    el.hidden = !texto;
  }

  function rotuloApto(a) {
    return a.bloco ? 'Bloco ' + a.bloco + ' · Apto ' + a.numero : 'Apto ' + a.numero;
  }

  // ---------------------------------------------------------------------------
  // Permissões na tela (visual): formulários e ações de ADMIN
  // ---------------------------------------------------------------------------

  function aplicarPapel() {
    var admin = ehAdmin();
    $('#visApCard').hidden = !admin;
    $('#visMorCard').hidden = !admin;
    var qrFixo = document.querySelector('[data-vis-sub="qrfixo"]');
    if (qrFixo) qrFixo.hidden = !admin;
    document.querySelectorAll('.vis-root [data-so-edicao]').forEach(function (el) {
      el.hidden = true;
    });
  }

  // ---------------------------------------------------------------------------
  // Carregamento
  // ---------------------------------------------------------------------------

  function carregarTudo() {
    aviso($('#visStatus'), '');
    return Promise.all([
      apiGet('/visitas/apartamentos'),
      apiGet('/visitas/moradores'),
      apiGet('/visitas/visitantes')
    ]).then(function (r) {
      state.apartamentos = r[0] || [];
      state.moradores = r[1] || [];
      state.visitantes = r[2] || [];
      renderApartamentos();
      renderMoradores();
      renderVisitantes();
      preencherSelectApartamentos();
    }).catch(function (e) {
      aviso($('#visStatus'), msgErro(e));
      $('#visStatus').hidden = false;
    });
  }

  function recarregarVisitantes() {
    var q = $('#visVisBusca').value.trim();
    var caminho = '/visitas/visitantes' + (q ? '?q=' + encodeURIComponent(q) : '');
    return apiGet(caminho).then(function (lista) {
      state.visitantes = lista || [];
      renderVisitantes();
    }).catch(function (e) {
      aviso($('#visVisAviso'), msgErro(e));
    });
  }

  // ---------------------------------------------------------------------------
  // Renderização
  // ---------------------------------------------------------------------------

  function selo(texto, tipo) {
    return '<span class="badge ' + tipo + '">' + esc(texto) + '</span>';
  }

  function botoesAdmin(tipo, id) {
    if (!ehAdmin()) return '';
    return '<button type="button" class="btn ghost sm" data-vis-act="editar" data-tipo="' + tipo +
      '" data-id="' + esc(id) + '">Editar</button>' +
      '<button type="button" class="btn danger sm" data-vis-act="excluir" data-tipo="' + tipo +
      '" data-id="' + esc(id) + '">Excluir</button>';
  }

  function renderApartamentos() {
    var lista = state.apartamentos.slice().sort(function (a, b) {
      return rotuloApto(a).localeCompare(rotuloApto(b), 'pt-BR', { numeric: true });
    });
    $('#visApContagem').textContent = lista.length + (lista.length === 1 ? ' apartamento' : ' apartamentos');
    if (!lista.length) {
      $('#visListaApartamentos').innerHTML = '<p class="vis-aviso">Nenhum apartamento cadastrado.</p>';
      return;
    }
    $('#visListaApartamentos').innerHTML = lista.map(function (a) {
      var moradores = state.moradores.filter(function (m) { return m.apartamentoId === a.id; }).length;
      return '<div class="item"><div class="item-main">' +
        '<div class="item-title">' + esc(rotuloApto(a)) + '</div>' +
        '<div class="item-sub">' + moradores + (moradores === 1 ? ' morador' : ' moradores') + '</div>' +
        '</div><div class="item-actions">' +
        selo(a.ativo ? 'Ativo' : 'Inativo', a.ativo ? 'ok' : 'off') +
        botoesAdmin('apartamentos', a.id) +
        '</div></div>';
    }).join('');
  }

  function renderMoradores() {
    var lista = state.moradores.slice().sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
    $('#visMorContagem').textContent = lista.length + (lista.length === 1 ? ' morador' : ' moradores');
    if (!lista.length) {
      $('#visListaMoradores').innerHTML = '<p class="vis-aviso">Nenhum morador cadastrado.</p>';
      return;
    }
    $('#visListaMoradores').innerHTML = lista.map(function (m) {
      var apto = state.apartamentos.filter(function (a) { return a.id === m.apartamentoId; })[0];
      return '<div class="item"><div class="item-main">' +
        '<div class="item-title">' + esc(m.nome) + '</div>' +
        '<div class="item-sub">' + esc(apto ? rotuloApto(apto) : 'Apartamento não encontrado') + '</div>' +
        '</div><div class="item-actions">' +
        selo(m.pinDefinido ? 'PIN definido' : 'Sem PIN', m.pinDefinido ? 'ok' : 'warn') +
        selo(m.ativo ? 'Ativo' : 'Inativo', m.ativo ? 'ok' : 'off') +
        botoesAdmin('moradores', m.id) +
        '</div></div>';
    }).join('');
  }

  function renderVisitantes() {
    var lista = state.visitantes;
    $('#visVisContagem').textContent = lista.length + (lista.length === 1 ? ' visitante' : ' visitantes');
    if (!lista.length) {
      $('#visListaVisitantes').innerHTML = '<p class="vis-aviso">Nenhum visitante encontrado.</p>';
      return;
    }
    $('#visListaVisitantes').innerHTML = lista.map(function (v) {
      return '<div class="item"><div class="item-main">' +
        '<div class="item-title">' + esc(v.nome) + '</div>' +
        '<div class="item-sub">' + esc(v.documento || 'Sem documento') + '</div>' +
        '</div><div class="item-actions">' +
        botoesAdmin('visitantes', v.id) +
        '</div></div>';
    }).join('');
  }

  function preencherSelectApartamentos() {
    var sel = $('#visMorApto');
    var atual = sel.value;
    var opcoes = state.apartamentos.filter(function (a) { return a.ativo; })
      .sort(function (a, b) { return rotuloApto(a).localeCompare(rotuloApto(b), 'pt-BR', { numeric: true }); });
    sel.innerHTML = '<option value="">Selecione…</option>' + opcoes.map(function (a) {
      return '<option value="' + esc(a.id) + '">' + esc(rotuloApto(a)) + '</option>';
    }).join('');
    if (atual) sel.value = atual;
  }

  // ---------------------------------------------------------------------------
  // Formulários (criar e editar)
  // ---------------------------------------------------------------------------

  function setModo(tipo, editando) {
    var ids = {
      apartamentos: { titulo: '#visApTitulo', salvar: '#visApSalvar', cancelar: '#visApCancelar', form: '#visApForm', aviso: '#visApAviso' },
      moradores: { titulo: '#visMorTitulo', salvar: '#visMorSalvar', cancelar: '#visMorCancelar', form: '#visMorForm', aviso: '#visMorAviso' },
      visitantes: { titulo: '#visVisTitulo', salvar: '#visVisSalvar', cancelar: '#visVisCancelar', form: '#visVisForm', aviso: '#visVisAviso' }
    }[tipo];
    var nomes = {
      apartamentos: ['Novo apartamento', 'Editar apartamento', 'Cadastrar apartamento', 'Salvar alterações'],
      moradores: ['Novo morador', 'Editar morador', 'Cadastrar morador', 'Salvar alterações'],
      visitantes: ['Novo visitante', 'Editar visitante', 'Cadastrar visitante', 'Salvar alterações']
    }[tipo];
    $(ids.titulo).textContent = editando ? nomes[1] : nomes[0];
    $(ids.salvar).textContent = editando ? nomes[3] : nomes[2];
    $(ids.cancelar).hidden = !editando;
    aviso($(ids.aviso), '');
    var form = $(ids.form);
    document.querySelectorAll('#' + form.id + ' [data-so-edicao]').forEach(function (el) {
      el.hidden = !editando;
    });
    state.edicao[tipo] = editando ? state.edicao[tipo] : null;
  }

  function limparForm(tipo) {
    var form = { apartamentos: '#visApForm', moradores: '#visMorForm', visitantes: '#visVisForm' }[tipo];
    $(form).reset();
    $(form).querySelector('input[type=hidden]').value = '';
    setModo(tipo, false);
  }

  function editar(tipo, id) {
    var item = state[tipo].filter(function (x) { return x.id === id; })[0];
    if (!item) return;
    state.edicao[tipo] = id;
    if (tipo === 'apartamentos') {
      $('#visApId').value = id;
      $('#visApBloco').value = item.bloco || '';
      $('#visApNumero').value = item.numero;
      $('#visApAtivo').checked = !!item.ativo;
      setModo(tipo, true);
      $('#visApNumero').focus();
    } else if (tipo === 'moradores') {
      $('#visMorId').value = id;
      $('#visMorApto').value = item.apartamentoId;
      $('#visMorApto').disabled = true;
      $('#visMorNome').value = item.nome;
      $('#visMorPin').value = '';
      $('#visMorRemoverPin').checked = false;
      $('#visMorAtivo').checked = !!item.ativo;
      setModo(tipo, true);
      $('#visMorNome').focus();
    } else {
      $('#visVisId').value = id;
      $('#visVisNome').value = item.nome;
      $('#visVisDoc').value = item.documento || '';
      setModo(tipo, true);
      $('#visVisNome').focus();
    }
    $('#tab-visitas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function salvarApartamento(ev) {
    ev.preventDefault();
    var id = $('#visApId').value;
    var dados = {
      bloco: $('#visApBloco').value.trim(),
      numero: $('#visApNumero').value.trim()
    };
    if (!dados.numero) return aviso($('#visApAviso'), 'Informe o número do apartamento.');
    var req;
    if (id) {
      dados.ativo = $('#visApAtivo').checked;
      req = apiPatch('/visitas/apartamentos/' + encodeURIComponent(id), dados);
    } else {
      req = apiPost('/visitas/apartamentos', dados);
    }
    req.then(function () {
      limparForm('apartamentos');
      aviso($('#visApAviso'), 'Apartamento salvo.', true);
      return carregarTudo();
    }).catch(function (e) {
      aviso($('#visApAviso'), msgErro(e));
    });
  }

  function salvarMorador(ev) {
    ev.preventDefault();
    var id = $('#visMorId').value;
    var pin = $('#visMorPin').value.trim();
    var nome = $('#visMorNome').value.trim();
    if (!nome) return aviso($('#visMorAviso'), 'Informe o nome do morador.');
    if (pin && !PIN_RE.test(pin)) return aviso($('#visMorAviso'), 'O PIN deve ter exatamente 6 dígitos.');
    var req;
    if (id) {
      var dados = { nome: nome, ativo: $('#visMorAtivo').checked };
      if ($('#visMorRemoverPin').checked) dados.pin = null;
      else if (pin) dados.pin = pin;
      req = apiPatch('/visitas/moradores/' + encodeURIComponent(id), dados);
    } else {
      var novo = { apartamentoId: $('#visMorApto').value, nome: nome };
      if (!novo.apartamentoId) return aviso($('#visMorAviso'), 'Selecione o apartamento.');
      if (pin) novo.pin = pin;
      req = apiPost('/visitas/moradores', novo);
    }
    req.then(function () {
      limparForm('moradores');
      $('#visMorApto').disabled = false;
      aviso($('#visMorAviso'), 'Morador salvo.', true);
      return carregarTudo();
    }).catch(function (e) {
      aviso($('#visMorAviso'), msgErro(e));
    });
  }

  function salvarVisitante(ev) {
    ev.preventDefault();
    var id = $('#visVisId').value;
    var nome = $('#visVisNome').value.trim();
    var doc = $('#visVisDoc').value.trim();
    if (!nome) return aviso($('#visVisAviso'), 'Informe o nome do visitante.');
    var req;
    if (id) {
      req = apiPatch('/visitas/visitantes/' + encodeURIComponent(id), { nome: nome, documento: doc || null });
    } else {
      var novo = { nome: nome };
      if (doc) novo.documento = doc;
      req = apiPost('/visitas/visitantes', novo);
    }
    req.then(function () {
      limparForm('visitantes');
      aviso($('#visVisAviso'), 'Visitante salvo.', true);
      return carregarTudo();
    }).catch(function (e) {
      aviso($('#visVisAviso'), msgErro(e));
    });
  }

  // ---------------------------------------------------------------------------
  // Exclusão (ADMIN) e ações das listas
  // ---------------------------------------------------------------------------

  var ROTAS = { apartamentos: '/visitas/apartamentos/', moradores: '/visitas/moradores/', visitantes: '/visitas/visitantes/' };
  var NOMES = { apartamentos: 'apartamento', moradores: 'morador', visitantes: 'visitante' };

  function excluir(tipo, id) {
    if (!ehAdmin()) return;
    var item = state[tipo].filter(function (x) { return x.id === id; })[0];
    var nome = item ? (tipo === 'apartamentos' ? rotuloApto(item) : item.nome) : '';
    if (!window.confirm('Excluir ' + NOMES[tipo] + ' ' + nome + '? Esta ação não pode ser desfeita.')) return;
    apiDelete(ROTAS[tipo] + encodeURIComponent(id)).then(function () {
      aviso($('#visStatus'), 'Excluído com sucesso.', true);
      $('#visStatus').hidden = false;
      return carregarTudo();
    }).catch(function (e) {
      aviso($('#visStatus'), msgErro(e));
      $('#visStatus').hidden = false;
    });
  }

  function tratarListaClick(ev) {
    var btn = ev.target.closest('[data-vis-act]');
    if (!btn) return;
    var tipo = btn.getAttribute('data-tipo');
    var id = btn.getAttribute('data-id');
    if (btn.getAttribute('data-vis-act') === 'editar') editar(tipo, id);
    else excluir(tipo, id);
  }

  var PAINEIS = {
    visitas: '#visPainelVisitas',
    leitor: '#visPainelLeitor',
    historico: '#visPainelHistorico',
    pendencias: '#visPainelPendencias',
    apartamentos: '#visPainelApartamentos',
    moradores: '#visPainelMoradores',
    visitantes: '#visPainelVisitantes',
    qrfixo: '#visPainelQrFixo'
  };

  function mostrarSub(nome) {
    if (nome === 'qrfixo' && !ehAdmin()) nome = 'visitas';
    document.querySelectorAll('[data-vis-sub]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-vis-sub') === nome);
    });
    Object.keys(PAINEIS).forEach(function (k) {
      $(PAINEIS[k]).hidden = k !== nome;
    });
    // js/visitas-operacao.js carrega os dados da sub-aba ao recebê-lo.
    document.dispatchEvent(new CustomEvent('vis:sub', { detail: nome }));
  }

  // ---------------------------------------------------------------------------
  // Inicialização
  // ---------------------------------------------------------------------------

  function iniciar() {
    if (!$('#tab-visitas')) return;

    $('#visApForm').addEventListener('submit', salvarApartamento);
    $('#visMorForm').addEventListener('submit', salvarMorador);
    $('#visVisForm').addEventListener('submit', salvarVisitante);
    $('#visApCancelar').addEventListener('click', function () { limparForm('apartamentos'); });
    $('#visMorCancelar').addEventListener('click', function () {
      limparForm('moradores');
      $('#visMorApto').disabled = false;
    });
    $('#visVisCancelar').addEventListener('click', function () { limparForm('visitantes'); });
    ['#visListaApartamentos', '#visListaMoradores', '#visListaVisitantes'].forEach(function (sel) {
      $(sel).addEventListener('click', tratarListaClick);
    });
    document.querySelectorAll('[data-vis-sub]').forEach(function (b) {
      b.addEventListener('click', function () { mostrarSub(b.getAttribute('data-vis-sub')); });
    });

    var busca = null;
    $('#visVisBusca').addEventListener('input', function () {
      clearTimeout(busca);
      busca = setTimeout(recarregarVisitantes, 300);
    });

    // Entrar na aba carrega os dados. O app.js já alterna a seção visível.
    document.querySelector('.nav-btn[data-tab="visitas"]').addEventListener('click', function () {
      aplicarPapel();
      mostrarSub(document.querySelector('[data-vis-sub].active').getAttribute('data-vis-sub'));
      carregarTudo();
    });

  }

  // Scripts com defer rodam com o DOM já analisado.
  iniciar();
})();
