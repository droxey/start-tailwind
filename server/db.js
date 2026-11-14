// SQLite through Node's built-in node:sqlite. One file on disk, no ORM, no npm dependency.

import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'unknown',
  condition TEXT,
  marketplaces TEXT NOT NULL DEFAULT '["ebay"]',
  status TEXT NOT NULL DEFAULT 'draft',
  confidence REAL NOT NULL DEFAULT 0,
  human_reviewed INTEGER NOT NULL DEFAULT 0,
  price_mid REAL,
  price_fast REAL,
  price_choice TEXT NOT NULL DEFAULT 'mid',
  suggested_price REAL,
  asking_price REAL,
  original_asking REAL,
  floor_price REAL,
  fulfilment TEXT NOT NULL DEFAULT 'ship',
  privacy_flags TEXT NOT NULL DEFAULT '[]',
  questions TEXT NOT NULL DEFAULT '[]',
  listed_at TEXT,
  auto_cuts INTEGER NOT NULL DEFAULT 0,
  last_price_cut_at TEXT,
  sold_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  flags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft',
  payload TEXT NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (item_id, marketplace)
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL DEFAULT 'ebay',
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  marketplace TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'ship',
  price REAL NOT NULL,
  fees REAL NOT NULL DEFAULT 0,
  postage REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL,
  sold_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'logged',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  keys TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS queue_status ON queue(status);
CREATE INDEX IF NOT EXISTS activity_item ON activity(item_id);
CREATE INDEX IF NOT EXISTS messages_item ON messages(item_id);
`;

const JSON_FIELDS = {
  items: ["marketplaces", "privacy_flags", "questions"],
  listings: ["payload"],
  queue: ["payload"],
  messages: ["flags"],
  photos: ["flags"],
  push_subscriptions: ["keys"],
};

export function openDb(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

const parseRow = (table, row) => {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS[table] ?? []) {
    try {
      out[f] = JSON.parse(out[f]);
    } catch {
      out[f] = null;
    }
  }
  return out;
};

const toParam = (v) =>
  v === undefined ? null : typeof v === "object" && v !== null ? JSON.stringify(v) : v;

// Small helpers so callers never build SQL from user input. Column names come only from
// fixed allow-lists in the service layer.
export function repo(db) {
  return {
    all: (table, where = "1=1", params = []) =>
      db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(...params).map((r) => parseRow(table, r)),
    get: (table, id) => parseRow(table, db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)),
    insert(table, data) {
      const cols = Object.keys(data);
      const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      return Number(db.prepare(sql).run(...cols.map((c) => toParam(data[c]))).lastInsertRowid);
    },
    update(table, id, data) {
      const cols = Object.keys(data);
      if (!cols.length) return;
      const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...cols.map((c) => toParam(data[c])), id);
    },
    remove: (table, id) => db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id),
    setting(key, fallback) {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
      return row ? JSON.parse(row.value) : fallback;
    },
    setSetting: (key, value) =>
      db
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run(key, JSON.stringify(value)),
    tx(fn) {
      db.exec("BEGIN");
      try {
        const out = fn();
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
