(function() {
  'use strict';

  var content = document.getElementById('devContent');
  var btnVoltar = document.getElementById('btnVoltar');

  function getToken() { return localStorage.getItem('prodvision_token'); }
  function getRole() { return localStorage.getItem('prodvision_role'); }

  function apiFetch(url, options) {
    var t = getToken();
    var opts = options || {};
    opts.headers = opts.headers || {};
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    return fetch(url, opts);
  }

  async function checkAuth() {
    var role = getRole();
    if (role !== 'dev') { window.location.href = 'index.html'; return false; }
    var t = getToken();
    if (!t) { window.location.href = 'index.html'; return false; }
    try {
      var res = await fetch('/api/check', { headers: { 'Authorization': 'Bearer ' + t } });
      var data = await res.json();
      if (!data.autenticado || data.role !== 'dev') { window.location.href = 'index.html'; return false; }
      return true;
    } catch { window.location.href = 'index.html'; return false; }
  }

  function esc(t) {
    if (typeof t !== 'string') return '';
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function tempoStr(segundos) {
    var h = Math.floor(segundos / 3600);
    var m = Math.floor((segundos % 3600) / 60);
    var s = Math.floor(segundos % 60);
    return h + 'h ' + m + 'm ' + s + 's';
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async function renderizar() {
    var html = '';

    try {
      var infoRes = await apiFetch('/api/dev/info');
      var info = infoRes.ok ? await infoRes.json() : null;

      if (info) {
        html += '<div class="card" style="margin-bottom:16px">';
        html += '  <h3 style="font-size:14px;margin-bottom:12px;color:var(--primary)">Sistema</h3>';
        html += '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">';
        html += '    <div style="color:var(--text3)">Node.js</div><div style="font-weight:600">' + esc(info.nodeVersion) + '</div>';
        html += '    <div style="color:var(--text3)">Plataforma</div><div style="font-weight:600">' + esc(info.platform) + '</div>';
        html += '    <div style="color:var(--text3)">Uptime</div><div style="font-weight:600">' + tempoStr(info.uptime) + '</div>';
        html += '    <div style="color:var(--text3)">Banco</div><div style="font-weight:600">' + formatBytes(info.dbSize) + '</div>';
        html += '    <div style="color:var(--text3)">Usuários</div><div style="font-weight:600">' + info.usuarios + '</div>';
        html += '    <div style="color:var(--text3)">Máquinas</div><div style="font-weight:600">' + info.maquinas + '</div>';
        html += '    <div style="color:var(--text3)">Eventos</div><div style="font-weight:600">' + info.eventos + '</div>';
        html += '    <div style="color:var(--text3)">Relatórios</div><div style="font-weight:600">' + info.timeline + '</div>';
        html += '  </div>';
        html += '</div>';
      }
    } catch (e) {}

    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <h3 style="font-size:14px;margin-bottom:12px;color:var(--primary)">Código Fonte</h3>';
    html += '  <p style="font-size:13px;color:var(--text2);margin-bottom:10px">Repositório no GitHub:</p>';
    html += '  <a href="https://github.com/matiasnetsec/prodvision" target="_blank" class="btn-salvar" style="display:inline-block;text-decoration:none;font-size:13px;padding:10px 20px">Abrir GitHub</a>';
    html += '</div>';

    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <h3 style="font-size:14px;margin-bottom:12px;color:var(--primary)">Banco de Dados</h3>';
    html += '  <p style="font-size:13px;color:var(--text2)">Arquivo: <code style="background:var(--bg2);padding:2px 8px;border-radius:4px;font-size:12px">prodvision.db</code></p>';
    html += '  <p style="font-size:13px;color:var(--text2);margin-top:4px">Engine: SQLite (better-sqlite3)</p>';
    html += '</div>';

    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <h3 style="font-size:14px;margin-bottom:12px;color:var(--primary)">Logs de Acesso</h3>';
    html += '  <div id="loginLogs"></div>';
    html += '</div>';

    content.innerHTML = html;

    try {
      var logsRes = await apiFetch('/api/dev/logs');
      if (logsRes.ok) {
        var logs = await logsRes.json();
        var logContainer = document.getElementById('loginLogs');
        var logHtml = '';
        if (logs.length === 0) {
          logHtml = '<div style="font-size:13px;color:var(--text3)">Nenhum login registrado</div>';
        } else {
          logHtml = '<div style="display:flex;flex-direction:column;gap:6px">';
          logs.forEach(function(log) {
            var data = new Date(log.criadoEm).toLocaleString('pt-BR');
            var roleLabel = { dev: 'Desenvolvedor', admin: 'Administrador', user: 'Usuário' };
            logHtml += '<div class="log-item">';
            logHtml += '  <div class="log-item-header">';
            logHtml += '    <span class="log-item-maq">' + esc(log.username) + '</span>';
            logHtml += '    <span style="font-size:10px;color:var(--text3)">' + (roleLabel[log.role] || log.role) + '</span>';
            logHtml += '  </div>';
            logHtml += '  <div class="log-item-time">' + esc(data) + ' — IP: ' + esc(log.ip) + '</div>';
            logHtml += '</div>';
          });
          logHtml += '</div>';
        }
        logContainer.innerHTML = logHtml;
      }
    } catch (e) {
      document.getElementById('loginLogs').innerHTML = '<div style="font-size:13px;color:var(--danger)">Erro ao carregar logs</div>';
    }
  }

  btnVoltar.addEventListener('click', function() {
    window.location.href = 'index.html';
  });

  (async function() {
    var ok = await checkAuth();
    if (ok) renderizar();
  })();
})();
