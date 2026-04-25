const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3000;
const DB_PATH = '/app/data/guitar.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    duration INTEGER NOT NULL,
    items TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS practice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS exercise_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    bpm INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const itemCount = db.prepare('SELECT COUNT(*) as c FROM practice_items').get();
if (itemCount.c === 0) {
  const items = [
    'Scales', 'Chords', 'Fingerpicking', 'Strumming', 'Barre Chords',
    'Arpeggios', 'Music Theory', 'Song Learning', 'Improvisation', 'Sight Reading'
  ];
  const insert = db.prepare('INSERT INTO practice_items (name) VALUES (?)');
  items.forEach(name => insert.run(name));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions
app.get('/api/sessions', (req, res) => {
  const limit  = parseInt(req.query.limit)  || null;
  const offset = parseInt(req.query.offset) || 0;
  const total  = db.prepare('SELECT COUNT(*) as c FROM sessions').get().c;
  const query  = limit
    ? 'SELECT * FROM sessions ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM sessions ORDER BY date DESC, created_at DESC';
  const rows = limit
    ? db.prepare(query).all(limit, offset)
    : db.prepare(query).all();
  res.json({ sessions: rows.map(r => ({ ...r, items: JSON.parse(r.items) })), total });
});

app.post('/api/sessions', (req, res) => {
  const { date, duration, items } = req.body;
  if (!date || duration == null) return res.status(400).json({ error: 'date and duration required' });
  const stmt = db.prepare('INSERT INTO sessions (date, duration, items) VALUES (?, ?, ?)');
  const result = stmt.run(date, duration, JSON.stringify(items || []));
  res.json({ id: result.lastInsertRowid, date, duration, items: items || [] });
});

app.delete('/api/sessions/:id', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Practice Items
app.get('/api/items', (_req, res) => {
  res.json(db.prepare('SELECT * FROM practice_items ORDER BY name').all());
});

app.post('/api/items', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const result = db.prepare('INSERT INTO practice_items (name) VALUES (?)').run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch {
    res.status(409).json({ error: 'Item already exists' });
  }
});

app.delete('/api/items/:id', (req, res) => {
  db.prepare('DELETE FROM practice_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Exercises
app.get('/api/exercises', (_req, res) => {
  res.json(db.prepare('SELECT * FROM exercises ORDER BY type, name').all());
});

app.post('/api/exercises', (req, res) => {
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const result = db.prepare('INSERT INTO exercises (name, type) VALUES (?, ?)').run(name.trim(), (type || '').trim());
    res.json({ id: result.lastInsertRowid, name: name.trim(), type: (type || '').trim() });
  } catch {
    res.status(409).json({ error: 'Exercise already exists' });
  }
});

app.put('/api/exercises/:id', (req, res) => {
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    db.prepare('UPDATE exercises SET name = ?, type = ? WHERE id = ?').run(name.trim(), (type || '').trim(), req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Name already exists' });
  }
});

app.delete('/api/exercises/:id', (req, res) => {
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Last 7 logs per exercise (for the recent table)
app.get('/api/exercise-logs/recent', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, exercise_id, date, bpm, name, type FROM (
      SELECT el.id, el.exercise_id, el.date, el.bpm, e.name, e.type,
        ROW_NUMBER() OVER (
          PARTITION BY el.exercise_id
          ORDER BY el.date DESC, el.created_at DESC
        ) AS rn
      FROM exercise_logs el
      JOIN exercises e ON e.id = el.exercise_id
    ) WHERE rn <= 7
    ORDER BY type, name, date DESC, id DESC
  `).all();

  // Group into { exercise_id: { name, type, logs: [] } }
  const map = {};
  rows.forEach(r => {
    if (!map[r.exercise_id]) map[r.exercise_id] = { id: r.exercise_id, name: r.name, type: r.type, logs: [] };
    map[r.exercise_id].logs.push({ id: r.id, date: r.date, bpm: r.bpm });
  });
  res.json(Object.values(map));
});

// Exercise Logs
app.get('/api/exercise-logs', (req, res) => {
  const since = req.query.since || '';
  const rows = since
    ? db.prepare(`SELECT el.*, e.name, e.type FROM exercise_logs el JOIN exercises e ON e.id = el.exercise_id WHERE el.date >= ? ORDER BY el.date DESC, el.created_at DESC`).all(since)
    : db.prepare(`SELECT el.*, e.name, e.type FROM exercise_logs el JOIN exercises e ON e.id = el.exercise_id ORDER BY el.date DESC, el.created_at DESC`).all();
  res.json(rows);
});

app.post('/api/exercise-logs', (req, res) => {
  const { exercise_id, date, bpm } = req.body;
  if (!exercise_id || !date || bpm == null) return res.status(400).json({ error: 'exercise_id, date, bpm required' });
  const result = db.prepare('INSERT INTO exercise_logs (exercise_id, date, bpm) VALUES (?, ?, ?)').run(exercise_id, date, bpm);
  res.json({ id: result.lastInsertRowid, exercise_id, date, bpm });
});

app.delete('/api/exercise-logs/:id', (req, res) => {
  db.prepare('DELETE FROM exercise_logs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Guitar Practice running on http://localhost:${PORT}`));
