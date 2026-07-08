const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 5500;

const db = new Database('prodvision.db');
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
    snapshot TEXT NOT NULL
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
`);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/maquinas', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM maquinas ORDER BY criadaEm ASC').all();
    res.json(rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maquinas', (req, res) => {
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

app.put('/api/maquinas/:id', (req, res) => {
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

app.delete('/api/maquinas/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM maquinas WHERE id = ?').run(req.params.id);
    const rows = db.prepare('SELECT * FROM maquinas ORDER BY criadaEm ASC').all();
    res.json(rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maquinas', (req, res) => {
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
    db.prepare('INSERT INTO timeline (timestamp, data, snapshot) VALUES (?, ?, ?)').run(
      timestamp || Date.now(),
      data || new Date().toLocaleString('pt-BR'),
      JSON.stringify(maquinas || [])
    );
    const rows = db.prepare('SELECT * FROM timeline ORDER BY timestamp DESC LIMIT 50').all();
    res.json(rows.map(r => ({ ...r, maquinas: JSON.parse(r.snapshot) })));
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

app.post('/api/eventos', (req, res) => {
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

app.delete('/api/eventos/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM eventos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
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
