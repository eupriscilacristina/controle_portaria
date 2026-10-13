// Módulo Visitas: operação (nova visita, QR, leitor, histórico, pendências e QR fixo).
// Usa o JWT salvo por js/api-config.js. A API decide tudo; a tela só esconde
// o que não se aplica ao papel (ex.: excluir é só ADMIN).
(function () {
  'use strict';

  var API = '/api';
  var STATUS_TXT = { PENDENTE: 'Pendente', AUTORIZADA: 'Autorizada', VENCIDA: 'Vencida', EM_VISITA: 'Em visita', FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada' };
  var STATUS_TIPO = { PENDENTE: 'warn', AUTORIZADA: 'info', VENCIDA: 'off', EM_VISITA: 'ok', FINALIZADA: 'off', CANCELADA: 'off' };
  var MOTIVO_TXT = {
    INVALIDO: 'QR inválido ou substituído',
    VENCIDO: 'QR vencido',
    CANCELADO: 'Visita cancelada',
    USADO: 'QR já utilizado',
    FORA_DA_JANELA: 'Fora do período autorizado'
  };
  var LIMITE = 20;

  var cadastros = { apartamentos: [], visitantes: [] };
  var hist = { pagina: 1, total: 0 };
  var qrAtual = null;        // { visita, token, img } do último QR exibido
  var camera = { stream: null, timer: null, lendo: false, pausado: false, detector: null };

  function $(s) { return document.querySelector(s); }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ehAdmin() {
    try {
      var u = JSON.parse(localStorage.getItem('eugestao_user') || 'null');
      return !!u && String(u.papel || '').toUpperCase() === 'ADMIN';
    } catch (e) { return false; }
  }

  function token() { return localStorage.getItem('eugestao_token') || ''; }

  // Chamada HTTP que devolve o corpo mesmo em erro (o 422 do QR traz "motivo").
  function pedir(metodo, caminho, corpo) {
    return fetch(API + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: corpo === undefined ? undefined : JSON.stringify(corpo)
    }).then(function (res) {
      return res.text().then(function (txt) {
        var body = null;
        try { body = JSON.parse(txt); } catch (e) { body = null; }
        if (res.ok) return body;
        var err = new Error((body && body.error) || 'Erro na API: ' + res.status);
        err.status = res.status;
        err.motivo = body && body.motivo;
        throw err;
      });
    }, function () {
      var err = new Error('Não foi possível falar com o servidor. Verifique a conexão.');
      err.status = 0;
      throw err;
    });
  }

  function msgErro(e) {
    if (e && e.status === 401) return 'Sessão expirada. Saia e entre novamente.';
    if (e && e.status === 403) return 'Você não tem permissão para esta ação.';
    return (e && e.message) || 'Erro inesperado.';
  }

  function aviso(el, texto, ok) {
    if (!el) return;
    el.textContent = texto || '';
    el.classList.toggle('ok', !!ok);
    el.hidden = !texto;
  }

  function rotuloApto(a) {
    if (!a) return '';
    return a.bloco ? 'Bloco ' + a.bloco + ' · Apto ' + a.numero : 'Apto ' + a.numero;
  }

  function dataCurta(iso) { return new Date(iso).toLocaleDateString('pt-BR'); }
  function horaCurta(iso) { return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function dataHora(iso) { return dataCurta(iso) + ' ' + horaCurta(iso); }
  function hojeLocal() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function selo(status) {
    var st = status.statusEfetivo || status.status || status;
    return '<span class="badge ' + (STATUS_TIPO[st] || 'off') + '">' + esc(STATUS_TXT[st] || st) + '</span>';
  }

  // ---------------------------------------------------------------------------
  // QR Code (biblioteca local: js/vendor/qrcode-generator.js)
  // ---------------------------------------------------------------------------

  function qrDataUrl(texto, celula) {
    var q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    return q.createDataURL(celula || 5, 3);
  }

  function mensagemWhats(v, tok) {
    return [
      'Sua visita está autorizada.',
      'Visitante: ' + v.visitante.nome,
      'Apartamento: ' + rotuloApto(v.apartamento),
      'Data: ' + dataCurta(v.validoDe) + ' das ' + horaCurta(v.validoDe) + ' às ' + horaCurta(v.validoAte),
      '',
      'Código de acesso (apresente o QR na portaria):',
      tok
    ].join('\n');
  }

  // Mostra o QR da visita dentro do contêiner informado.
  function mostrarQr(cont, v, tok) {
    qrAtual = { visita: v, token: tok, img: qrDataUrl(tok, 6) };
    var podeCompartilhar = !!(navigator.canShare && navigator.share);
    cont.innerHTML = '<div class="card vis-qr-card">' +
      '<div class="card-head"><h2>QR da visita</h2><p>' + esc(v.visitante.nome) + ' · ' + esc(rotuloApto(v.apartamento)) + '</p></div>' +
      '<img class="vis-qr-img" src="' + qrAtual.img + '" alt="QR code da visita">' +
      '<p class="vis-hint">Válido de ' + dataHora(v.validoDe) + ' até ' + dataHora(v.validoAte) + '. Uso único.</p>' +
      '<div class="vis-actions">' +
      '<button type="button" class="btn success lg" data-op="whats">Enviar por WhatsApp</button>' +
      (podeCompartilhar ? '<button type="button" class="btn ghost lg" data-op="compartilhar">Compartilhar imagem</button>' : '') +
      '<button type="button" class="btn ghost lg" data-op="baixar">Baixar imagem</button>' +
      '</div></div>';
    cont.hidden = false;
    cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function acaoQr(op) {
    if (!qrAtual) return;
    var v = qrAtual.visita;
    if (op === 'whats') {
      window.open('https://wa.me/?text=' + encodeURIComponent(mensagemWhats(v, qrAtual.token)), '_blank', 'noopener');
    } else if (op === 'baixar') {
      var a = document.createElement('a');
      a.href = qrAtual.img;
      a.download = 'qr-visita-' + v.id.slice(0, 8) + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (op === 'compartilhar') {
      fetch(qrAtual.img).then(function (r) { return r.blob(); }).then(function (blob) {
        var file = new File([blob], 'qr-visita.png', { type: 'image/png' });
        var dados = { files: [file], title: 'QR da visita', text: mensagemWhats(v, qrAtual.token) };
        if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share(dados);
        window.alert('Este aparelho não compartilha imagens. Use "Enviar por WhatsApp" ou "Baixar imagem".');
      }).catch(function () { /* usuário cancelou o compartilhamento */ });
    }
  }

  // ---------------------------------------------------------------------------
  // Nova visita
  // ---------------------------------------------------------------------------

  function carregarCadastros() {
    return Promise.all([pedir('GET', '/visitas/apartamentos'), pedir('GET', '/visitas/visitantes')])
      .then(function (r) {
        cadastros.apartamentos = (r[0] || []).filter(function (a) { return a.ativo; });
        cadastros.visitantes = r[1] || [];
        var opcoes = cadastros.apartamentos.slice().sort(function (a, b) {
          return rotuloApto(a).localeCompare(rotuloApto(b), 'pt-BR', { numeric: true });
        });
        $('#visVtApto').innerHTML = '<option value="">Selecione…</option>' + opcoes.map(function (a) {
          return '<option value="' + esc(a.id) + '">' + esc(rotuloApto(a)) + '</option>';
        }).join('');
        $('#visVtVisitante').innerHTML = '<option value="">Novo visitante…</option>' + cadastros.visitantes.map(function (v) {
          return '<option value="' + esc(v.id) + '">' + esc(v.nome) + '</option>';
        }).join('');
        // Filtros do histórico usam os mesmos apartamentos.
        $('#visHistApto').innerHTML = '<option value="">Todos</option>' + opcoes.map(function (a) {
          return '<option value="' + esc(a.id) + '">' + esc(rotuloApto(a)) + '</option>';
        }).join('');
      });
  }

  function carregarMoradoresDoApto() {
    var apto = $('#visVtApto').value;
    var sel = $('#visVtMorador');
    sel.innerHTML = '<option value="">Selecione…</option>';
    if (!apto) return Promise.resolve();
    return pedir('GET', '/visitas/moradores?apartamentoId=' + encodeURIComponent(apto)).then(function (lista) {
      sel.innerHTML = '<option value="">Selecione…</option>' + (lista || []).filter(function (m) { return m.ativo; }).map(function (m) {
        return '<option value="' + esc(m.id) + '">' + esc(m.nome) + (m.pinDefinido ? '' : ' (sem PIN)') + '</option>';
      }).join('');
    });
  }

  function alternarNovoVisitante() {
    var novo = !$('#visVtVisitante').value;
    document.querySelectorAll('[data-novo-visitante]').forEach(function (el) { el.hidden = !novo; });
    $('#visVtNome').required = novo;
  }

  function salvarVisita(ev) {
    ev.preventDefault();
    var msg = $('#visVtAviso');
    var corpo = {
      apartamentoId: $('#visVtApto').value,
      moradorId: $('#visVtMorador').value,
      data: $('#visVtData').value,
      horaInicio: $('#visVtIni').value,
      horaFim: $('#visVtFim').value
    };
    var obs = $('#visVtObs').value.trim();
    if (obs) corpo.obs = obs;
    var idVisitante = $('#visVtVisitante').value;
    if (idVisitante) {
      corpo.visitanteId = idVisitante;
    } else {
      corpo.visitante = { nome: $('#visVtNome').value.trim() };
      var doc = $('#visVtDoc').value.trim();
      if (doc) corpo.visitante.documento = doc;
      if (!corpo.visitante.nome) return aviso(msg, 'Informe o nome do visitante.');
    }
    if (!corpo.apartamentoId || !corpo.moradorId) return aviso(msg, 'Selecione o apartamento e quem autorizou.');
    if (!corpo.data || !corpo.horaInicio || !corpo.horaFim) return aviso(msg, 'Informe data e horário.');

    aviso(msg, 'Salvando…', true);
    pedir('POST', '/visitas', corpo).then(function (r) {
      aviso(msg, 'Visita autorizada. Confira o QR abaixo.', true);
      $('#visVtResultado').hidden = false;
      mostrarQr($('#visVtResultado'), r.visita, r.qrToken);
      $('#visVtForm').reset();
      $('#visVtData').value = hojeLocal();
      alternarNovoVisitante();
      $('#visVtMorador').innerHTML = '<option value="">Selecione…</option>';
      return carregarCadastros();
    }).catch(function (e) { aviso(msg, msgErro(e)); });
  }

  function prepararNovaVisita() {
    if (!$('#visVtData').value) $('#visVtData').value = hojeLocal();
    carregarCadastros().catch(function (e) { aviso($('#visVtAviso'), msgErro(e)); });
  }

  // ---------------------------------------------------------------------------
  // Listas de visitas com ações (histórico, dentro agora, pendências)
  // ---------------------------------------------------------------------------

  function botoesAcao(v) {
    var b = '';
    var st = v.statusEfetivo || v.status;
    if (st === 'EM_VISITA') b += '<button type="button" class="btn primary sm" data-acao="saida" data-id="' + esc(v.id) + '">Registrar saída</button>';
    if (st === 'AUTORIZADA') b += '<button type="button" class="btn ghost sm" data-acao="reemitir" data-id="' + esc(v.id) + '">Gerar novo QR</button>';
    if (st === 'PENDENTE') b += '<button type="button" class="btn success sm" data-acao="aprovar" data-id="' + esc(v.id) + '">Aprovar e gerar QR</button>';
    if (st === 'PENDENTE' || st === 'AUTORIZADA') b += '<button type="button" class="btn danger sm" data-acao="cancelar" data-id="' + esc(v.id) + '">Cancelar</button>';
    if (ehAdmin()) b += '<button type="button" class="btn danger sm" data-acao="excluir" data-id="' + esc(v.id) + '">Excluir</button>';
    return b;
  }

  function itemVisita(v) {
    var registros = (v.registros || []).map(function (r) {
      return (r.tipo === 'ENTRADA' ? 'Entrada ' : 'Saída ') + dataHora(r.criadoEm);
    }).join(' · ');
    return '<div class="item"><div class="item-main">' +
      '<div class="item-title">' + esc(v.visitante.nome) + '</div>' +
      '<div class="item-sub">' + esc(rotuloApto(v.apartamento)) + ' · autorizado por ' + esc(v.autorizadoPorNome) + '</div>' +
      '<div class="item-meta">' + dataCurta(v.validoDe) + ' · ' + horaCurta(v.validoDe) + ' às ' + horaCurta(v.validoAte) +
      (v.origem === 'PUBLICO' ? ' · solicitação pública' : '') + (registros ? '<br>' + esc(registros) : '') + '</div>' +
      '</div><div class="item-actions">' + selo(v) + botoesAcao(v) + '</div></div>';
  }

  function listaHtml(itens, vazio) {
    if (!itens.length) return '<p class="vis-aviso vis-vazio">' + esc(vazio) + '</p>';
    return itens.map(itemVisita).join('');
  }

  // ---------------------------------------------------------------------------
  // Histórico
  // ---------------------------------------------------------------------------

  function buscarHistorico(pagina) {
    if (pagina) hist.pagina = pagina;
    var q = [];
    var st = $('#visHistStatus').value;
    var apto = $('#visHistApto').value;
    var de = $('#visHistDe').value;
    var ate = $('#visHistAte').value;
    var nome = $('#visHistNome').value.trim();
    if (st) q.push('status=' + encodeURIComponent(st));
    if (apto) q.push('apartamentoId=' + encodeURIComponent(apto));
    if (de) q.push('de=' + encodeURIComponent(de));
    if (ate) q.push('ate=' + encodeURIComponent(ate));
    if (nome) q.push('visitante=' + encodeURIComponent(nome));
    q.push('pagina=' + hist.pagina, 'limite=' + LIMITE);
    return pedir('GET', '/visitas?' + q.join('&')).then(function (r) {
      hist.total = r.total;
      $('#visListaHistorico').innerHTML = listaHtml(r.itens, 'Nenhuma visita encontrada com esses filtros.');
      var paginas = Math.max(1, Math.ceil(r.total / LIMITE));
      $('#visHistTotal').textContent = r.total + (r.total === 1 ? ' visita' : ' visitas') + ' · página ' + hist.pagina + ' de ' + paginas;
      $('#visHistAnt').disabled = hist.pagina <= 1;
      $('#visHistProx').disabled = hist.pagina >= paginas;
    }).catch(function (e) {
      $('#visListaHistorico').innerHTML = '<p class="vis-aviso">' + esc(msgErro(e)) + '</p>';
    });
  }

  function prepararHistorico() {
    if (!$('#visHistApto').options.length) carregarCadastros().catch(function () { });
    buscarHistorico(1);
  }

  // ---------------------------------------------------------------------------
  // Leitor (câmera + digitação manual) e "Dentro agora"
  // ---------------------------------------------------------------------------

  function estadoLeitor(texto) { $('#visLeitorEstado').textContent = texto; }

  function mostrarResultadoLeitura(html) {
    var cont = $('#visLeitorResultado');
    cont.innerHTML = html;
    cont.hidden = false;
    cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function validarCodigo(codigo) {
    codigo = String(codigo || '').trim();
    if (!codigo) return;
    pausarLeitura(true);
    mostrarResultadoLeitura('<div class="card vis-resultado"><p>Validando…</p></div>');
    pedir('POST', '/visitas/qr/validar', { token: codigo }).then(function (r) {
      var v = r.visita;
      mostrarResultadoLeitura(
        '<div class="card vis-resultado ok"><h2>Entrada registrada</h2>' +
        '<p><strong>' + esc(v.visitante.nome) + '</strong><br>' + esc(rotuloApto(v.apartamento)) +
        ' · autorizado por ' + esc(v.autorizadoPorNome) + '</p>' +
        '<div class="vis-actions"><button type="button" class="btn primary lg" data-acao="saida" data-id="' + esc(v.id) + '">Registrar saída</button>' +
        '<button type="button" class="btn ghost lg" data-op="ler-outro">Ler outro QR</button></div></div>'
      );
      $('#visLeitorTexto').value = '';
      carregarDentro();
    }).catch(function (e) {
      if (e.status === 422) {
        mostrarResultadoLeitura(
          '<div class="card vis-resultado erro"><h2>Acesso negado</h2><p><strong>' +
          esc(MOTIVO_TXT[e.motivo] || 'QR não aceito') + '</strong><br>' + esc(e.message) + '</p>' +
          '<button type="button" class="btn ghost lg" data-op="ler-outro">Ler outro QR</button></div>'
        );
      } else {
        mostrarResultadoLeitura('<div class="card vis-resultado erro"><p>' + esc(msgErro(e)) + '</p>' +
          '<button type="button" class="btn ghost lg" data-op="ler-outro">Tentar de novo</button></div>');
      }
    });
  }

  function pausarLeitura(pausa) {
    camera.pausado = pausa;
  }

  function ligarCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      estadoLeitor('Câmera indisponível neste navegador. Use a digitação manual.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(function (stream) {
        camera.stream = stream;
        var v = $('#visLeitorVideo');
        v.srcObject = stream;
        v.hidden = false;
        return v.play();
      })
      .then(function () {
        if ('BarcodeDetector' in window) {
          try { camera.detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { camera.detector = null; }
        }
        pausarLeitura(false);
        $('#visLeitorLigar').hidden = true;
        $('#visLeitorDesligar').hidden = false;
        estadoLeitor('Aponte a câmera para o QR.');
        camera.timer = setInterval(varrer, 250);
      })
      .catch(function (e) {
        estadoLeitor('Não foi possível usar a câmera (' + (e && e.name ? e.name : 'erro') + '). Use a digitação manual.');
      });
  }

  function varrer() {
    var v = $('#visLeitorVideo');
    if (!camera.stream || camera.pausado || camera.lendo || v.readyState < 2) return;
    if (camera.detector) {
      camera.lendo = true;
      camera.detector.detect(v).then(function (codigos) {
        if (codigos.length && !camera.pausado) validarCodigo(codigos[0].rawValue);
      }).catch(function () { }).then(function () { camera.lendo = false; });
      return;
    }
    if (typeof jsQR !== 'function') return;
    var w = Math.min(640, v.videoWidth);
    var h = Math.round(v.videoHeight * w / v.videoWidth);
    var c = $('#visLeitorCanvas');
    c.width = w;
    c.height = h;
    var ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, w, h);
    var img = ctx.getImageData(0, 0, w, h);
    var r = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    if (r && r.data) validarCodigo(r.data);
  }

  function desligarCamera() {
    if (camera.timer) clearInterval(camera.timer);
    camera.timer = null;
    if (camera.stream) camera.stream.getTracks().forEach(function (t) { t.stop(); });
    camera.stream = null;
    camera.lendo = false;
    var v = $('#visLeitorVideo');
    v.srcObject = null;
    v.hidden = true;
    $('#visLeitorLigar').hidden = false;
    $('#visLeitorDesligar').hidden = true;
    estadoLeitor('Câmera desligada.');
  }

  function carregarDentro() {
    return pedir('GET', '/visitas?status=EM_VISITA&limite=100').then(function (r) {
      $('#visDentroContagem').textContent = r.total + (r.total === 1 ? ' pessoa' : ' pessoas') + ' dentro';
      $('#visListaDentro').innerHTML = listaHtml(r.itens, 'Ninguém dentro no momento.');
    }).catch(function (e) {
      $('#visListaDentro').innerHTML = '<p class="vis-aviso">' + esc(msgErro(e)) + '</p>';
    });
  }

  function prepararLeitor() {
    carregarDentro();
  }

  // ---------------------------------------------------------------------------
  // Pendências (fase 2): solicitações públicas aguardando aprovação
  // ---------------------------------------------------------------------------

  function carregarPendencias() {
    return pedir('GET', '/visitas?status=PENDENTE&limite=100').then(function (r) {
      $('#visListaPendencias').innerHTML = listaHtml(r.itens, 'Nenhuma solicitação pendente.');
    }).catch(function (e) {
      $('#visListaPendencias').innerHTML = '<p class="vis-aviso">' + esc(msgErro(e)) + '</p>';
    });
  }

  // ---------------------------------------------------------------------------
  // QR fixo da portaria (ADMIN): aponta para a página pública
  // ---------------------------------------------------------------------------

  function tenantDoToken() {
    try {
      var p = token().split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(p)).tenantId || null;
    } catch (e) { return null; }
  }

  function gerarQrFixo() {
    var tenant = tenantDoToken();
    if (!tenant) { window.alert('Não foi possível identificar o condomínio. Saia e entre novamente.'); return; }
    var url = window.location.origin + '/visita.html?t=' + encodeURIComponent(tenant);
    $('#visQrFixoImg').src = qrDataUrl(url, 10);
    $('#visQrFixoUrl').textContent = url;
    $('#visQrFixoArea').hidden = false;
    $('#visQrFixoImprimir').hidden = false;
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  function acaoLista(ev) {
    var btn = ev.target.closest('[data-acao]');
    if (!btn) return;
    var acao = btn.getAttribute('data-acao');
    var id = btn.getAttribute('data-id');
    var confirmar = {
      cancelar: 'Cancelar esta visita? O QR deixará de funcionar.',
      excluir: 'Excluir esta visita e o histórico dela? Esta ação não pode ser desfeita.'
    }[acao];
    if (confirmar && !window.confirm(confirmar)) return;

    var req;
    if (acao === 'saida') req = pedir('POST', '/visitas/' + encodeURIComponent(id) + '/saida');
    else if (acao === 'cancelar') req = pedir('POST', '/visitas/' + encodeURIComponent(id) + '/cancelar');
    else if (acao === 'excluir') req = pedir('DELETE', '/visitas/' + encodeURIComponent(id));
    else if (acao === 'reemitir') req = pedir('POST', '/visitas/' + encodeURIComponent(id) + '/qr');
    else if (acao === 'aprovar') req = pedir('POST', '/visitas/' + encodeURIComponent(id) + '/aprovar');
    else return;

    req.then(function (r) {
      if ((acao === 'reemitir' || acao === 'aprovar') && r && r.qrToken) {
        mostrarQr(acao === 'aprovar' ? $('#visPendResultado') : $('#visHistResultado'), r.visita, r.qrToken);
      }
      if (acao === 'aprovar') carregarPendencias();
      else if (acao === 'saida') {
        if (document.querySelector('#visPainelLeitor:not([hidden])')) carregarDentro();
        else buscarHistorico();
      } else buscarHistorico();
    }).catch(function (e) {
      window.alert(msgErro(e));
    });
  }

  function acaoQrOuLeitor(ev) {
    var op = ev.target.closest('[data-op]');
    if (!op) return;
    var nome = op.getAttribute('data-op');
    if (nome === 'ler-outro') { $('#visLeitorResultado').hidden = true; pausarLeitura(false); estadoLeitor('Aponte a câmera para o QR.'); return; }
    acaoQr(nome);
  }

  function iniciar() {
    if (!$('#tab-visitas')) return;

    $('#visVtApto').addEventListener('change', carregarMoradoresDoApto);
    $('#visVtVisitante').addEventListener('change', alternarNovoVisitante);
    $('#visVtForm').addEventListener('submit', salvarVisita);
    alternarNovoVisitante();

    $('#visLeitorLigar').addEventListener('click', ligarCamera);
    $('#visLeitorDesligar').addEventListener('click', desligarCamera);
    $('#visLeitorManual').addEventListener('submit', function (ev) {
      ev.preventDefault();
      validarCodigo($('#visLeitorTexto').value);
    });

    $('#visHistFiltros').addEventListener('submit', function (ev) { ev.preventDefault(); buscarHistorico(1); });
    $('#visHistAnt').addEventListener('click', function () { if (hist.pagina > 1) buscarHistorico(hist.pagina - 1); });
    $('#visHistProx').addEventListener('click', function () { buscarHistorico(hist.pagina + 1); });

    $('#visQrFixoGerar').addEventListener('click', gerarQrFixo);
    $('#visQrFixoImprimir').addEventListener('click', function () { window.print(); });

    ['#visListaHistorico', '#visListaDentro', '#visListaPendencias'].forEach(function (sel) {
      $(sel).addEventListener('click', acaoLista);
    });
    function clicouResultado(ev) {
      if (ev.target.closest('[data-acao]')) acaoLista(ev);
      else acaoQrOuLeitor(ev);
    }
    ['#visHistResultado', '#visPendResultado', '#visVtResultado', '#visLeitorResultado'].forEach(function (sel) {
      $(sel).addEventListener('click', clicouResultado);
    });

    // Troca de sub-aba (disparado por js/visitas.js).
    document.addEventListener('vis:sub', function (ev) {
      var nome = ev.detail;
      if (nome !== 'leitor') desligarCamera();
      if (nome === 'visitas') prepararNovaVisita();
      else if (nome === 'leitor') prepararLeitor();
      else if (nome === 'historico') prepararHistorico();
      else if (nome === 'pendencias') carregarPendencias();
      else if (nome === 'qrfixo') { /* gerado sob demanda */ }
    });
  }

  iniciar();
})();
