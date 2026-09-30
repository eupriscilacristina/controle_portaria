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

async function apiLogin(email, senha) {
    var res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, senha: senha }),
    });
    if (!res.ok) throw new Error('Login inválido');
    var data = await res.json();
    setToken(data.token);
    return data.user;
}

async function apiFetch(path, options) {
    options = options || {};
    options.headers = Object.assign(
        { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
        options.headers || {}
    );
    var res = await fetch(API_BASE + path, options);
    if (!res.ok) throw new Error('Erro na API: ' + res.status);
    if (res.status === 204) return null;
    return res.json();
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
function apiDelete(path) {
    return apiFetch(path, { method: 'DELETE' });
}