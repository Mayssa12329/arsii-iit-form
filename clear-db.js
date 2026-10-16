#!/usr/bin/env node
/**
 * clear-db.js
 * Script pour réinitialiser la base de données :
 * 1. Localement (SQLite, adhesions.json, adhesions.csv)
 * 2. Sur Render (via l'API DELETE /api/adhesions)
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

// Chargement .env
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) return;
    const idx = t.indexOf('=');
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  });
}

const { clearAllAdhesions, getAllAdhesions } = require('./db');

console.log('--- 1. VIDAGE DE LA BASE LOCALE ---');
const beforeCount = getAllAdhesions().length;
clearAllAdhesions();
const afterCount = getAllAdhesions().length;
console.log(`✅ Base locale vidée : ${beforeCount} entrée(s) supprimée(s), il reste ${afterCount} entrée(s).`);
console.log('   - data/adhesions.db réinitialisé');
console.log('   - data/adhesions.json vidé ([])');
console.log('   - data/adhesions.csv remis à zéro (uniquement l\'en-tête)\n');

// 2. Vidage Render
const renderUrl = (process.env.RENDER_URL || '').trim().replace(/\/$/, '');
const adminKey = (process.env.ADMIN_KEY || '').trim();

if (!renderUrl) {
  console.log('ℹ️  Aucune URL Render configurée dans .env (RENDER_URL). Vidage Render ignoré.');
  process.exit(0);
}

console.log(`--- 2. VIDAGE DE LA BASE RENDER (${renderUrl}) ---`);

const queryParam = adminKey ? `?key=${encodeURIComponent(adminKey)}` : '';
const targetUrl = new URL(`${renderUrl}/api/adhesions${queryParam}`);
const mod = targetUrl.protocol === 'https:' ? https : http;

const req = mod.request(targetUrl, {
  method: 'DELETE',
  headers: {
    'x-admin-key': adminKey,
  },
  timeout: 15000,
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Base de données sur Render vidée avec succès !');
    } else if (res.statusCode === 503) {
      console.log('⚠️  Service Render suspendu ou inactif (HTTP 503 : "Service Suspended").');
      console.log('   Sur Render (offre gratuite), le stockage est temporaire (éphémère) :');
      console.log('   dès que vous réactiverez ou redéploierez le service, la base démarrera déjà vide.');
    } else if (res.statusCode === 401) {
      console.log('❌ Accès refusé par Render (HTTP 401). Vérifiez que ADMIN_KEY correspond dans .env et sur le dashboard Render.');
    } else {
      console.log(`⚠️  Réponse Render (${res.statusCode}) : ${body}`);
    }
  });
});

req.on('error', (err) => {
  console.log(`⚠️  Impossible de joindre Render (${err.message}).`);
  console.log('   Si le service est suspendu, rendez-vous sur https://dashboard.render.com pour le réactiver.');
});

req.on('timeout', () => {
  req.destroy();
  console.log('⚠️  Délai d\'attente dépassé en tentant de joindre Render.');
});

req.end();
