// offline.js — fila offline (IndexedDB) de entrada/saída de Acesso, cache de
// listas para leitura sem internet e sincronização automática.
//
// Na fila ficam só os campos mínimos: id do acesso (UUID gerado no aparelho),
// id da pessoa e horários. Nome/CPF nunca entram na fila; o servidor os busca
// no cadastro ao sincronizar. O cache de listas guarda os dados sem CPF.

(function () {
  'use strict';

  var DB_NAME = 'eugestao_offline';
  var DB_VERSION = 1;
  var LIMITE_OFFLINE_MS = 24 * 60 * 60 * 1000;
  var ONLINE_KEY = 'eugestao_last_online';
  var BACKOFF_BASE_MS = 5000;
  var BACKOFF_MAX_MS = 5 * 60 * 1000;
  var CAMPOS_PESSOA_NO_CACHE_SEM = ['cpf', 'fotoPlaca', 'fotoDocumento'];

  var dbPromise = null;
  var sincronizando = false;
  var ouvintes = { mudanca: [], login: [] };

  function abrir() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('fila')) {
          db.createObjectStore('fila', { keyPath: 'qid', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'chave' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  function tx(store, modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, modo);
        var out = fn(t.objectStore(store));
        t.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : undefined); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function emitir(tipo, arg) {
    ouvintes[tipo].forEach(function (fn) {
      try { fn(arg); } catch (e) { console.error(e); }
    });
  }

  // ---- UUID -------------------------------------------------------------

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ---- Janela de 24 h offline e validade do JWT -------------------------

  function marcarOnline() {
    try { localStorage.setItem(ONLINE_KEY, String(Date.now())); } catch (e) { }
  }

  function ultimoOnline() {
    try { return Number(localStorage.getItem(ONLINE_KEY)) || 0; } catch (e) { return 0; }
  }

  // true quando passou de 24 h desde o último contato com o servidor.
  function limiteExcedido() {
    var t = ultimoOnline();
    return !t || (Date.now() - t) > LIMITE_OFFLINE_MS;
  }

  function jwtExpirado(token) {
    try {
      var p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !p.exp || p.exp * 1000 <= Date.now();
    } catch (e) {
      return true;
    }
  }

  // ---- Fila -------------------------------------------------------------

  function listar() {
    return tx('fila', 'readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; });
  }

  function enfileirar(item) {
    item.criadoEm = new Date().toISOString();
    item.tentativas = 0;
    item.proximaTentativa = 0;
    return tx('fila', 'readwrite', function (s) { return s.add(item); }).then(function () {
      emitir('mudanca');
    });
  }

  function gravar(item) {
    return tx('fila', 'readwrite', function (s) { return s.put(item); });
  }

  function remover(qid) {
    return tx('fila', 'readwrite', function (s) { return s.delete(qid); });
  }

  function descartarRejeitados() {
    return listar().then(function (itens) {
      return Promise.all(itens.filter(function (i) { return i.rejeitado; }).map(function (i) {
        return remover(i.qid);
      }));
    }).then(function () { emitir('mudanca'); });
  }

  // ---- Cache de listas (leitura offline) --------------------------------

  function semDadosSensiveis(coll, lista) {
    if (!Array.isArray(lista)) return [];
    return lista.map(function (o) {
      var c = {};
      Object.keys(o).forEach(function (k) {
        if (CAMPOS_PESSOA_NO_CACHE_SEM.indexOf(k) < 0) c[k] = o[k];
      });
      return c;
    });
  }

  function salvarCache(coll, lista) {
    return tx('cache', 'readwrite', function (s) {
      return s.put({ chave: coll, dados: semDadosSensiveis(coll, lista), em: Date.now() });
    }).catch(function () { });
  }

  function lerCache(coll) {
    return tx('cache', 'readonly', function (s) { return s.get(coll); }).then(function (r) {
      return r ? r.dados : null;
    }).catch(function () { return null; });
  }

  function limparDados() {
    return tx('cache', 'readwrite', function (s) { return s.clear(); }).catch(function () { });
  }

  // Logout: apaga fila, cache, o próprio banco e o marcador de conexão.
  function limparTudo() {
    try { localStorage.removeItem(ONLINE_KEY); } catch (e) { }
    var feito = abrir().then(function (db) {
      db.close();
    }).catch(function () { }).then(function () {
      dbPromise = null;
      return new Promise(function (resolve) {
        if (!window.indexedDB) { resolve(); return; }
        var r = indexedDB.deleteDatabase(DB_NAME);
        r.onsuccess = r.onerror = r.onblocked = function () { resolve(); };
      });
    });
    var caches_ = (window.caches && caches.keys) ? caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k.indexOf('eugestao-dados') === 0; })
        .map(function (k) { return caches.delete(k); }));
    }).catch(function () { }) : Promise.resolve();
    return Promise.all([feito, caches_]).then(function () { emitir('mudanca'); });
  }

  // ---- Sincronização ----------------------------------------------------

  function cabecalhos(item) {
    return {
      'X-Offline-Queue': '1',
      'X-Offline-Created-At': item.criadoEm,
      'X-Offline-User': item.userId || ''
    };
  }

  function permanente(e) {
    var st = e && e.status;
    return !!st && st >= 400 && st < 500 && st !== 401 && st !== 408 && st !== 429;
  }

  function enviar(item) {
    var h = cabecalhos(item);
    if (item.op === 'add') {
      return apiFetch('/acessos', {
        method: 'POST',
        headers: h,
        body: JSON.stringify(Object.assign({ id: item.id }, item.body))
      });
    }
    return apiFetch('/acessos/' + encodeURIComponent(item.id), {
      method: 'PUT',
      headers: h,
      body: JSON.stringify(item.body)
    });
  }

  function rodarSincronizacao() {
    if (!navigator.onLine) return Promise.resolve();
    var token = getToken();
    return listar().then(function (itens) {
      itens = itens.filter(function (i) { return !i.rejeitado; });
      if (!itens.length) return;
      if (!token || jwtExpirado(token)) { emitir('login'); return; }
      var agora = Date.now();
      var falhouIds = {};
      var seq = Promise.resolve();
      var parou = false;
      itens.forEach(function (item) {
        seq = seq.then(function () {
          if (parou) return;
          if (falhouIds[item.id]) { // entrada rejeitada: a saída dependente também
            item.rejeitado = true;
            item.erro = 'Entrada correspondente foi rejeitada';
            return gravar(item);
          }
          if (item.proximaTentativa > agora) { parou = true; return; }
          return enviar(item).then(function () {
            marcarOnline();
            return remover(item.qid);
          }).catch(function (e) {
            if (e && e.status === 401) { parou = true; emitir('login'); return; }
            if (permanente(e)) {
              item.rejeitado = true;
              item.erro = (e.mensagem || ('Erro ' + e.status)).slice(0, 200);
              if (item.op === 'add') falhouIds[item.id] = true;
              return gravar(item);
            }
            // Rede, 5xx ou 429: tenta de novo mais tarde, mantendo a ordem.
            item.tentativas = (item.tentativas || 0) + 1;
            item.proximaTentativa = Date.now() + Math.min(BACKOFF_BASE_MS * Math.pow(2, item.tentativas - 1), BACKOFF_MAX_MS);
            parou = true;
            return gravar(item);
          });
        });
      });
      return seq;
    });
  }

  function sincronizar() {
    if (sincronizando) return Promise.resolve();
    sincronizando = true;
    var run = function () { return rodarSincronizacao(); };
    var p = (navigator.locks && navigator.locks.request)
      ? navigator.locks.request('eugestao-sync', run) // evita duas abas enviando juntas
      : run();
    return Promise.resolve(p).catch(function (e) {
      console.error('Falha na sincronização', e);
    }).then(function () {
      sincronizando = false;
      emitir('mudanca');
    });
  }

  function resumo() {
    return listar().then(function (itens) {
      var rej = itens.filter(function (i) { return i.rejeitado; });
      return { itens: itens, pendentes: itens.length - rej.length, rejeitados: rej.length, erros: rej };
    }).catch(function () {
      return { itens: [], pendentes: 0, rejeitados: 0, erros: [] };
    });
  }

  window.addEventListener('online', function () { sincronizar(); });

  // Reavalia pendências com backoff vencido.
  setInterval(function () {
    if (navigator.onLine && getToken()) sincronizar();
  }, 30000);

  window.Offline = {
    uuid: uuid,
    enfileirar: enfileirar,
    listar: listar,
    resumo: resumo,
    sincronizar: sincronizar,
    descartarRejeitados: descartarRejeitados,
    salvarCache: salvarCache,
    lerCache: lerCache,
    limparDados: limparDados,
    limparTudo: limparTudo,
    marcarOnline: marcarOnline,
    limiteExcedido: limiteExcedido,
    jwtExpirado: jwtExpirado,
    onMudanca: function (fn) { ouvintes.mudanca.push(fn); },
    onLoginNecessario: function (fn) { ouvintes.login.push(fn); }
  };
})();
