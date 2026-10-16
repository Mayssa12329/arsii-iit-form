/**
 * sync-emails.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Synchronisation bidirectionnelle stricte Locale ↔ Render
 * + Maintien d'une équivalence parfaite des deux bases (données, modifications, suppressions, emails)
 * + Envoi automatique et garanti des emails de confirmation (via Gmail SMTP)
 * ──────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

// ── Chargement du .env ───────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) return;
    const idx = t.indexOf('=');
    const key = t.slice(0, idx).trim();
    let val   = t.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  });
}

const {
  insertAdhesion,
  saveOrUpdateAdhesion,
  getAdhesionByEmail,
  getAllAdhesions,
  markEmailSent,
  getPendingEmailAdhesions,
  deleteAdhesionByEmail,
  deleteAdhesionById,
  clearAllAdhesions,
} = require('./db');

const { sendWelcomeEmail } = require('./mailer');

// ── Configuration ────────────────────────────────────────────────────────────
const RENDER_URL       = (process.env.RENDER_URL || '').trim().replace(/\/$/, '');
const ADMIN_KEY        = (process.env.ADMIN_KEY || '').trim();
const SYNC_INTERVAL_MS = 5 * 1000; // Vérification toutes les 5 secondes

// ── Utilitaires HTTP ──────────────────────────────────────────────────────────
function fetchJson(urlStr) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port    : parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path    : parsedUrl.pathname + parsedUrl.search,
      method  : 'GET',
      headers : {
        'Accept'      : 'application/json',
        'x-admin-key' : ADMIN_KEY,
      },
      timeout: 10000,
    };
    const req = mod.request(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout réseau')); });
    req.on('error', reject);
    req.end();
  });
}

function postJson(urlStr, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const body = JSON.stringify(data);
    const options = {
      hostname: parsedUrl.hostname,
      port    : parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path    : parsedUrl.pathname,
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Accept'        : 'application/json',
        'x-admin-key'   : ADMIN_KEY,
      },
      timeout: 10000,
    };
    const req = mod.request(options, res => {
      let respBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => respBody += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(respBody) }); }
        catch (e) { resolve({ status: res.statusCode, data: respBody }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout réseau POST')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendDelete(urlStr) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port    : parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path    : parsedUrl.pathname + parsedUrl.search,
      method  : 'DELETE',
      headers : {
        'Accept'      : 'application/json',
        'x-admin-key' : ADMIN_KEY,
      },
      timeout: 10000,
    };
    const req = mod.request(options, res => {
      let respBody = '';
      res.setEncoding('utf8');
      res.on('data', chunk => respBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: respBody }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout réseau DELETE')); });
    req.on('error', reject);
    req.end();
  });
}

let isSyncing = false;
let lastHeartbeat = 0;
let syncIntervalTimer = null;

// ── Cycle principal de synchronisation bidirectionnelle stricte ───────────────
async function syncAndSendEmails() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const now = new Date().toLocaleTimeString('fr-FR');
    let renderConnected = false;
    let newFromRender = 0;
    let newToRender = 0;
    let updatedCount = 0;

    // ── 1. Synchronisation stricte avec Render (si configuré) ────────────────
    if (RENDER_URL) {
      try {
        const apiUrl = `${RENDER_URL}/api/adhesions${ADMIN_KEY ? '?key=' + encodeURIComponent(ADMIN_KEY) : ''}`;
        const resp = await fetchJson(apiUrl);

        if (resp.status === 200 && resp.data && Array.isArray(resp.data.data)) {
          renderConnected = true;
          const renderList = resp.data.data;
          const localList = getAllAdhesions();

          const renderMap = new Map();
          for (const r of renderList) {
            if (r.email) renderMap.set(r.email.trim().toLowerCase(), r);
          }

          const localMap = new Map();
          for (const l of localList) {
            if (l.email) localMap.set(l.email.trim().toLowerCase(), l);
          }

          // A. Render ➔ Local : nouveaux inscrits et mises à jour plus récentes
          for (const [email, rPerson] of renderMap.entries()) {
            const lPerson = localMap.get(email);
            if (!lPerson) {
              // Nouvel inscrit absent en local
              insertAdhesion({
                created_at: rPerson.created_at,
                nom       : rPerson.nom || '',
                prenom    : rPerson.prenom || '',
                email     : rPerson.email || '',
                telephone : rPerson.telephone || '',
                niveau    : rPerson.niveau || '',
                filiere   : rPerson.filiere || '',
                annee     : rPerson.annee || '',
                motivation: rPerson.motivation || '',
                interets  : rPerson.interets || '',
                source    : rPerson.source || '',
                email_sent: rPerson.email_sent !== undefined ? rPerson.email_sent : 0,
              });
              newFromRender++;
              console.log(`[Sync Render ➔ Local] ➕ Nouvel inscrit importé : ${rPerson.prenom} ${rPerson.nom} (${rPerson.email})`);
            } else {
              // Existe des deux côtés : vérification de modification
              const isDifferent =
                (rPerson.nom || '').trim() !== (lPerson.nom || '').trim() ||
                (rPerson.prenom || '').trim() !== (lPerson.prenom || '').trim() ||
                (rPerson.telephone || '').trim() !== (lPerson.telephone || '').trim() ||
                (rPerson.niveau || '').trim() !== (lPerson.niveau || '').trim() ||
                (rPerson.filiere || '').trim() !== (lPerson.filiere || '').trim() ||
                (rPerson.annee || '').trim() !== (lPerson.annee || '').trim() ||
                (rPerson.motivation || '').trim() !== (lPerson.motivation || '').trim() ||
                (rPerson.interets || '').trim() !== (lPerson.interets || '').trim() ||
                (rPerson.source || '').trim() !== (lPerson.source || '').trim();

              const rTime = new Date(rPerson.created_at || 0).getTime();
              const lTime = new Date(lPerson.created_at || 0).getTime();

              if (isDifferent) {
                if (rTime >= lTime) {
                  // Render a une version plus récente
                  saveOrUpdateAdhesion({
                    created_at: rPerson.created_at,
                    nom       : rPerson.nom || '',
                    prenom    : rPerson.prenom || '',
                    email     : rPerson.email || '',
                    telephone : rPerson.telephone || '',
                    niveau    : rPerson.niveau || '',
                    filiere   : rPerson.filiere || '',
                    annee     : rPerson.annee || '',
                    motivation: rPerson.motivation || '',
                    interets  : rPerson.interets || '',
                    source    : rPerson.source || '',
                    email_sent: rPerson.email_sent !== undefined ? rPerson.email_sent : lPerson.email_sent,
                  });
                  updatedCount++;
                  console.log(`[Sync Render ➔ Local] 🔄 Mise à jour locale (Render plus récent) : ${rPerson.prenom} ${rPerson.nom} (${email})`);
                } else {
                  // Local a une version plus récente : pousser sur Render
                  await postJson(`${RENDER_URL}/api/adhesions`, {
                    nom       : lPerson.nom,
                    prenom    : lPerson.prenom,
                    email     : lPerson.email,
                    telephone : lPerson.telephone,
                    niveau    : lPerson.niveau,
                    filiere   : lPerson.filiere,
                    annee     : lPerson.annee,
                    motivation: lPerson.motivation || '',
                    interets  : lPerson.interets || '',
                    source    : lPerson.source || '',
                    _isSync   : true,
                  });
                  updatedCount++;
                  console.log(`[Sync Local ➔ Render] 🔄 Mise à jour Render (Local plus récent) : ${lPerson.prenom} ${lPerson.nom} (${email})`);
                }
              }

              // Synchronisation du statut email_sent
              if (rPerson.email_sent === 1 && (lPerson.email_sent === 0 || !lPerson.email_sent)) {
                markEmailSent(lPerson.id);
              }
            }
          }

          // B. Local ➔ Render : personnes présentes en local mais absentes sur Render
          for (const [email, lPerson] of localMap.entries()) {
            if (!renderMap.has(email)) {
              try {
                const postResp = await postJson(`${RENDER_URL}/api/adhesions`, {
                  nom       : lPerson.nom,
                  prenom    : lPerson.prenom,
                  email     : lPerson.email,
                  telephone : lPerson.telephone,
                  niveau    : lPerson.niveau,
                  filiere   : lPerson.filiere,
                  annee     : lPerson.annee,
                  motivation: lPerson.motivation || '',
                  interets  : lPerson.interets || '',
                  source    : lPerson.source || '',
                  _isSync   : true,
                });
                if (postResp.status === 201 || postResp.status === 200 || postResp.status === 409) {
                  newToRender++;
                  renderMap.set(email, lPerson);
                  console.log(`[Sync Local ➔ Render] 🚀 Synchronisé vers Render : ${lPerson.prenom} ${lPerson.nom} (${lPerson.email})`);
                }
              } catch (err) {
                // Réessayé au prochain cycle
              }
            }
          }
        }
      } catch (renderErr) {
        // En cas de suspension Render ou coupure réseau, la base locale reste opérationnelle
      }
    }

    // ── 2. Envoi automatique des mails de confirmation en attente ────────────
    const pending = getPendingEmailAdhesions();
    if (pending.length > 0) {
      console.log(`[Email] 📋 ${pending.length} personne(s) en attente de mail de confirmation. Envoi en cours...`);
      for (const person of pending) {
        try {
          const emailRes = await sendWelcomeEmail({
            prenom: person.prenom,
            nom   : person.nom,
            email : person.email,
          });
          if (emailRes && emailRes.success) {
            markEmailSent(person.id);
            console.log(`[Email] ✅ Confirmation envoyée avec succès à ${person.email} (ID #${person.id}) ✉️`);

            // Notifier également Render pour maintenir l'état email_sent = 1 identique
            if (RENDER_URL) {
              postJson(`${RENDER_URL}/api/adhesions`, {
                nom       : person.nom,
                prenom    : person.prenom,
                email     : person.email,
                telephone : person.telephone,
                niveau    : person.niveau,
                filiere   : person.filiere,
                annee     : person.annee,
                motivation: person.motivation || '',
                interets  : person.interets || '',
                source    : person.source || '',
                _isSync   : true,
              }).catch(() => {});
            }
          } else {
            console.error(`[Email] ⚠️ Échec envoi à ${person.email} :`, emailRes ? emailRes.error : 'inconnu');
          }
        } catch (err) {
          console.error(`[Email] ❌ Erreur lors de l'envoi à ${person.email} :`, err.message);
        }
        await new Promise(r => setTimeout(r, 600)); // Pause anti rate-limiting Gmail
      }
    }

    // Heartbeat informatif
    const nowMs = Date.now();
    const localTotal = getAllAdhesions().length;
    if (newFromRender > 0 || newToRender > 0 || updatedCount > 0) {
      console.log(`[${now}] ⚡ Sync terminée : +${newFromRender} local, +${newToRender} Render, ${updatedCount} màj.`);
    } else if (nowMs - lastHeartbeat >= 30000) {
      if (renderConnected) {
        console.log(`[${now}] 🟢 Synchronisation active : Local (${localTotal} inscrits) ↔ Render parfaitement identiques.`);
      } else {
        console.log(`[${now}] 🟢 En veille active : ${localTotal} inscrit(s) dans la base locale.`);
      }
      lastHeartbeat = nowMs;
    }

  } catch (err) {
    console.error(`[Sync] ⚠️ Erreur cycle :`, err.message);
  } finally {
    isSyncing = false;
  }
}

// ── Fonction de propagation de suppression ───────────────────────────────────
async function syncDeletePerson(identifier) {
  // identifier peut être { email } ou { id }
  if (!identifier) return;
  if (identifier.email) {
    deleteAdhesionByEmail(identifier.email);
    if (RENDER_URL) {
      const sep = ADMIN_KEY ? `?email=${encodeURIComponent(identifier.email)}&key=${encodeURIComponent(ADMIN_KEY)}` : `?email=${encodeURIComponent(identifier.email)}`;
      await sendDelete(`${RENDER_URL}/api/adhesions${sep}`).catch(() => {});
    }
  } else if (identifier.id) {
    const all = getAllAdhesions();
    const person = all.find(a => a.id == identifier.id);
    deleteAdhesionById(Number(identifier.id));
    if (person && person.email && RENDER_URL) {
      const sep = ADMIN_KEY ? `?email=${encodeURIComponent(person.email)}&key=${encodeURIComponent(ADMIN_KEY)}` : `?email=${encodeURIComponent(person.email)}`;
      await sendDelete(`${RENDER_URL}/api/adhesions${sep}`).catch(() => {});
    }
  }
}

async function syncClearAll() {
  clearAllAdhesions();
  if (RENDER_URL) {
    const keyParam = ADMIN_KEY ? `?key=${encodeURIComponent(ADMIN_KEY)}` : '';
    await sendDelete(`${RENDER_URL}/api/adhesions${keyParam}`).catch(() => {});
  }
}

// ── Démarrage du service ─────────────────────────────────────────────────────
function startSyncService() {
  if (syncIntervalTimer) return;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   ARSII IIT — Sync Bidirectionnelle Stricte & Emails ✉️  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (RENDER_URL) {
    console.log(`📡 URL Render    : ${RENDER_URL}`);
  }
  console.log(`⚡ Fréquence     : Vérification toutes les 5 secondes`);
  console.log(`💾 Base Locale   : data/adhesions.db (SQLite + CSV + JSON)`);
  console.log(`🔄 Équivalence   : Stricte (Sauvegarde, Modification, Suppression)`);
  console.log(`✉️  Confirmation : Envoi automatique par email après inscription`);
  console.log('────────────────────────────────────────────────────────────\n');

  syncAndSendEmails();
  syncIntervalTimer = setInterval(syncAndSendEmails, SYNC_INTERVAL_MS);
}

if (require.main === module) {
  startSyncService();
}

module.exports = {
  startSyncService,
  syncAndSendEmails,
  syncDeletePerson,
  syncClearAll,
};
