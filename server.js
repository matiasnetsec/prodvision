const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5500;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/prodvision',
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maquinas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      status TEXT DEFAULT 'parada',
      "statusChangedAt" BIGINT DEFAULT 0,
      "velocidadeProgramada" TEXT DEFAULT '',
      "velocidadeReal" TEXT DEFAULT '',
      observacoes TEXT DEFAULT '',
      salva INTEGER DEFAULT 1,
      "tempoRodando" INTEGER DEFAULT 0,
      "tempoParada" INTEGER DEFAULT 0,
      "criadaEm" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS timeline (
      id SERIAL PRIMARY KEY,
      "timestamp" BIGINT NOT NULL,
      data TEXT NOT NULL,
      snapshot TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eventos (
      id SERIAL PRIMARY KEY,
      "maquinaId" TEXT NOT NULL,
      "maquinaNome" TEXT NOT NULL,
      status TEXT NOT NULL,
      inicio BIGINT NOT NULL,
      fim BIGINT,
      observacao TEXT DEFAULT '',
      "criadoEm" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
    )
  `);
}

initDB().catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/maquinas', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM maquinas ORDER BY "criadaEm" ASC');
    res.json(result.rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maquinas', async (req, res) => {
  try {
    const { id, nome, status, statusChangedAt, velocidadeProgramada, velocidadeReal, observacoes, salva } = req.body;
    await pool.query(`
      INSERT INTO maquinas (id, nome, status, "statusChangedAt", "velocidadeProgramada", "velocidadeReal", observacoes, salva)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      id || Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
      nome || 'Nova Máquina',
      status || 'parada',
      statusChangedAt || Date.now(),
      velocidadeProgramada || '',
      velocidadeReal || '',
      observacoes || '',
      salva !== undefined ? (salva ? 1 : 0) : 1
    ]);
    const result = await pool.query('SELECT * FROM maquinas ORDER BY "criadaEm" ASC');
    res.json(result.rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/maquinas/:id', async (req, res) => {
  try {
    const { nome, status, statusChangedAt, velocidadeProgramada, velocidadeReal, observacoes, salva, tempoRodando, tempoParada } = req.body;
    const sets = [];
    const params = [];
    let i = 1;

    if (nome !== undefined) { sets.push(`nome = $${i++}`); params.push(nome); }
    if (status !== undefined) { sets.push(`status = $${i++}`); params.push(status); }
    if (statusChangedAt !== undefined) { sets.push(`"statusChangedAt" = $${i++}`); params.push(statusChangedAt); }
    if (velocidadeProgramada !== undefined) { sets.push(`"velocidadeProgramada" = $${i++}`); params.push(velocidadeProgramada); }
    if (velocidadeReal !== undefined) { sets.push(`"velocidadeReal" = $${i++}`); params.push(velocidadeReal); }
    if (observacoes !== undefined) { sets.push(`observacoes = $${i++}`); params.push(observacoes); }
    if (salva !== undefined) { sets.push(`salva = $${i++}`); params.push(salva ? 1 : 0); }
    if (tempoRodando !== undefined) { sets.push(`"tempoRodando" = $${i++}`); params.push(tempoRodando); }
    if (tempoParada !== undefined) { sets.push(`"tempoParada" = $${i++}`); params.push(tempoParada); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    await pool.query(`UPDATE maquinas SET ${sets.join(', ')} WHERE id = $${i}`, params);

    const result = await pool.query('SELECT * FROM maquinas WHERE id = $1', [req.params.id]);
    if (result.rows[0]) {
      res.json({ ...result.rows[0], salva: Boolean(result.rows[0].salva) });
    } else {
      res.status(404).json({ error: 'Machine not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maquinas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM maquinas WHERE id = $1', [req.params.id]);
    const result = await pool.query('SELECT * FROM maquinas ORDER BY "criadaEm" ASC');
    res.json(result.rows.map(r => ({ ...r, salva: Boolean(r.salva) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/maquinas', async (req, res) => {
  try {
    await pool.query('DELETE FROM maquinas');
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/timeline', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM timeline ORDER BY "timestamp" DESC LIMIT 50');
    res.json(result.rows.map(r => ({ ...r, maquinas: JSON.parse(r.snapshot) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/timeline', async (req, res) => {
  try {
    const { timestamp, data, maquinas } = req.body;
    await pool.query('INSERT INTO timeline ("timestamp", data, snapshot) VALUES ($1, $2, $3)', [
      timestamp || Date.now(),
      data || new Date().toLocaleString('pt-BR'),
      JSON.stringify(maquinas || [])
    ]);
    const result = await pool.query('SELECT * FROM timeline ORDER BY "timestamp" DESC LIMIT 50');
    res.json(result.rows.map(r => ({ ...r, maquinas: JSON.parse(r.snapshot) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/eventos', async (req, res) => {
  try {
    const { data } = req.query;
    let sql = 'SELECT * FROM eventos ORDER BY inicio DESC';
    const params = [];
    if (data) {
      const inicio = new Date(data + 'T00:00:00-03:00').getTime();
      const fim = inicio + 86400000;
      sql = 'SELECT * FROM eventos WHERE inicio >= $1 AND inicio < $2 ORDER BY inicio DESC';
      params.push(inicio, fim);
    }
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/eventos', async (req, res) => {
  try {
    const { maquinaId, maquinaNome, status, inicio, fim, observacao } = req.body;
    const result = await pool.query(`
      INSERT INTO eventos ("maquinaId", "maquinaNome", status, inicio, fim, observacao)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [maquinaId, maquinaNome, status, inicio, fim || null, observacao || '']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/eventos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM eventos WHERE id = $1', [req.params.id]);
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
