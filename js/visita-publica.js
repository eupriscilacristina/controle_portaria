// Página pública de solicitação de visita (fase 2). Aberta pelo QR fixo da
// portaria: visita.html?t=<id do condomínio>. Não usa login nem o app.
(function () {
  'use strict';

  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var PIN_RE = /^\d{6}$/;

  function $(s) { return document.querySelector(s); }

  function aviso(texto, ok) {
    var el = $('#pubAviso');
    el.textContent = texto || '';
    el.classList.toggle('ok', !!ok);
    el.hidden = !texto;
  }

  function hojeLocal() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  var tenant = new URLSearchParams(window.location.search).get('t') || '';

  if (!UUID_RE.test(tenant)) {
    aviso('Link inválido. Use o QR code fixado na portaria.');
    $('#pubEnviar').disabled = true;
    return;
  }

  $('#pubData').min = hojeLocal();
  $('#pubData').value = hojeLocal();

  $('#pubForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var pin = $('#pubPin').value.trim();
    if (!PIN_RE.test(pin)) { aviso('O PIN deve ter exatamente 6 dígitos.'); return; }

    var corpo = {
      apartamento: $('#pubApto').value.trim(),
      pin: pin,
      visitante: { nome: $('#pubNome').value.trim() },
      data: $('#pubData').value,
      horaInicio: $('#pubIni').value,
      horaFim: $('#pubFim').value
    };
    var bloco = $('#pubBloco').value.trim();
    if (bloco) corpo.bloco = bloco;
    var doc = $('#pubDoc').value.trim();
    if (doc) corpo.visitante.documento = doc;
    var obs = $('#pubObs').value.trim();
    if (obs) corpo.obs = obs;

    var botao = $('#pubEnviar');
    botao.disabled = true;
    aviso('Enviando…', true);

    fetch('/api/visitas-publico/' + encodeURIComponent(tenant) + '/solicitacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo)
    }).then(function (res) {
      return res.text().then(function (txt) {
        var body = null;
        try { body = JSON.parse(txt); } catch (e) { body = null; }
        return { status: res.status, body: body };
      });
    }).then(function (r) {
      if (r.status === 201) {
        $('#pubCard').hidden = true;
        $('#pubSucesso').hidden = false;
        $('#pubProtocolo').textContent = 'Protocolo: ' + r.body.id.slice(0, 8).toUpperCase();
        window.scrollTo(0, 0);
        return;
      }
      // A API já devolve mensagens prontas para o morador (ex.: bloqueio por tentativas).
      $('#pubPin').value = '';
      if (r.status === 401) aviso('Apartamento ou PIN inválidos.');
      else if (r.status === 429) aviso((r.body && r.body.error) || 'Muitas tentativas. Tente mais tarde.');
      else if (r.status === 404) aviso('Condomínio não encontrado. Verifique o QR da portaria.');
      else aviso((r.body && r.body.error) || 'Não foi possível enviar. Tente novamente.');
      botao.disabled = false;
    }).catch(function () {
      aviso('Sem conexão com o servidor. Tente novamente.');
      botao.disabled = false;
    });
  });
})();
