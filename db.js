const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'adhesions.db');
const JSON_BACKUP_PATH = path.join(DATA_DIR, 'adhesions.json');

const db = new DatabaseSync(DB_PATH);

// Initialisation de la table des adhésions
db.exec(`
  CREATE TABLE IF NOT EXISTS adhesions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT NOT NULL,
    telephone TEXT NOT NULL,
    niveau TEXT NOT NULL,
    filiere TEXT NOT NULL,
    annee TEXT NOT NULL,
    motivation TEXT,
    interets TEXT,
    source TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_adhesions_email ON adhesions(email);
`);

function syncJsonBackup() {
  try {
    const rows = getAllAdhesions();
    fs.writeFileSync(JSON_BACKUP_PATH, JSON.stringify(rows, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur lors de la sauvegarde JSON :', err);
  }
}

function insertAdhesion(data) {
  const stmt = db.prepare(`
    INSERT INTO adhesions (
      created_at, nom, prenom, email, telephone,
      niveau, filiere, annee, motivation, interets, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdAt = new Date().toISOString();
  const info = stmt.run(
    createdAt,
    data.nom,
    data.prenom,
    data.email.toLowerCase(),
    data.telephone,
    data.niveau,
    data.filiere,
    data.annee,
    data.motivation || '',
    data.interets || '',
    data.source || ''
  );

  syncJsonBackup();

  return {
    id: info.lastInsertRowid,
    created_at: createdAt,
  };
}

function getAdhesionByEmail(email) {
  const stmt = db.prepare('SELECT * FROM adhesions WHERE email = ? LIMIT 1');
  return stmt.get(email.toLowerCase());
}

function getAllAdhesions() {
  const stmt = db.prepare('SELECT * FROM adhesions ORDER BY id DESC');
  return stmt.all();
}

function exportCSV() {
  const rows = getAllAdhesions();
  const headers = ['ID', 'Date', 'Nom', 'Prénom', 'Email', 'Téléphone', 'Niveau', 'Filière', 'Année', 'Motivation', 'Centres d’intérêt', 'Source'];

  const escapeField = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const csvLines = [headers.join(';')];
  for (const r of rows) {
    csvLines.push([
      r.id,
      r.created_at,
      escapeField(r.nom),
      escapeField(r.prenom),
      escapeField(r.email),
      escapeField(r.telephone),
      escapeField(r.niveau),
      escapeField(r.filiere),
      escapeField(r.annee),
      escapeField(r.motivation),
      escapeField(r.interets),
      escapeField(r.source),
    ].join(';'));
  }

  // UTF-8 BOM pour Excel
  return '\uFEFF' + csvLines.join('\r\n');
}

function deleteAdhesionById(id) {
  const stmt = db.prepare('DELETE FROM adhesions WHERE id = ?');
  stmt.run(id);
  syncJsonBackup();
}

function clearAllAdhesions() {
  db.exec('DELETE FROM adhesions;');
  try {
    db.exec("DELETE FROM sqlite_sequence WHERE name='adhesions';");
  } catch (e) {}
  syncJsonBackup();
}

module.exports = {
  db,
  insertAdhesion,
  getAdhesionByEmail,
  getAllAdhesions,
  deleteAdhesionById,
  clearAllAdhesions,
  exportCSV,
};

