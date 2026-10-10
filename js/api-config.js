// api-config.js — camada de conexão com a API própria (substitui o Firestore)
// O firebase-config.js original continua no projeto, sem uso.

const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('eugestao_token');
}
function setToken(t) {
    localStorage.setItem('eugestao_token', t);
}
function clearToken() {
    localStorage.removeItem('eugestao_token');
}

async function apiPing() {
    try {
        var res = await fetch('/health');
        return res.ok;
    } catch (e) {
        return false;
    }
}

// Erro com status HTTP e a mensagem vinda da API (campo "error"),
// sem nunca incluir senhas no texto do erro.
function erroDeResposta(res, corpo) {
    var detalhe = '';
    if (corpo && typeof corpo === 'object') {
        detalhe = String(corpo.error || corpo.message || corpo.mensagem || '');
    }
    var e = new Error('Erro na API: ' + res.status);
    e.status = res.status;
    e.mensagem = detalhe;
    return e;
}

async function corpoDaResposta(res) {
    try {
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function apiLogin(login, senha) {
    var res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login, senha: senha }),
    });
    var corpo = await corpoDaResposta(res);
    if (!res.ok) throw erroDeResposta(res, corpo);
    setToken(corpo.token);
    return corpo;
}

// Troca obrigatória de senha: recebe o novo token e o usuário atualizado.
async function apiTrocarSenha(senhaAtual, novaSenha) {
    var data = await apiFetch('/auth/trocar-senha', {
        method: 'PATCH',
        body: JSON.stringify({ senhaAtual: senhaAtual, novaSenha: novaSenha }),
    });
    if (data && data.token) setToken(data.token);
    return data;
}

async function apiFetch(path, options) {
    options = options || {};
    options.headers = Object.assign(
        { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        options.headers || {}
    );
    var res = await fetch(API_BASE + path, options);
    if (res.status === 204) return null;
    var corpo = await corpoDaResposta(res);
    if (!res.ok) throw erroDeResposta(res, corpo);
    return corpo;
}

function apiGet(path) {
    return apiFetch(path);
}
function apiPost(path, data) {
    return apiFetch(path, { method: 'POST', body: JSON.stringify(data) });
}
function apiPut(path, data) {
    return apiFetch(path, { method: 'PUT', body: JSON.stringify(data) });
}
function apiPatch(path, data) {
    return apiFetch(path, { method: 'PATCH', body: JSON.stringify(data) });
}
function apiDelete(path) {
    return apiFetch(path, { method: 'DELETE' });
}