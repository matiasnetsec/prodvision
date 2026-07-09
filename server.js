const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5500;
const tokens = new Map();

const DB_PATH = process.env.DATABASE_PATH || 'prodvision.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS maquinas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    status TEXT DEFAULT 'parada',
    statusChangedAt INTEGER DEFAULT 0,
    velocidadeProgramada TEXT DEFAULT '',
    velocidadeReal TEXT DEFAULT '',
    observacoes TEXT DEFAULT '',
    salva INTEGER DEFAULT 1,
    tempoRodando INTEGER DEFAULT 0,
    tempoParada INTEGER DEFAULT 0,
    criadaEm INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    data TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    usuario TEXT DEFAULT '',
    cargo TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    maquinaId TEXT NOT NULL,
    maquinaNome TEXT NOT NULL,
    status TEXT NOT NULL,
    inicio INTEGER NOT NULL,
    fim INTEGER,
    observacao TEXT DEFAULT '',
    criadoEm INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS login_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    ip TEXT DEFAULT '',
    criadoEm INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('dev','admin','user')),
    criadoEm INTEGER DEFAULT (unixepoch() * 1000)
  );
`);

function hashPassword(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(senha, salt, 1000, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

function checkPassword(senha, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(senha, salt, 1000, 64, 'sha512').toString('hex');
  return hash === check;
}

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO usuarios (username, password, role) VALUES (?, ?, ?)');
    stmt.run('dev', hashPassword('dev123'), 'dev');
    stmt.run('admin', hashPassword('admin123'), 'admin');
    stmt.run('user', hashPassword('user123'), 'user');
  }
}
try { db.exec("ALTER TABLE timeline ADD COLUMN usuario TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE timeline ADD COLUMN cargo TEXT DEFAULT ''"); } catch (e) {}

seedUsers();

function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  const token = header.slice(7);
  const session = tokens.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  req.user = session;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Permissão negada' });
    }
    next();
  };
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/login', (req, res) => {
  try {
    const { username, senha } = req.body;
    if (!username || !senha) {
      return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    }
    const user = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
    if (!user || !checkPassword(senha, user.password)) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos' });
    }
    const token = gerarToken();
    tokens.set(token, { username: user.username, role: user.role, userId: user.id });
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    db.prepare('INSERT INTO login_log (username, role, ip) VALUES (?, ?, ?)').run(user.username, user.role, ip);
    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/check', (req, res) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.json({ autenticado: false });
  }
  const token = header.slice(7);
  const session = tokens.get(token);
  res.json({ autenticado: !!session, role: session ? session.role : null, username: session ? session.username : null });
});

app.use('/api', authMiddleware);

app.get('/api/maquinas', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM maquinas ORDER BY criadaEm ASC').all();
    res.json(rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maquinas', requireRole('dev', 'admin'), (req, res) => {
  try {
    const { id, nome, status, statusChangedAt, velocidadeProgramada, velocidadeReal, observacoes, salva } = req.body;
    const stmt = db.prepare(`
      INSERT INTO maquinas (id, nome, status, statusChangedAt, velocidadeProgramada, velocidadeReal, observacoes, salva)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id || Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
      nome || 'Nova Máquina',
      status || 'parada',
      statusChangedAt || Date.now(),
      velocidadeProgramada || '',
      velocidadeReal || '',
      observacoes || '',
      salva !== undefined ? (salva ? 1 : 0) : 1
    );
    const rows = db.prepare('SELECT * FROM maquinas ORDER BY criadaEm ASC').all();
    res.json(rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/maquinas/:id', requireRole('dev', 'admin'), (req, res) => {
  try {
    const { nome, status, statusChangedAt, velocidadeProgramada, velocidadeReal, observacoes, salva, tempoRodando, tempoParada } = req.body;
    const updates = [];
    const params = [];

    if (nome !== undefined) { updates.push('nome = ?'); params.push(nome); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (statusChangedAt !== undefined) { updates.push('statusChangedAt = ?'); params.push(statusChangedAt); }
    if (velocidadeProgramada !== undefined) { updates.push('velocidadeProgramada = ?'); params.push(velocidadeProgramada); }
    if (velocidadeReal !== undefined) { updates.push('velocidadeReal = ?'); params.push(velocidadeReal); }
    if (observacoes !== undefined) { updates.push('observacoes = ?'); params.push(observacoes); }
    if (salva !== undefined) { updates.push('salva = ?'); params.push(salva ? 1 : 0); }
    if (tempoRodando !== undefined) { updates.push('tempoRodando = ?'); params.push(tempoRodando); }
    if (tempoParada !== undefined) { updates.push('tempoParada = ?'); params.push(tempoParada); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    db.prepare(`UPDATE maquinas SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const row = db.prepare('SELECT * FROM maquinas WHERE id = ?').get(req.params.id);
    if (row) {
      res.json({ ...row, salva: Boolean(row.salva) });
    } else {
      res.status(404).json({ error: 'Machine not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maquinas/:id', requireRole('dev', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM maquinas WHERE id = ?').run(req.params.id);
    const rows = db.prepare('SELECT * FROM maquinas ORDER BY criadaEm ASC').all();
    res.json(rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maquinas', requireRole('dev', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM maquinas').run();
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/timeline', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM timeline ORDER BY timestamp DESC LIMIT 50').all();
    res.json(rows.map(r => ({ ...r, maquinas: JSON.parse(r.snapshot) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/timeline', (req, res) => {
  try {
    const { timestamp, data, maquinas } = req.body;
    const usuario = req.user ? req.user.username : '';
    const cargo = req.user ? req.user.role : '';
    const cargoLabel = { dev: 'Desenvolvedor', admin: 'Administrador', user: 'Usuário' };
    db.prepare('INSERT INTO timeline (timestamp, data, snapshot, usuario, cargo) VALUES (?, ?, ?, ?, ?)').run(
      timestamp || Date.now(),
      data || new Date().toLocaleString('pt-BR'),
      JSON.stringify(maquinas || []),
      usuario,
      cargoLabel[cargo] || cargo
    );
    const rows = db.prepare('SELECT * FROM timeline ORDER BY timestamp DESC LIMIT 50').all();
    res.json(rows.map(r => ({ ...r, maquinas: JSON.parse(r.snapshot) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/timeline/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM timeline WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/eventos', (req, res) => {
  try {
    const { data } = req.query;
    let sql = 'SELECT * FROM eventos ORDER BY inicio DESC';
    const params = [];
    if (data) {
      const inicio = new Date(data + 'T00:00:00-03:00').getTime();
      const fim = inicio + 86400000;
      sql = 'SELECT * FROM eventos WHERE inicio >= ? AND inicio < ? ORDER BY inicio DESC';
      params.push(inicio, fim);
    }
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/eventos', requireRole('dev', 'admin'), (req, res) => {
  try {
    const { maquinaId, maquinaNome, status, inicio, fim, observacao } = req.body;
    const stmt = db.prepare('INSERT INTO eventos (maquinaId, maquinaNome, status, inicio, fim, observacao) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(maquinaId, maquinaNome, status, inicio, fim || null, observacao || '');
    const row = db.prepare('SELECT * FROM eventos WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/eventos/:id', requireRole('dev', 'admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM eventos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/usuarios', requireRole('dev', 'admin'), (req, res) => {
  try {
    const rows = db.prepare('SELECT id, username, role, criadoEm FROM usuarios ORDER BY criadoEm ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', requireRole('dev', 'admin'), (req, res) => {
  try {
    const { username, senha, role } = req.body;
    if (!username || !senha) {
      return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    }
    if (!['dev', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Role inválida. Use: dev, admin ou user' });
    }
    const existente = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
    if (existente) {
      return res.status(400).json({ error: 'Usuário já existe' });
    }
    const stmt = db.prepare('INSERT INTO usuarios (username, password, role) VALUES (?, ?, ?)');
    stmt.run(username, hashPassword(senha), role);
    const rows = db.prepare('SELECT id, username, role, criadoEm FROM usuarios ORDER BY criadoEm ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:id/password', requireRole('dev', 'admin'), (req, res) => {
  try {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ error: 'Senha obrigatória' });
    const target = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashPassword(senha), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/usuarios/:id', requireRole('dev', 'admin'), (req, res) => {
  try {
    const target = db.prepare('SELECT id, role FROM usuarios WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target.role === 'dev') return res.status(403).json({ error: 'Não pode remover o desenvolvedor' });
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
    const rows = db.prepare('SELECT id, username, role, criadoEm FROM usuarios ORDER BY criadoEm ASC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dev/logs', requireRole('dev'), (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM login_log ORDER BY criadoEm DESC LIMIT 100').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dev/info', requireRole('dev'), (req, res) => {
  try {
    const dbSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count, pragma_page_size").get();
    const userCount = db.prepare('SELECT COUNT(*) as c FROM usuarios').get().c;
    const machineCount = db.prepare('SELECT COUNT(*) as c FROM maquinas').get().c;
    const eventCount = db.prepare('SELECT COUNT(*) as c FROM eventos').get().c;
    const timelineCount = db.prepare('SELECT COUNT(*) as c FROM timeline').get().c;
    res.json({
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.floor(process.uptime()),
      dbSize: dbSize ? dbSize.size : 0,
      usuarios: userCount,
      maquinas: machineCount,
      eventos: eventCount,
      timeline: timelineCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/export', requireRole('dev'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Prodvision';
    wb.created = new Date();

    const cores = {
      primary: 'FF00E5FF', secondary: 'FF7C4DFF', bg: 'FF0A0E1A',
      bg2: 'FF0F1424', text: 'FFE8EAF6', text2: 'FF9FA8DA',
      success: 'FF00E676', danger: 'FFFF1744', warning: 'FFFFAB00',
    };

    const style = {
      header: { font: { bold: true, color: { argb: cores.primary }, size: 11 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.bg } }, border: { bottom: { style: 'thin', color: { argb: cores.primary } } } },
      title: { font: { bold: true, color: { argb: cores.primary }, size: 14 } },
      cell: { font: { color: { argb: cores.text }, size: 10 }, border: { bottom: { style: 'thin', color: { argb: 'FF1A2040' } } } },
      cellAlt: { font: { color: { argb: cores.text }, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.bg2 } }, border: { bottom: { style: 'thin', color: { argb: 'FF1A2040' } } } },
    };

    const timeline = db.prepare('SELECT * FROM timeline ORDER BY timestamp ASC').all().map(r => ({ ...r, maquinas: JSON.parse(r.snapshot) }));
    const eventos = db.prepare('SELECT * FROM eventos ORDER BY inicio ASC').all();
    const maquinas = db.prepare('SELECT * FROM maquinas ORDER BY criadaEm ASC').all();
    const usuarios = db.prepare('SELECT id, username, role, criadoEm FROM usuarios ORDER BY criadoEm ASC').all();

    function getTurno(ts) {
      const d = new Date(ts - 3 * 3600000);
      const min = d.getUTCHours() * 60 + d.getUTCMinutes();
      const dia = d.getUTCDay();
      const sab = dia === 6, dom = dia === 0, util = !sab && !dom;
      if (util && min >= 22 * 60) return 'C';
      if (util && min >= 13 * 60 + 30 && min < 22 * 60) return 'B';
      if (!dom && min >= 6 * 60 && min < 13 * 60 + 30) return 'A';
      if (util && min < 6 * 60) return 'C';
      if (sab && min >= 6 * 60 && min < 13 * 60 + 30) return 'A';
      return '-';
    }

    function aplicarEstilo(ws, numRows, numCols) {
      for (let c = 1; c <= numCols; c++) Object.assign(ws.getCell(1, c), style.header);
      for (let r = 2; r <= numRows; r++)
        for (let c = 1; c <= numCols; c++) Object.assign(ws.getCell(r, c), r % 2 === 0 ? style.cellAlt : style.cell);
    }

    // === Sheet 1: Resumo ===
    const wsResumo = wb.addWorksheet('Resumo');
    wsResumo.mergeCells('A1:B1');
    wsResumo.getCell('A1').value = 'PRODVISION - RELATÓRIO GERAL';
    Object.assign(wsResumo.getCell('A1'), style.title);
    const resumoData = [
      { ind: 'Total de Máquinas', val: maquinas.length },
      { ind: 'Total de Relatórios Enviados', val: timeline.length },
      { ind: 'Total de Registros de Turno', val: eventos.length },
      { ind: 'Total de Usuários', val: usuarios.length },
      { ind: 'Período', val: timeline.length > 1 ? new Date(timeline[0].timestamp).toLocaleDateString('pt-BR') + ' a ' + new Date(timeline[timeline.length-1].timestamp).toLocaleDateString('pt-BR') : '-' },
    ];
    wsResumo.columns = [{ key: 'ind', width: 35 }, { key: 'val', width: 30 }];
    wsResumo.addRows(resumoData);
    aplicarEstilo(wsResumo, resumoData.length + 1, 2);

    // === Sheet 2: Eficiência por Hora ===
    const wsHora = wb.addWorksheet('Eficiência por Hora');
    const horasMap = {};
    timeline.forEach(t => {
      const d = new Date(t.timestamp);
      const chave = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':00';
      if (!horasMap[chave]) horasMap[chave] = { vps: [], vrs: [] };
      (t.maquinas || []).forEach(m => {
        if (m.vp) horasMap[chave].vps.push(parseFloat(m.vp) || 0);
        if (m.vr) horasMap[chave].vrs.push(parseFloat(m.vr) || 0);
      });
    });
    const horasData = Object.keys(horasMap).sort().map(k => {
      const vps = horasMap[k].vps;
      const vrs = horasMap[k].vrs;
      const medVp = vps.length ? (vps.reduce((a,b)=>a+b,0) / vps.length) : 0;
      const medVr = vrs.length ? (vrs.reduce((a,b)=>a+b,0) / vrs.length) : 0;
      const eff = medVp > 0 ? Math.round((medVr / medVp) * 100) : 0;
      return { hora: k.slice(-5), vp: Math.round(medVp * 10) / 10, vr: Math.round(medVr * 10) / 10, eficiencia: eff };
    });
    wsHora.columns = [
      { header: 'Hora', key: 'hora', width: 10 },
      { header: 'VP Média', key: 'vp', width: 12 },
      { header: 'VR Média', key: 'vr', width: 12 },
      { header: 'Eficiência %', key: 'eficiencia', width: 14 },
    ];
    wsHora.addRows(horasData);
    aplicarEstilo(wsHora, horasData.length + 1, 4);
    if (horasData.length > 0) {
      try {
        const chartHora = wb.addChart('bar', {
          title: { text: 'Eficiência por Hora (%)' },
          x: { categories: horasData.map(h => h.hora) },
          series: [{ name: 'Eficiência (%)', data: horasData.map(h => h.eficiencia) }],
        });
        wsHora.addImage(chartHora, { tl: { col: 0, row: horasData.length + 3 }, ext: { width: 700, height: 300 } });
      } catch (e) {}
    }

    // === Sheet 3: Máquinas ===
    const wsMaqs = wb.addWorksheet('Máquinas');
    wsMaqs.columns = [
      { header: 'Nome', key: 'nome', width: 25 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'VP (PCTS/MIN)', key: 'vp', width: 16 },
      { header: 'VR (PCTS/MIN)', key: 'vr', width: 16 },
      { header: 'Observações', key: 'obs', width: 30 },
    ];
    const statusLabel = { rodando: 'Rodando', parada: 'Parada', setup: 'Setup', manutencao: 'Manutenção' };
    wsMaqs.addRows(maquinas.map(m => ({ nome: m.nome, status: statusLabel[m.status] || m.status, vp: m.velocidadeProgramada || '0', vr: m.velocidadeReal || '0', obs: m.observacoes || '-' })));
    aplicarEstilo(wsMaqs, maquinas.length + 1, 5);

    // === Sheet 4: Paradas ===
    const wsParadas = wb.addWorksheet('Paradas');
    const paradasMap = {};
    eventos.filter(e => e.status === 'parada').forEach(e => {
      const motivo = e.observacao || 'Sem motivo registrado';
      if (!paradasMap[motivo]) paradasMap[motivo] = 0;
      paradasMap[motivo]++;
    });
    const paradasData = Object.keys(paradasMap).sort((a,b) => paradasMap[b] - paradasMap[a]).map(k => ({
      motivo: k, quantidade: paradasMap[k]
    }));
    wsParadas.columns = [
      { header: 'Motivo da Parada', key: 'motivo', width: 45 },
      { header: 'Quantidade', key: 'quantidade', width: 14 },
    ];
    wsParadas.addRows(paradasData);
    aplicarEstilo(wsParadas, paradasData.length + 1, 2);
    if (paradasData.length > 0) {
      try {
        const chartPie = wb.addChart('pie', {
          title: { text: 'Principais Paradas' },
          series: [{ name: 'Paradas', data: paradasData.map(p => p.quantidade) }],
          plotArea: { categories: paradasData.map(p => p.motivo.substring(0, 25)) },
        });
        wsParadas.addImage(chartPie, { tl: { col: 0, row: paradasData.length + 3 }, ext: { width: 500, height: 300 } });
      } catch (e) {}
    }

    // === Sheet 5: Turnos ===
    const wsTurnos = wb.addWorksheet('Turnos');
    const turnoMap = { A: 0, B: 0, C: 0 };
    const turnoParadas = { A: { total: 0, motivos: {} }, B: { total: 0, motivos: {} }, C: { total: 0, motivos: {} } };
    timeline.forEach(t => { const turno = getTurno(t.timestamp); if (turnoMap[turno] !== undefined) turnoMap[turno]++; });
    eventos.forEach(e => {
      const turno = getTurno(e.inicio);
      if (turnoParadas[turno]) {
        turnoParadas[turno].total++;
        if (e.status === 'parada') {
          const m = e.observacao || 'Sem motivo';
          if (!turnoParadas[turno].motivos[m]) turnoParadas[turno].motivos[m] = 0;
          turnoParadas[turno].motivos[m]++;
        }
      }
    });
    wsTurnos.columns = [
      { header: 'Turno', key: 'turno', width: 12 },
      { header: 'Relatórios', key: 'relatorios', width: 14 },
      { header: 'Registros', key: 'registros', width: 14 },
      { header: 'Principal Parada', key: 'principal', width: 45 },
    ];
    const turnosData = ['A','B','C'].map(t => {
      const tp = turnoParadas[t];
      let principal = '-';
      if (tp.motivos && Object.keys(tp.motivos).length > 0) {
        const top = Object.entries(tp.motivos).sort((a,b) => b[1]-a[1])[0];
        principal = top[0] + ' (' + top[1] + 'x)';
      }
      return { turno: 'Turno ' + t, relatorios: turnoMap[t] || 0, registros: tp.total, principal };
    });
    wsTurnos.addRows(turnosData);
    aplicarEstilo(wsTurnos, turnosData.length + 1, 4);

    // === Sheet 6: Histórico ===
    const wsHist = wb.addWorksheet('Histórico de Relatórios');
    wsHist.columns = [
      { header: 'Data', key: 'data', width: 25 },
      { header: 'Usuário', key: 'usuario', width: 18 },
      { header: 'Cargo', key: 'cargo', width: 18 },
      { header: 'Máquinas', key: 'maqs', width: 50 },
    ];
    wsHist.addRows(timeline.map(t => ({
      data: t.data,
      usuario: t.usuario || '-',
      cargo: t.cargo || '-',
      maqs: (t.maquinas || []).map(m => m.nome + ' (' + (m.status || '-') + ')').join(', '),
    })));
    aplicarEstilo(wsHist, timeline.length + 1, 4);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=prodvision_relatorio.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Prodvision running on http://localhost:${PORT}`);
});
