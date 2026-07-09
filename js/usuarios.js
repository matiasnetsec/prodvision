(function() {
  'use strict';

  var container = document.getElementById('usuariosContainer');
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
    if (role !== 'dev' && role !== 'admin') { window.location.href = 'index.html'; return false; }
    var t = getToken();
    if (!t) { window.location.href = 'index.html'; return false; }
    try {
      var res = await fetch('/api/check', { headers: { 'Authorization': 'Bearer ' + t } });
      var data = await res.json();
      if (!data.autenticado || (data.role !== 'dev' && data.role !== 'admin')) { window.location.href = 'index.html'; return false; }
      return data.role;
    } catch { window.location.href = 'index.html'; return false; }
  }

  function esc(t) {
    if (typeof t !== 'string') return '';
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  async function carregarUsuarios() {
    try {
      var res = await apiFetch('/api/usuarios');
      if (res.ok) return await res.json();
      return [];
    } catch { return []; }
  }

  async function criarUsuario(username, senha, role) {
    var res = await apiFetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, senha, role })
    });
    return res.ok ? await res.json() : null;
  }

  async function deletarUsuario(id) {
    var res = await apiFetch('/api/usuarios/' + id, { method: 'DELETE' });
    return res.ok;
  }

  async function alterarSenha(id, senha) {
    var res = await apiFetch('/api/usuarios/' + id + '/password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });
    return res.ok;
  }

  var labels = { dev: 'Desenvolvedor', admin: 'Administrador', user: 'Usuário' };

  function renderizar(usuarios, userRole) {
    var html = '';

    html += '<div class="card" style="margin-bottom:16px">';
    html += '  <h3 style="font-size:14px;margin-bottom:12px;color:var(--primary)">Novo Usuário</h3>';
    html += '  <div style="display:flex;flex-direction:column;gap:8px">';
    html += '    <input type="text" id="novoUsername" class="log-input" placeholder="Nome de usuário">';
    html += '    <input type="password" id="novoSenha" class="log-input" placeholder="Senha">';
    html += '    <select id="novoRole" class="log-input">';
    html += '      <option value="user">Usuário</option>';
    html += '      <option value="admin">Administrador</option>';
    if (userRole === 'dev') {
      html += '      <option value="dev">Desenvolvedor</option>';
    }
    html += '    </select>';
    html += '    <button id="btnCriarUsuario" class="btn-salvar" style="text-align:center;padding:10px">Criar Usuário</button>';
    html += '    <p id="usuarioMsg" class="login-error" style="min-height:0"></p>';
    html += '  </div>';
    html += '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    usuarios.forEach(function(u) {
      html += '<div class="card-list" style="padding:12px 14px">';
      html += '  <div class="list-row" style="flex-wrap:wrap">';
      html += '    <div style="flex:1;min-width:120px">';
      html += '      <div style="font-weight:700;font-size:14px">' + esc(u.username) + '</div>';
      html += '      <div style="font-size:11px;color:var(--text3)">' + (labels[u.role] || u.role) + '</div>';
      html += '    </div>';
      html += '    <div style="display:flex;gap:4px;align-items:center">';
      html += '      <button class="btn-alterar-senha" data-id="' + u.id + '" style="font-size:11px;padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text2);cursor:pointer;font-family:inherit">Alterar Senha</button>';
      if (u.role !== 'dev') {
        html += '      <button class="btn-delete" data-id="' + u.id + '" title="Remover">';
        html += '        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        html += '      </button>';
      }
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;

    document.getElementById('btnCriarUsuario').addEventListener('click', async function() {
      var username = document.getElementById('novoUsername').value.trim();
      var senha = document.getElementById('novoSenha').value;
      var role = document.getElementById('novoRole').value;
      var msg = document.getElementById('usuarioMsg');
      if (!username || !senha) { msg.textContent = 'Preencha todos os campos'; return; }
      var result = await criarUsuario(username, senha, role);
      if (result) {
        document.getElementById('novoUsername').value = '';
        document.getElementById('novoSenha').value = '';
        msg.textContent = '';
        renderizar(result, userRole);
      } else {
        msg.textContent = 'Erro ao criar usuário';
      }
    });

    container.querySelectorAll('.btn-delete').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (confirm('Remover este usuário?')) {
          if (await deletarUsuario(this.dataset.id)) {
            var usuarios = await carregarUsuarios();
            renderizar(usuarios, userRole);
          }
        }
      });
    });

    container.querySelectorAll('.btn-alterar-senha').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var userId = this.dataset.id;
        var senhaAtual = prompt('Nova senha para o usuário:');
        if (senhaAtual && senhaAtual.length > 0) {
          alterarSenha(userId, senhaAtual);
        }
      });
    });
  }

  btnVoltar.addEventListener('click', function() {
    window.location.href = 'index.html';
  });

  (async function() {
    var userRole = await checkAuth();
    if (userRole) {
      var usuarios = await carregarUsuarios();
      renderizar(usuarios, userRole);
    }
  })();
})();
