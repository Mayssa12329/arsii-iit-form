/**
 * sync-emails.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Synchronisation locale ↔ Render + envoi automatique des mails de confirmation
 *
 * Ce script tourne en local (node sync-emails.js) et :
 *  1. Récupère toutes les adhésions depuis la base Render (via l'API)
 *  2. Pour chaque nouveau inscrit absent de la base locale → l'insère localement
 *  3. Envoie le flyer de confirmation aux personnes qui n'en ont pas encore reçu
 *  4. Marque email_sent = 1 après chaque envoi réussi
 *  5. Répète la vérification toutes les SYNC_INTERVAL_MS millisecondes
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

const { insertAdhesion, getAdhesionByEmail, markEmailSent, getPendingEmailAdhesions } = require('./db');
const { sendWelcomeEmail } = require('./mailer');

// ── Configuration ────────────────────────────────────────────────────────────
const RENDER_URL       = (process.env.RENDER_URL || '').replace(/\/$/, '');
const ADMIN_KEY        = process.env.ADMIN_KEY || '';
const SYNC_INTERVAL_MS = 2 * 60 * 1000; // Vérification toutes les 2 minutes

if (!RENDER_URL) {
  console.error('❌ RENDER_URL non défini dans .env. Veuillez renseigner l\'URL de votre app Render.');
  process.exit(1);
}

// ── Fonction utilitaire : requête HTTP/HTTPS ─────────────────────────────────
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
      timeout: 15000,
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

// ── Cycle principal de synchronisation ───────────────────────────────────────
async function syncAndSendEmails() {
  const now = new Date().toLocaleTimeString('fr-FR');
  console.log(`\n[${now}] 🔄 Début de la synchronisation avec Render...`);

  // 1. Récupération des adhésions depuis Render
  let renderData;
  try {
    const apiUrl = `${RENDER_URL}/api/adhesions${ADMIN_KEY ? '?key=' + encodeURIComponent(ADMIN_KEY) : ''}`;
    const resp   = await fetchJson(apiUrl);

    if (resp.status === 401) {
      console.error(`[Sync] ❌ Accès refusé (401) — Vérifiez ADMIN_KEY dans .env`);
      return;
    }
    if (resp.status !== 200 || !resp.data || !Array.isArray(resp.data.data)) {
      console.error(`[Sync] ❌ Réponse inattendue (HTTP ${resp.status}):`, JSON.stringify(resp.data).slice(0, 300));
      return;
    }
    renderData = resp.data.data;
    console.log(`[Sync] ✅ ${renderData.length} personne(s) trouvée(s) sur Render.`);
  } catch (err) {
    console.error(`[Sync] ❌ Impossible de joindre Render : ${err.message}`);
    return;
  }

  // 2. Insertion locale des nouveaux inscrits absents de la base locale
  let newCount = 0;
  for (const person of renderData) {
    if (!person.email) continue;
    const existing = getAdhesionByEmail(person.email.trim().toLowerCase());
    if (!existing) {
      try {
        insertAdhesion({
          nom      : person.nom       || '',
          prenom   : person.prenom    || '',
          email    : person.email     || '',
          telephone: person.telephone || '',
          niveau   : person.niveau    || '',
          filiere  : person.filiere   || '',
          annee    : person.annee     || '',
          motivation: person.motivation || '',
          interets : person.interets  || '',
          source   : person.source    || '',
        });
        newCount++;
        console.log(`[Sync] ➕ Nouvel inscrit ajouté localement : ${person.prenom} ${person.nom} (${person.email})`);
      } catch (err) {
        console.error(`[Sync] ⚠️ Erreur insertion locale pour ${person.email} :`, err.message);
      }
    }
  }

  if (newCount === 0) {
    console.log(`[Sync] ℹ️  Aucun nouvel inscrit depuis la dernière vérification.`);
  } else {
    console.log(`[Sync] ✅ ${newCount} nouveau(x) inscrit(s) ajouté(s) localement.`);
  }

  // 3. Envoi des mails aux personnes sans confirmation (email_sent = 0)
  const pending = getPendingEmailAdhesions();
  if (pending.length === 0) {
    console.log(`[Email] ✅ Tout le monde a déjà reçu son mail de confirmation.`);
    return;
  }

  console.log(`[Email] 📋 ${pending.length} personne(s) en attente de mail. Envoi en cours...`);
  let sent = 0;
  let failed = 0;

  for (const person of pending) {
    try {
      const emailRes = await sendWelcomeEmail({
        prenom: person.prenom,
        nom   : person.nom,
        email : person.email,
      });
      if (emailRes && emailRes.success) {
        markEmailSent(person.id);
        sent++;
        console.log(`[Email] ✅ Flyer envoyé à ${person.email} (ID #${person.id})`);
      } else {
        failed++;
        console.error(`[Email] ⚠️ Échec envoi à ${person.email} :`, emailRes ? emailRes.error : 'inconnu');
      }
    } catch (err) {
      failed++;
      console.error(`[Email] ❌ Erreur envoi à ${person.email} :`, err.message);
    }
    // Pause 600ms entre chaque envoi (anti rate-limiting Gmail)
    await new Promise(r => setTimeout(r, 600));
  }

  console.log(`[Email] 🎉 Résultat : ${sent} envoyé(s), ${failed} échec(s).`);
}

// ── Démarrage ────────────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║   ARSII IIT — Synchronisation & Envoi Emails Automatique ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`📡 Render URL  : ${RENDER_URL}`);
console.log(`🔑 Admin Key   : ${ADMIN_KEY ? '✅ configurée' : '⚠️  non configurée (accès libre)'}`);
console.log(`⏱️  Intervalle  : ${SYNC_INTERVAL_MS / 1000}s entre chaque vérification`);
console.log('─────────────────────────────────────────────────────────────\n');

// Premier cycle immédiat au démarrage
syncAndSendEmails();

// Cycles répétés toutes les SYNC_INTERVAL_MS
setInterval(syncAndSendEmails, SYNC_INTERVAL_MS);
