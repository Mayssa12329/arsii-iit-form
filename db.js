const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'adhesions.db');
const JSON_BACKUP_PATH = path.join(DATA_DIR, 'adhesions.json');
const CSV_BACKUP_PATH = path.join(DATA_DIR, 'adhesions.csv');
const SCRIPT_EXCEL_PATH = path.join(__dirname, 'generate_excel.py');

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
    source TEXT,
    email_sent INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_adhesions_email ON adhesions(email);
`);

// Migration : ajouter la colonne email_sent si elle n'existe pas encore
try {
  db.exec('ALTER TABLE adhesions ADD COLUMN email_sent INTEGER DEFAULT 0;');
  console.log('[DB] Colonne email_sent ajoutée avec succès.');
} catch (e) {
  // La colonne existe déjà, c'est normal
}

// Garantir que TOUT email stocké dans la base sans confirmation confirmée (email_sent != 1) est mis en attente d'envoi
try {
  const resetRes = db.prepare('UPDATE adhesions SET email_sent = 0 WHERE email_sent != 1 OR email_sent IS NULL').run();
  if (resetRes.changes > 0) {
    console.log(`[DB] 🔄 ${resetRes.changes} email(s) sans confirmation remis en attente d'envoi immédiat.`);
    syncJsonBackup();
    syncCsvBackup();
    syncExcelBackup();
  }
} catch (e) {}

function syncJsonBackup() {
  try {
    const rows = getAllAdhesions();
    fs.writeFileSync(JSON_BACKUP_PATH, JSON.stringify(rows, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erreur lors de la sauvegarde JSON :', err);
  }
}


function syncCsvBackup() {
  try {
    const csv = exportCSV();
    fs.writeFileSync(CSV_BACKUP_PATH, csv, 'utf-8');
  } catch (err) {
    console.error('Erreur lors de la sauvegarde CSV :', err);
  }
}

let excelSyncTimer = null;
let isExcelRunning = false;
let pendingExcelRun = false;

function syncExcelBackup() {
  if (excelSyncTimer) clearTimeout(excelSyncTimer);
  excelSyncTimer = setTimeout(() => {
    runExcelGenerator();
  }, 400);
}

function runExcelGenerator() {
  if (isExcelRunning) {
    pendingExcelRun = true;
    return;
  }
  isExcelRunning = true;

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(pythonCmd, [SCRIPT_EXCEL_PATH], {
    cwd: __dirname,
    stdio: 'ignore',
    windowsHide: true,
  });

  child.on('error', (err) => {
    isExcelRunning = false;
    if (pendingExcelRun) {
      pendingExcelRun = false;
      syncExcelBackup();
    }
  });

  child.on('exit', (code) => {
    isExcelRunning = false;
    if (code === 0) {
      console.log('[Excel Sync] 📊 Fichier Excel adhesions_arsii.xlsx synchronisé automatiquement.');
    }
    if (pendingExcelRun) {
      pendingExcelRun = false;
      syncExcelBackup();
    }
  });
}

function insertAdhesion(data) {
  const stmt = db.prepare(`
    INSERT INTO adhesions (
      created_at, nom, prenom, email, telephone,
      niveau, filiere, annee, motivation, interets, source, email_sent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdAt = data.created_at || new Date().toISOString();
  const emailSent = (data.email_sent !== undefined && data.email_sent !== null) ? Number(data.email_sent) : 0;
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
    data.source || '',
    emailSent
  );

  syncJsonBackup();
  syncCsvBackup();
  syncExcelBackup();

  return {
    id: info.lastInsertRowid,
    created_at: createdAt,
  };
}

function cleanPhone(phone) {
  if (!phone) return '';
  return String(phone)
    .replace(/[\s.\-()]/g, '')
    .replace(/^(\+|00)216/, '')
    .trim();
}

function getAdhesionByPhone(phone) {
  const target = cleanPhone(phone);
  if (!target) return null;
  const rows = getAllAdhesions();
  return rows.find(r => cleanPhone(r.telephone) === target) || null;
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
  syncCsvBackup();
  syncExcelBackup();
}

function deleteAdhesionByEmail(email) {
  if (!email) return;
  const stmt = db.prepare('DELETE FROM adhesions WHERE LOWER(email) = ?');
  stmt.run(email.trim().toLowerCase());
  syncJsonBackup();
  syncCsvBackup();
  syncExcelBackup();
}

function clearAllAdhesions() {
  db.exec('DELETE FROM adhesions;');
  try {
    db.exec("DELETE FROM sqlite_sequence WHERE name='adhesions';");
  } catch (e) {}
  syncJsonBackup();
  syncCsvBackup();
  syncExcelBackup();
}

function saveOrUpdateAdhesion(data) {
  const cleanEmail = data.email.trim().toLowerCase();
  const existing = getAdhesionByEmail(cleanEmail);
  if (existing) {
    const updatedAt = data.created_at || new Date().toISOString();
    const emailSent = (data.email_sent !== undefined && data.email_sent !== null)
      ? Number(data.email_sent)
      : existing.email_sent;
    const stmt = db.prepare(`
      UPDATE adhesions SET
        nom = ?, prenom = ?, telephone = ?, niveau = ?, filiere = ?, annee = ?,
        motivation = ?, interets = ?, source = ?, created_at = ?, email_sent = ?
      WHERE id = ?
    `);
    stmt.run(
      data.nom,
      data.prenom,
      data.telephone,
      data.niveau,
      data.filiere,
      data.annee,
      data.motivation || '',
      data.interets || '',
      data.source || '',
      updatedAt,
      emailSent,
      existing.id
    );
    syncJsonBackup();
    syncCsvBackup();
    syncExcelBackup();
    return { id: existing.id, isUpdate: true, created_at: updatedAt };
  } else {
    const res = insertAdhesion(data);
    return { id: res.id, isUpdate: false, created_at: res.created_at };
  }
}

function getPendingEmailAdhesions() {
  const stmt = db.prepare('SELECT * FROM adhesions WHERE email_sent != 1 OR email_sent IS NULL ORDER BY id ASC');
  return stmt.all();
}

function markEmailSent(id) {
  const stmt = db.prepare('UPDATE adhesions SET email_sent = 1 WHERE id = ?');
  stmt.run(id);
  syncJsonBackup();
  syncCsvBackup();
  syncExcelBackup();
}

function markEmailSending(id) {
  try {
    const stmt = db.prepare('UPDATE adhesions SET email_sent = 2 WHERE id = ?');
    stmt.run(id);
  } catch (e) {}
}

function resetEmailPending(id) {
  try {
    const stmt = db.prepare('UPDATE adhesions SET email_sent = 0 WHERE id = ?');
    stmt.run(id);
  } catch (e) {}
}

module.exports = {
  db,
  insertAdhesion,
  saveOrUpdateAdhesion,
  cleanPhone,
  getAdhesionByPhone,
  getAdhesionByEmail,
  getAllAdhesions,
  getPendingEmailAdhesions,
  markEmailSent,
  markEmailSending,
  resetEmailPending,
  deleteAdhesionById,
  deleteAdhesionByEmail,
  clearAllAdhesions,
  exportCSV,
  syncExcelBackup,
};

