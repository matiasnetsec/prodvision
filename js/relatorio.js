(function() {
  'use strict';

  var timelineEntries = [];
  var eventos = [];
  var timelineAberto = true;
  var filtroData = '';

  var content = document.getElementById('relatoriosContent');
  var btnVoltar = document.getElementById('btnVoltar');

  function esc(t) {
    if (typeof t !== 'string') return '';
    var d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function getTurno(data) {
    var d = new Date(data);
    var br = new Date(d.getTime() - 3 * 3600000);
    var min = br.getUTCHours() * 60 + br.getUTCMinutes();
    var dia = br.getUTCDay();
    var sab = dia === 6, dom = dia === 0, util = !sab && !dom;

    if (util && min >= 22 * 60) return 'C';
    if (util && min >= 13 * 60 + 30 && min < 22 * 60) return 'B';
    if (!dom && min >= 6 * 60 && min < 13 * 60 + 30) return 'A';
    if (util && min < 6 * 60) return 'C';
    if (sab && min >= 6 * 60 && min < 13 * 60 + 30) return 'A';
    return '-';
  }

  function dentroDoFiltro(ts) {
    if (!filtroData) return true;
    var inicio = new Date(filtroData + 'T00:00:00-03:00').getTime();
    var fim = inicio + 86400000;
    return ts >= inicio && ts < fim;
  }

  async function carregarDados() {
    try {
      var [r1, r2] = await Promise.all([
        fetch('/api/timeline'),
        fetch('/api/eventos')
      ]);
      if (r1.ok) timelineEntries = await r1.json();
      if (r2.ok) eventos = await r2.json();
    } catch (e) {
      timelineEntries = [];
      eventos = [];
    }
  }

  function renderTimeline() {
    var html = '';

    html += '<div class="rel-timeline-toggle" id="timelineToggle">';
    html += '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    html += '  Histórico de Relatórios';
    html += '  <span class="timeline-count">' + timelineEntries.length + '</span>';
    html += '  <span class="timeline-arrow">' + (timelineAberto ? '&#9660;' : '&#9654;') + '</span>';
    html += '</div>';

    if (timelineAberto) {
      html += '<div class="tl-filtro-data">';
      html += '  <input type="date" id="filtroDataInput" class="tl-date-input" value="' + filtroData + '">';
      if (filtroData) {
        html += '  <button id="limparFiltroData" class="tl-limpar-data">&#10005;</button>';
      }
      html += '</div>';

      var evFiltrados = eventos.filter(function(e) { return dentroDoFiltro(e.inicio); });
      var tlFiltradas = timelineEntries.filter(function(e) { return dentroDoFiltro(e.timestamp); });

      if (evFiltrados.length > 0 || tlFiltradas.length > 0) {
        html += '<div class="rel-dual">';

        if (tlFiltradas.length > 0) {
          html += '<div class="rel-dual-col">';
          html += '<div class="rel-section-title">Relatórios Enviados</div>';
          html += '<div class="rel-timeline">';
          html += '<div class="timeline-legend"><span class="lg-rodando">&#9654; Rodando</span><span class="lg-parada">&#9632; Parada</span><span class="lg-setup">&#9881; Setup</span><span class="lg-manutencao">&#9889; Manutenção</span></div>';
          tlFiltradas.forEach(function(entry) {
            html += '  <div class="tl-item">';
            html += '    <div class="tl-dot"></div>';
            html += '    <div class="tl-data">' + esc(entry.data) + '</div>';
            html += '  </div>';
            if (entry.maquinas && entry.maquinas.length > 0) {
              html += '  <div class="tl-mags">';
              entry.maquinas.forEach(function(m) {
                var sClass = m.status === 'rodando' ? 's-rodando' : (m.status === 'parada' ? 's-parada' : (m.status === 'setup' ? 's-setup' : 's-manutencao'));
                var sIcon = m.status === 'rodando' ? '&#9654;' : (m.status === 'parada' ? '&#9632;' : (m.status === 'setup' ? '&#9881;' : '&#9889;'));
                html += '    <span class="tl-mag"><span class="tl-badge ' + sClass + '">' + sIcon + '</span> ' + esc(m.nome);
                var info = [];
                if (m.vp) info.push('VP: ' + esc(m.vp));
                if (m.vr) info.push('VR: ' + esc(m.vr));
                if (info.length > 0) {
                  html += ' <span class="tl-vel">' + info.join(' | ') + '</span>';
                }
                if (m.observacoes) {
                  html += ' <span class="tl-obs">(' + esc(m.observacoes) + ')</span>';
                }
                html += '</span>';
              });
              html += '  </div>';
            }
          });
          html += '</div>';
          html += '</div>';
        }

        if (evFiltrados.length > 0) {
          html += '<div class="rel-dual-col">';
          html += '<div class="rel-section-title">Registros de Turno</div>';
          html += '<div class="rel-timeline">';
          evFiltrados.forEach(function(ev) {
            var sLabel = { rodando: 'Rodando', parada: 'Parada', setup: 'Setup', manutencao: 'Manutenção' };
            var sIcon = { rodando: '&#9654;', parada: '&#9632;', setup: '&#9881;', manutencao: '&#9889;' };
            var sClass = ev.status === 'rodando' ? 's-rodando' : (ev.status === 'parada' ? 's-parada' : (ev.status === 'setup' ? 's-setup' : 's-manutencao'));
            var inicio = new Date(ev.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            var fim = ev.fim ? new Date(ev.fim).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
            var turno = getTurno(ev.inicio);
            html += '  <div class="tl-item">';
            html += '    <div class="tl-dot" style="background:' + (ev.status === 'rodando' ? '#00e676' : ev.status === 'parada' ? '#ff1744' : ev.status === 'setup' ? '#ffab00' : '#7c4dff') + '"></div>';
            html += '    <div class="tl-data"><strong>' + esc(ev.maquinaNome) + '</strong> <span class="tl-badge ' + sClass + '">' + sIcon[ev.status] + '</span> <span class="tl-turno">Turno ' + turno + '</span></div>';
            html += '  </div>';
            html += '  <div class="tl-mags" style="padding-top:0">';
            html += '    <span class="tl-mag">' + inicio + ' - ' + fim + '</span>';
            if (ev.observacao) {
              html += '    <span class="tl-mag tl-obs" style="font-style:normal">' + esc(ev.observacao) + '</span>';
            }
            html += '  </div>';
          });
          html += '</div>';
          html += '</div>';
        }

        html += '</div>';
      } else {
        html += '<div class="tl-empty">Nenhum registro neste período</div>';
      }
    }

    content.innerHTML = html;

    var dateInput = document.getElementById('filtroDataInput');
    if (dateInput) {
      dateInput.addEventListener('change', function() {
        filtroData = this.value;
        renderTimeline();
      });
    }
    var limparBtn = document.getElementById('limparFiltroData');
    if (limparBtn) {
      limparBtn.addEventListener('click', function() {
        filtroData = '';
        renderTimeline();
      });
    }

    var toggle = document.getElementById('timelineToggle');
    if (toggle) {
      toggle.addEventListener('click', function() {
        timelineAberto = !timelineAberto;
        renderTimeline();
      });
    }
  }

  btnVoltar.addEventListener('click', function() {
    window.location.href = 'index.html';
  });

  carregarDados().then(renderTimeline);
})();
