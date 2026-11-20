// db.js — SQLite database wrapper using sql.js
let SQL = null;
let db = null;

import initSqlJs from 'sql.js'
import sqliteUrl from "sql.js/dist/sql-wasm.wasm?url";

export async function initDB() {
  SQL = await initSqlJs({ locateFile: () => sqliteUrl });

  const saved = await loadFromIndexedDB();
  db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();
  initSchema();
  
  // Expose for direct access
  window.db = {
    sql,
    run,
    one,
    persist,
    getDB: () => db,
    setDB: (newDb) => { db = newDb; }
  };
}

function initSchema() {
  db.run(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS customers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,is_self INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'В процессе',created_at TEXT NOT NULL,shipped_at TEXT,box_weight_g INTEGER,shipping_cost REAL);
    CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,customer_id INTEGER NOT NULL,name TEXT NOT NULL,track TEXT,price REAL NOT NULL DEFAULT 0,weight_g INTEGER,status TEXT NOT NULL DEFAULT 'Ожидает взвешивания',notes TEXT,created_at TEXT NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(customer_id) REFERENCES customers(id));
    CREATE INDEX IF NOT EXISTS idx_items_track ON items(track);
    CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_id);
  `);
}

function loadFromIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('parcel-local-db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('db');
    req.onsuccess = () => {
      const r = req.result.transaction('db').objectStore('db').get('sqlite');
      r.onsuccess = () => { req.result.close(); resolve(r.result || null); };
      r.onerror = () => reject(r.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function persist() {
  const bytes = db.export();
  const blob = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('parcel-local-db', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('db');
    req.onsuccess = () => {
      const tx = req.result.transaction('db', 'readwrite');
      tx.objectStore('db').put(blob, 'sqlite');
      tx.oncomplete = () => { req.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

export function sql(query, args = []) {
  const stmt = db.prepare(query);
  stmt.bind(args);
  const out = [];
  while (stmt.step()) out.push(stmt.getAsObject());
  stmt.free();
  return out;
}

export function run(query, args = []) {
  db.run(query, args);
}

export function one(query, args = []) {
  return sql(query, args)[0] || null;
}

export { SQL };