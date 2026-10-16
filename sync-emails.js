/**
 * sync-emails.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Synchronisation instantanée bidirectionnelle Locale ↔ Render
 * + Envoi automatique et immédiat des emails de confirmation (via Gmail)
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
  getAdhesionByEmail,
  getAllAdhesions,
  markEmailSent,
  getPendingEmailAdhesions
} = require('./db');

const { sendWelcomeEmail } = require('./mailer');

// ── Configuration ────────────────────────────────────────────────────────────
const RENDER_URL       = (process.env.RENDER_URL || '').replace(/\/$/, '');
const ADMIN_KEY        = process.env.ADMIN_KEY || '';
const SYNC_INTERVAL_MS = 5 * 1000; // Vérification ultra-rapide toutes les 5 secondes

if (!RENDER_URL) {
  console.error('❌ RENDER_URL non défini dans .env.');
  process.exit(1);
}

// ── Fonction utilitaire : GET HTTP/HTTPS ──────────────────────────────────────
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
        catch (e) { reject(new Error('Réponse non-JSON : ' + body.slice(0, 200))); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout réseau')); });
    req.on('error', reject);
    req.end();
  });
}

// ── Fonction utilitaire : POST HTTP/HTTPS ─────────────────────────────────────
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

let isSyncing = false;
let lastHeartbeat = 0;

// ── Cycle principal de synchronisation ───────────────────────────────────────
async function syncAndSendEmails() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const now = new Date().toLocaleTimeString('fr-FR');

    // 1. Récupération des adhésions depuis Render
    const apiUrl = `${RENDER_URL}/api/adhesions${ADMIN_KEY ? '?key=' + encodeURIComponent(ADMIN_KEY) : ''}`;
    const resp = await fetchJson(apiUrl);

    if (resp.status === 401) {
      console.error(`[Sync] ❌ Accès refusé (401) — Vérifiez ADMIN_KEY dans .env`);
      isSyncing = false;
      return;
    }
    if (resp.status !== 200 || !resp.data || !Array.isArray(resp.data.data)) {
      console.error(`[Sync] ❌ Réponse inattendue de Render (HTTP ${resp.status})`);
      isSyncing = false;
      return;
    }

    const renderData = resp.data.data;
    const renderEmailSet = new Set(renderData.map(p => (p.email || '').trim().toLowerCase()));

    // 2. Render ➔ Local : insérer les nouveaux inscrits absents en local
    let newFromRender = 0;
    for (const person of renderData) {
      if (!person.email) continue;
      const existing = getAdhesionByEmail(person.email.trim().toLowerCase());
      if (!existing) {
        try {
          insertAdhesion({
            nom       : person.nom       || '',
            prenom    : person.prenom    || '',
            email     : person.email     || '',
            telephone : person.telephone || '',
            niveau    : person.niveau    || '',
            filiere   : person.filiere   || '',
            annee     : person.annee     || '',
            motivation: person.motivation || '',
            interets  : person.interets  || '',
            source    : person.source    || '',
          });
          newFromRender++;
          console.log(`[Sync Render ➔ Local] ➕ Nouvel inscrit importé : ${person.prenom} ${person.nom} (${person.email})`);
        } catch (err) {
          console.error(`[Sync] ⚠️ Erreur insertion locale pour ${person.email} :`, err.message);
        }
      }
    }

    // 3. Local ➔ Render : envoyer les personnes présentes en local mais absentes sur Render
    const localData = getAllAdhesions();
    let newToRender = 0;
    for (const person of localData) {
      const emailLower = (person.email || '').trim().toLowerCase();
      if (!emailLower || renderEmailSet.has(emailLower)) continue;

      try {
        const postResp = await postJson(`${RENDER_URL}/api/adhesions`, {
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
        });
        if (postResp.status === 201 || postResp.status === 200 || postResp.status === 409) {
          newToRender++;
          renderEmailSet.add(emailLower);
          console.log(`[Sync Local ➔ Render] 🚀 Synchronisé vers Render : ${person.prenom} ${person.nom} (${person.email})`);
        }
      } catch (err) {
        // En cas d'échec ponctuel (ex: connexion), sera retenté au prochain cycle
      }
    }

    // 4. Envoi automatique des mails aux personnes en attente (email_sent = 0)
    const pending = getPendingEmailAdhesions();
    if (pending.length > 0) {
      console.log(`[Email] 📋 ${pending.length} personne(s) en attente de confirmation. Envoi en cours...`);
      for (const person of pending) {
        try {
          const emailRes = await sendWelcomeEmail({
            prenom: person.prenom,
            nom   : person.nom,
            email : person.email,
          });
          if (emailRes && emailRes.success) {
            markEmailSent(person.id);
            console.log(`[Email] ✅ Flyer envoyé avec succès à ${person.email} (ID #${person.id}) ✉️`);
          } else {
            console.error(`[Email] ⚠️ Échec envoi à ${person.email} :`, emailRes ? emailRes.error : 'inconnu');
          }
        } catch (err) {
          console.error(`[Email] ❌ Erreur lors de l'envoi à ${person.email} :`, err.message);
        }
        await new Promise(r => setTimeout(r, 600)); // Pause anti rate-limiting
      }
    }

    // Heartbeat discret toutes les 30s si aucune action
    const nowMs = Date.now();
    if (newFromRender > 0 || newToRender > 0) {
      console.log(`[${now}] ⚡ Sync instantanée terminée : +${newFromRender} local, +${newToRender} Render.`);
    } else if (nowMs - lastHeartbeat >= 30000) {
      console.log(`[${now}] 🟢 En veille active : les 2 bases sont parfaitement synchronisées (${localData.length} inscrits).`);
      lastHeartbeat = nowMs;
    }

  } catch (err) {
    console.error(`[Sync] ⚠️ Problème de connexion avec Render :`, err.message);
  } finally {
    isSyncing = false;
  }
}

// ── Démarrage ────────────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   ARSII IIT — Synchronisation Instantanée & Rapide ⚡    ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`📡 URL Render   : ${RENDER_URL}`);
console.log(`⚡ Fréquence    : Toutes les 5 secondes (temps réel)`);
console.log(`💾 Stockage     : Local (SQLite + JSON + CSV) ↔ Render`);
console.log(`✉️  Emails      : Envoi automatique et immédiat`);
console.log('────────────────────────────────────────────────────────────\n');

// Premier cycle immédiat
syncAndSendEmails();

// Cycles continus toutes les 5 secondes
setInterval(syncAndSendEmails, SYNC_INTERVAL_MS);
