const Database = require('better-sqlite3');

function createDb(file = process.env.DB_FILE || 'catalogo.db') {
  const db = new Database(file);
  db.exec(`CREATE TABLE IF NOT EXISTS muebles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    precio REAL NOT NULL CHECK (precio >= 0),
    stock INTEGER NOT NULL DEFAULT 0,
    imagen TEXT
  )`);
  return db;
}

module.exports = { createDb };
