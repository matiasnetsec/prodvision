(function() {
  'use strict';

  const API = '/api/maquinas';
  let maquinas = [];
  let nomeCount = 0;

  const container = document.getElementById('maquinasContainer');
  const emptyState = document.getElementById('emptyState');
  const fab = document.getElementById('fabAdicionar');
  const btnLimpar = document.getElementById('btnLimpar');
  const btnNavRelatorio = document.getElementById('btnNavRelatorio');
  const btnRelatorio = document.getElementById('btnRelatorio');

  function gerarId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  function criarMaquina(nome) {
    nomeCount++;
    return {
      id: gerarId(),
      nome: nome || 'Nova Máquina ' + nomeCount,
      status: 'parada',
      statusChangedAt: Date.now(),
      velocidadeProgramada: '',
      velocidadeReal: '',
      observacoes: '',
      salva: false,
      tempoRodando: 0,
      tempoParada: 0
    };
  }

  async function carregarMaquinas() {
    try {
      const res = await fetch(API);
      if (res.ok) {
        maquinas = await res.json();
        nomeCount = maquinas.length;
        renderizar();
      }
    } catch (e) {
      maquinas = [];
      nomeCount = 0;
      renderizar();
    }
  }

  async function salvarMaquinaServer(id, dados) {
    try {
      await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
    } catch (e) {
      console.error('Erro ao salvar:', e);
    }
  }

  async function criarMaquinaServer(maq) {
    try {
      await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maq)
      });
      await carregarMaquinas();
    } catch (e) {
      console.error('Erro ao criar:', e);
    }
  }

  async function deletarMaquinaServer(id) {
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        maquinas = await res.json();
        renderizar();
      }
    } catch (e) {
      console.error('Erro ao deletar:', e);
    }
  }

  async function limparMaquinasServer() {
    try {
      const res = await fetch(API, { method: 'DELETE' });
      if (res.ok) {
        maquinas = await res.json();
        renderizar();
      }
    } catch (e) {
      console.error('Erro ao limpar:', e);
    }
  }

  function acumularTempo(maq) {
    var agora = Date.now();
    var elapsed = Math.max(0, agora - (maq.statusChangedAt || agora));
    if (maq.status === 'rodando') {
      maq.tempoRodando = (maq.tempoRodando || 0) + elapsed;
    } else if (maq.status === 'parada') {
      maq.tempoParada = (maq.tempoParada || 0) + elapsed;
    }
  }

  function salvarDraft(index) {
    if (!isNaN(index) && maquinas[index]) {
      maquinas[index].salva = true;
      salvarMaquinaServer(maquinas[index].id, maquinas[index]);
    }
  }

  function esc(t) {
    if (typeof t !== 'string') return '';
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function statusIcon(s) {
    switch (s) {
      case 'rodando': return '&#9654;';
      case 'parada': return '&#9632;';
      case 'setup': return '&#9881;';
      case 'manutencao': return '&#9889;';
      default: return '';
    }
  }

  function renderizar() {
    container.innerHTML = '';

    if (maquinas.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    maquinas.forEach(function(maq, index) {
      if (maq.salva === undefined) maq.salva = true;

      if (maq.salva) {
        var item = document.createElement('div');
        item.className = 'card-list';
        item.dataset.index = index;

        item.innerHTML = `
          <div class="list-row">
            <input type="text" class="machine-name" value="${esc(maq.nome)}" placeholder="Nome" maxlength="50" data-index="${index}">
            <div class="status-compact">
              <button class="status-btn-sm ${maq.status === 'rodando' ? 'active-rodando' : ''}" data-status="rodando" data-index="${index}" title="Rodando">&#9654;</button>
              <button class="status-btn-sm ${maq.status === 'parada' ? 'active-parada' : ''}" data-status="parada" data-index="${index}" title="Parada">&#9632;</button>
              <button class="status-btn-sm ${maq.status === 'setup' ? 'active-setup' : ''}" data-status="setup" data-index="${index}" title="Setup">&#9881;</button>
              <button class="status-btn-sm ${maq.status === 'manutencao' ? 'active-manutencao' : ''}" data-status="manutencao" data-index="${index}" title="Manutenção">&#9889;</button>
            </div>
            <button class="btn-delete" data-index="${index}" title="Remover">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="list-row-fields">
            <div class="field-group-sm">
              <label class="field-label-sm">VP (PCTS/MIN)</label>
              <input type="number" step="0.1" class="vel-prog" value="${esc(maq.velocidadeProgramada)}" placeholder="0" data-index="${index}">
            </div>
            <div class="field-group-sm">
              <label class="field-label-sm">VR (PCTS/MIN)</label>
              <input type="number" step="0.1" class="vel-real" value="${esc(maq.velocidadeReal)}" placeholder="0" data-index="${index}">
            </div>
            <div class="field-group-sm field-obs-sm">
              <label class="field-label-sm">${maq.status === 'parada' ? 'Motivo' : 'Obs'}</label>
              <input type="text" class="obs-input" value="${esc(maq.observacoes)}" placeholder="${maq.status === 'parada' ? 'Motivo da parada...' : 'Observações...'}" data-index="${index}">
            </div>
          </div>
        `;

        container.appendChild(item);
      } else {
        var card = document.createElement('div');
        card.className = 'card card-draft';
        card.dataset.index = index;

        card.innerHTML = `
          <div class="card-header">
            <input type="text" class="machine-name" value="${esc(maq.nome)}" placeholder="Nome da máquina" maxlength="50" data-index="${index}">
            <button class="btn-salvar" data-index="${index}">&#10003; Salvar</button>
          </div>
          <div class="status-grid">
            <button class="status-btn ${maq.status === 'rodando' ? 'active-rodando' : ''}" data-status="rodando" data-index="${index}">&#9654; Rodando</button>
            <button class="status-btn ${maq.status === 'parada' ? 'active-parada' : ''}" data-status="parada" data-index="${index}">&#9632; Parada</button>
            <button class="status-btn ${maq.status === 'setup' ? 'active-setup' : ''}" data-status="setup" data-index="${index}">&#9881; Setup</button>
            <button class="status-btn ${maq.status === 'manutencao' ? 'active-manutencao' : ''}" data-status="manutencao" data-index="${index}">&#9889; Manutenção</button>
          </div>
          <div class="card-fields">
            <div class="field-group">
              <label>Vel. Programada (PCTS/MIN)</label>
              <input type="number" step="0.1" class="vel-prog" value="${esc(maq.velocidadeProgramada)}" placeholder="0" data-index="${index}">
            </div>
            <div class="field-group">
              <label>Vel. Real (PCTS/MIN)</label>
              <input type="number" step="0.1" class="vel-real" value="${esc(maq.velocidadeReal)}" placeholder="0" data-index="${index}">
            </div>
          </div>
          <div class="card-obs">
            <label>${maq.status === 'parada' ? 'Motivo da Parada' : 'Observações'}</label>
            <textarea class="obs-textarea" placeholder="${maq.status === 'parada' ? 'Informe o motivo da parada...' : 'Adicionar observações...'}" data-index="${index}">${esc(maq.observacoes)}</textarea>
          </div>
        `;

        container.appendChild(card);
      }
    });

    attachEvents();
  }

  function attachEvents() {
    document.querySelectorAll('.machine-name').forEach(function(input) {
      input.addEventListener('input', function() {
        var index = parseInt(this.dataset.index);
        if (!isNaN(index) && maquinas[index]) {
          maquinas[index].nome = this.value;
          salvarMaquinaServer(maquinas[index].id, { nome: this.value });
        }
      });
    });

    document.querySelectorAll('.btn-salvar').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var index = parseInt(this.dataset.index);
        if (!isNaN(index) && maquinas[index]) {
          maquinas[index].salva = true;
          salvarMaquinaServer(maquinas[index].id, { salva: true });
        }
      });
    });

    function handleStatusChange(btn) {
      var index = parseInt(btn.dataset.index);
      var novoStatus = btn.dataset.status;
      if (!isNaN(index) && maquinas[index]) {
        if (maquinas[index].status !== novoStatus) {
          acumularTempo(maquinas[index]);
          maquinas[index].status = novoStatus;
          maquinas[index].statusChangedAt = Date.now();
          maquinas[index].observacoes = '';
          renderizar();
          salvarMaquinaServer(maquinas[index].id, {
            status: novoStatus,
            statusChangedAt: maquinas[index].statusChangedAt,
            observacoes: '',
            tempoRodando: maquinas[index].tempoRodando,
            tempoParada: maquinas[index].tempoParada
          });
        }
      }
    }

    document.querySelectorAll('.status-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { handleStatusChange(this); });
    });

    document.querySelectorAll('.status-btn-sm').forEach(function(btn) {
      btn.addEventListener('click', function() { handleStatusChange(this); });
    });

    document.querySelectorAll('.btn-delete').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var index = parseInt(this.dataset.index);
        if (!isNaN(index) && maquinas[index]) {
          if (confirm('Remover "' + maquinas[index].nome + '"?')) {
            deletarMaquinaServer(maquinas[index].id);
          }
        }
      });
    });

    function handleFieldInput(selector, field) {
      document.querySelectorAll(selector).forEach(function(input) {
        input.addEventListener('input', function() {
          var index = parseInt(this.dataset.index);
          if (!isNaN(index) && maquinas[index]) {
            maquinas[index][field] = this.value;
            salvarMaquinaServer(maquinas[index].id, { [field]: this.value });
          }
        });
      });
    }

    handleFieldInput('.vel-prog', 'velocidadeProgramada');
    handleFieldInput('.vel-real', 'velocidadeReal');
    handleFieldInput('.obs-input', 'observacoes');

    document.querySelectorAll('.obs-textarea').forEach(function(textarea) {
      textarea.addEventListener('input', function() {
        var index = parseInt(this.dataset.index);
        if (!isNaN(index) && maquinas[index]) {
          maquinas[index].observacoes = this.value;
          salvarMaquinaServer(maquinas[index].id, { observacoes: this.value });
        }
      });
    });
  }

  fab.addEventListener('click', function() {
    var nova = criarMaquina();
    criarMaquinaServer(nova);
  });

  btnLimpar.addEventListener('click', function() {
    if (maquinas.length === 0) return;
    if (confirm('Limpar todas as máquinas?')) {
      limparMaquinasServer();
    }
  });

  btnNavRelatorio.addEventListener('click', function() {
    window.location.href = 'relatorio.html';
  });

  btnRelatorio.addEventListener('click', async function() {
    var res = await fetch(API);
    var lista = await res.json();
    var salvas = lista.filter(function(m) { return m.salva; });
    if (salvas.length === 0) {
      alert('Nenhuma máquina salva para gerar relatório.');
      return;
    }

    var agora = new Date();
    var dataStr = agora.toLocaleString('pt-BR');

    var nomesStatus = { rodando: 'Rodando', parada: 'Parada', setup: 'Setup', manutencao: 'Manutenção' };
    var linhas = ['=== RELATÓRIO PRODVISION ==='];
    linhas.push('Data: ' + dataStr);
    linhas.push('');

    salvas.forEach(function(m) {
      linhas.push('Máquina: ' + m.nome);
      linhas.push('  Status: ' + (nomesStatus[m.status] || 'Parada'));
      linhas.push('  Vel. Programada: ' + (m.velocidadeProgramada || '0') + ' PCTS/MIN');
      linhas.push('  Vel. Real: ' + (m.velocidadeReal || '0') + ' PCTS/MIN');
      linhas.push('  Observações: ' + (m.observacoes || '-'));
      linhas.push('');
    });

    linhas.push('=== FIM ===');
    var texto = linhas.join('\n');

    var snapshot = salvas.map(function(m) {
      return { nome: m.nome, status: m.status, observacoes: m.observacoes || '', vp: m.velocidadeProgramada || '', vr: m.velocidadeReal || '' };
    });

    try {
      await fetch('/api/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now(), data: dataStr, maquinas: snapshot })
      });
    } catch (e) {}

    await navigator.clipboard.writeText(texto).catch(function() {
      var ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });

    alert('Relatório copiado para a área de transferência!');
  });

  var logMaquina = document.getElementById('logMaquina');
  var logStatus = document.getElementById('logStatus');
  var logHoraInicio = document.getElementById('logHoraInicio');
  var logHoraFim = document.getElementById('logHoraFim');
  var logObservacao = document.getElementById('logObservacao');
  var btnLogSalvar = document.getElementById('btnLogSalvar');
  var logLista = document.getElementById('logLista');

  function agoraLocal() {
    var d = new Date();
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function carregarLogSelect() {
    logMaquina.innerHTML = '<option value="">Selecione a máquina</option>';
    maquinas.filter(function(m) { return m.salva; }).forEach(function(m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.nome;
      logMaquina.appendChild(opt);
    });
  }

  async function carregarEventos() {
    try {
      var res = await fetch('/api/eventos');
      var lista = await res.json();
      logLista.innerHTML = '';
      lista.forEach(function(ev) {
        var item = document.createElement('div');
        item.className = 'log-item';
        var sLabel = { rodando: 'Rodando', parada: 'Parada', setup: 'Setup', manutencao: 'Manutenção' };
        var sIcon = { rodando: '&#9654;', parada: '&#9632;', setup: '&#9881;', manutencao: '&#9889;' };
        var inicio = new Date(ev.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        var fim = ev.fim ? new Date(ev.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        var sClass = ev.status === 'rodando' ? 's-rodando' : (ev.status === 'parada' ? 's-parada' : (ev.status === 'setup' ? 's-setup' : 's-manutencao'));
        item.innerHTML = '<div class="log-item-header"><span class="log-item-maq">' + esc(ev.maquinaNome) + '</span><span class="log-item-status ' + sClass + '">' + sIcon[ev.status] + ' ' + (sLabel[ev.status] || ev.status) + '</span><button class="log-item-del" data-id="' + ev.id + '">&#10005;</button></div><div class="log-item-time">' + inicio + ' - ' + fim + '</div>' + (ev.observacao ? '<div class="log-item-obs">' + esc(ev.observacao) + '</div>' : '');
        logLista.prepend(item);
      });
      logLista.querySelectorAll('.log-item-del').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          if (confirm('Remover este evento?')) {
            await fetch('/api/eventos/' + this.dataset.id, { method: 'DELETE' });
            carregarEventos();
          }
        });
      });
    } catch (e) {}
  }

  logHoraInicio.value = agoraLocal();

  btnLogSalvar.addEventListener('click', async function() {
    if (!logMaquina.value) { alert('Selecione uma máquina.'); return; }
    var maq = maquinas.find(function(m) { return m.id === logMaquina.value; });
    if (!maq) { alert('Máquina não encontrada.'); return; }

    var hoje = new Date();
    var dataStr = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth()+1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);

    function timeToMs(timeStr) {
      if (!timeStr) return null;
      var partes = timeStr.split(':');
      var d = new Date(dataStr + 'T' + timeStr + ':00-03:00');
      return d.getTime();
    }

    var inicio = timeToMs(logHoraInicio.value) || Date.now();
    var fim = logHoraFim.value ? timeToMs(logHoraFim.value) : null;

    try {
      await fetch('/api/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maquinaId: maq.id,
          maquinaNome: maq.nome,
          status: logStatus.value,
          inicio: inicio,
          fim: fim,
          observacao: logObservacao.value
        })
      });
      logStatus.value = 'parada';
      logHoraFim.value = '';
      logObservacao.value = '';
      logHoraInicio.value = agoraLocal();
      carregarEventos();
    } catch (e) {
      alert('Erro ao salvar evento.');
    }
  });

  var _carregarMaquinasOriginal = carregarMaquinas;
  carregarMaquinas = function() {
    _carregarMaquinasOriginal();
    var checkLoaded = setInterval(function() {
      if (maquinas.length > 0 || document.querySelectorAll('.card-list, .card').length > 0) {
        clearInterval(checkLoaded);
        setTimeout(function() {
          carregarLogSelect();
          carregarEventos();
        }, 100);
      }
    }, 200);
  };

  carregarMaquinas();
})();
