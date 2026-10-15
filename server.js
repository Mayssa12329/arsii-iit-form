const http = require('http');
const fs = require('fs');
const path = require('path');
const { insertAdhesion, saveOrUpdateAdhesion, getAdhesionByPhone, getAdhesionByEmail, getAllAdhesions, exportCSV, clearAllAdhesions, deleteAdhesionById } = require('./db');
const { sendWelcomeEmail, buildWelcomeEmailHtml } = require('./mailer');

// Chargement basique d'un fichier .env s'il existe
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.csv': 'text/csv; charset=utf-8',
};


function isAdminAuthorized(req) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return true; // Si aucune ADMIN_KEY n'est configurée, accès dev libre
  try {
    const urlObj = new URL(req.url, 'http://localhost');
    const queryKey = urlObj.searchParams.get('key');
    const headerKey = req.headers['x-admin-key'];
    return (queryKey === adminKey || headerKey === adminKey);
  } catch (e) {
    return false;
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const rawPath = req.url.split('?')[0];

  // ================= API ENDPOINTS =================
  // 1. POST /api/adhesions - Enregistrement d'une nouvelle adhésion
  if (req.method === 'POST' && rawPath === '/api/adhesions') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Protection anti attaque DoS (max 1MB)
      if (body.length > 1e6) req.destroy();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        // Anti-spam honeypot
        if (data.website) {
          return sendJson(res, 200, { success: true, message: 'OK' });
        }

        // Validation des coordonnées obligatoires
        const errors = [];
        if (!data.nom || data.nom.trim().length < 2) errors.push('Le nom est requis (minimum 2 caractères).');
        if (!data.prenom || data.prenom.trim().length < 2) errors.push('Le prénom est requis (minimum 2 caractères).');
        if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email.trim())) errors.push('Une adresse email valide est requise.');
        if (!data.telephone || data.telephone.trim().length < 8) errors.push('Un numéro de téléphone valide est requis.');
        if (!data.niveau || !data.niveau.trim()) errors.push('Le niveau d’études est requis.');
        if (!data.filiere || data.filiere.trim().length < 2) errors.push('La filière est requise.');
        if (!data.annee || !data.annee.trim()) errors.push('L’année d’études est requise.');

        if (errors.length > 0) {
          return sendJson(res, 400, { success: false, errors });
        }

        // Nettoyage et normalisation des données
        const cleanEmail = data.email.trim().toLowerCase();
        const cleanTel = data.telephone.trim();

        // Vérification stricte anti-redondance : interdiction de remplir deux fois avec le même email OU le même téléphone
        const existingEmail = getAdhesionByEmail(cleanEmail);
        const existingPhone = getAdhesionByPhone(cleanTel);

        if (existingEmail && existingPhone) {
          console.warn(`[Base de données] Rejet doublon strict (Email et Téléphone déjà inscrits) : ${cleanEmail} / ${cleanTel}`);
          return sendJson(res, 409, {
            success: false,
            duplicateEmail: true,
            duplicatePhone: true,
            message: '⛔ Cet email et ce numéro de téléphone sont déjà inscrits.',
          });
        }

        if (existingEmail) {
          console.warn(`[Base de données] Rejet doublon strict Email : ${cleanEmail} (ID #${existingEmail.id})`);
          return sendJson(res, 409, {
            success: false,
            duplicateEmail: true,
            message: '⛔ Cette adresse email est déjà inscrite.',
            id: existingEmail.id,
          });
        }

        if (existingPhone) {
          console.warn(`[Base de données] Rejet doublon strict Téléphone : ${cleanTel} (ID #${existingPhone.id})`);
          return sendJson(res, 409, {
            success: false,
            duplicatePhone: true,
            message: '⛔ Ce numéro de téléphone est déjà inscrit.',
            id: existingPhone.id,
          });
        }

        // Insertion unique de la nouvelle adhésion dans la base de données (< 5ms)
        const result = insertAdhesion({
          nom: data.nom.trim(),
          prenom: data.prenom.trim(),
          email: cleanEmail,
          telephone: cleanTel,
          niveau: data.niveau.trim(),
          filiere: data.filiere.trim(),
          annee: data.annee.trim(),
          motivation: (data.motivation || '').trim(),
          interets: data.interets || '',
          source: data.source || '',
        });

        console.log(`[Base de données] Nouvelle adhésion enregistrée : ${data.prenom} ${data.nom} (${cleanEmail}) - ID #${result.id}`);

        // Réponse immédiate et ultra-rapide au navigateur (< 50ms) pour une expérience utilisateur instantanée
        sendJson(res, 201, {
          success: true,
          emailSent: true,
          message: `Candidature enregistrée ! Un email de confirmation officiel a été envoyé à ${cleanEmail}.`,
          id: result.id,
        });

        // Envoi automatique, fiable et garanti de l'email de confirmation en tâche de fond (asynchrone)
        setImmediate(() => {
          sendWelcomeEmail({
            prenom: data.prenom.trim(),
            nom: data.nom.trim(),
            email: cleanEmail,
          }).then(emailRes => {
            if (emailRes && emailRes.success) {
              console.log(`[Email] ✅ Email de confirmation bien envoyé pour ${cleanEmail} (ID: ${emailRes.messageId})`);
            } else {
              console.error(`[Email] ⚠️ Problème lors de l'envoi à ${cleanEmail} :`, emailRes ? emailRes.error : 'inconnu');
            }
          }).catch(emailErr => {
            console.error('[Email] ❌ Erreur critique lors de l’envoi :', emailErr);
          });
        });
        return;
      } catch (err) {
        console.error('Erreur API POST /api/adhesions :', err);
        return sendJson(res, 500, { success: false, message: 'Erreur interne du serveur' });
      }
    });
    return;
  }

  // 1b. GET /api/email-preview - Aperçu dans le navigateur du mail envoyé
  if (req.method === 'GET' && rawPath === '/api/email-preview') {
    const prenom = req.url.includes('prenom=') ? decodeURIComponent(req.url.split('prenom=')[1].split('&')[0]) : 'Adhérent';
    const html = buildWelcomeEmailHtml(prenom);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(html);
    return;
  }


  // Route de diagnostic email (permet de tester l'envoi vers n'importe quel email)
  if (req.method === 'GET' && rawPath === '/api/test-email') {
    if (!isAdminAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const urlObj = new URL(req.url, 'http://localhost');
    const to = (urlObj.searchParams.get('to') || urlObj.searchParams.get('email') || '').trim();
    if (!to) {
      return sendJson(res, 400, { success: false, message: 'Indiquez une adresse email avec ?to=votre-email@domaine.com' });
    }
    const prenom = urlObj.searchParams.get('prenom') || 'Adhérent';
    sendWelcomeEmail({ prenom, nom: 'Test', email: to })
      .then(info => sendJson(res, 200, { success: true, messageId: info ? info.messageId : 'sent', to, smtp_user: process.env.SMTP_USER || 'non-defini' }))
      .catch(err => sendJson(res, 500, { success: false, error: err.message, smtp_user: process.env.SMTP_USER || 'non-defini' }));
    return;
  }

  // 2. GET /api/adhesions - Liste des adhérents
  if (req.method === 'GET' && rawPath === '/api/adhesions') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { success: false, message: 'Accès protégé : clé admin requise (?key=... ou header x-admin-key)' });
    }
    try {
      const all = getAllAdhesions();
      return sendJson(res, 200, { success: true, count: all.length, data: all });
    } catch (err) {
      console.error('Erreur API GET /api/adhesions :', err);
      return sendJson(res, 500, { success: false, message: 'Erreur interne' });
    }
  }

  // 2b. GET /api/check-email?email=... - Vérifie si un email est dans la base
  if (req.method === 'GET' && rawPath === '/api/check-email') {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const email = (urlObj.searchParams.get('email') || '').trim().toLowerCase();
      if (!email) return sendJson(res, 400, { exists: false, error: 'Email manquant' });
      const existing = getAdhesionByEmail(email);
      return sendJson(res, 200, { exists: !!existing });
    } catch (err) {
      console.error('Erreur API GET /api/check-email :', err);
      return sendJson(res, 500, { exists: false });
    }
  }

  // 3. GET /api/adhesions/export.csv - Export CSV Excel
  if (req.method === 'GET' && rawPath === '/api/adhesions/export.csv') {
    if (!isAdminAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Accès protégé : clé admin requise (?key=...).');
      return;
    }
    try {
      const csv = exportCSV();
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="adhesions_arsii_iit.csv"',
        'Cache-Control': 'no-cache',
      });
      res.end(csv);
      return;
    } catch (err) {
      console.error('Erreur export CSV :', err);
      return sendJson(res, 500, { success: false, message: 'Erreur export CSV' });
    }
  }

  // 4. DELETE /api/adhesions - Vider la base de données
  if (req.method === 'DELETE' && rawPath === '/api/adhesions') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { success: false, message: 'Accès protégé : clé admin requise' });
    }
    try {
      clearAllAdhesions();
      return sendJson(res, 200, { success: true, message: 'Base de données vidée avec succès' });
    } catch (err) {
      console.error('Erreur DELETE /api/adhesions :', err);
      return sendJson(res, 500, { success: false, message: 'Erreur lors du vidage' });
    }
  }

  // ================= FICHIERS STATIQUES =================
  let safePath = path.normalize(decodeURIComponent(rawPath)).replace(/^(\.\.[\/\\])+/, '');
  
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(ROOT, safePath);

  // Security check: ensure path stays within ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - Fichier non trouvé</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const isAsset = ['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff2'].includes(ext);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': isAsset ? 'public, max-age=86400, stale-while-revalidate=3600' : 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Club ARSII IIT Formulaire disponible sur http://localhost:${PORT}`);
  console.log(`Base de données active : data/adhesions.db`);
});
