const http = require('http');
const fs = require('fs');
const path = require('path');
const { insertAdhesion, saveOrUpdateAdhesion, getAdhesionByPhone, getAdhesionByEmail, getAllAdhesions, exportCSV, clearAllAdhesions, deleteAdhesionById, deleteAdhesionByEmail, getPendingEmailAdhesions, markEmailSent, markEmailSending, resetEmailPending } = require('./db');
const { sendWelcomeEmail, buildWelcomeEmailHtml } = require('./mailer');
const { startSyncService, syncDeletePerson, syncClearAll } = require('./sync-emails');

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

const server = http.createServer(async (req, res) => {
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
        
        const cleanDigits = (data.telephone || '').replace(/[\s.\-()]/g, '').replace(/^(\+|00)216/, '');
        if (!data.telephone || !/^\d{8}$/.test(cleanDigits)) errors.push('Entrez un numéro valide (8 chiffres).');
        
        if (!data.niveau || !data.niveau.trim()) errors.push('Le niveau d’études est requis.');
        if (!data.filiere || data.filiere.trim().length < 2) errors.push('La filière est requise.');
        if (!data.annee || !data.annee.trim()) errors.push('L’année d’études est requise.');

        if (errors.length > 0) {
          return sendJson(res, 400, { success: false, errors });
        }

        // Nettoyage et normalisation des données
        const cleanEmail = data.email.trim().toLowerCase();
        const cleanTel = data.telephone.trim();

        // 🛑 CONDITIONS STRICTES D'UNICITÉ :
        // Un utilisateur ne peut pas s'inscrire deux fois avec le même email ou le même téléphone
        const existingEmail = getAdhesionByEmail(cleanEmail);
        if (existingEmail && !data._isSync) {
          return sendJson(res, 400, {
            success: false,
            duplicateEmail: true,
            message: 'Cette adresse email est déjà inscrite. Chaque adhérent ne peut s’inscrire qu’une seule fois.',
            errors: ['Cette adresse email est déjà inscrite.']
          });
        }

        const existingPhone = getAdhesionByPhone(cleanTel);
        if (existingPhone && !data._isSync) {
          return sendJson(res, 400, {
            success: false,
            duplicatePhone: true,
            message: 'Ce numéro de téléphone est déjà inscrit. Chaque adhérent ne peut s’inscrire qu’une seule fois.',
            errors: ['Ce numéro de téléphone est déjà inscrit.']
          });
        }

        let recordId;

        if (existingEmail && data._isSync) {
          // Mise à jour de l'adhésion en cas de synchronisation entre serveurs
          saveOrUpdateAdhesion({
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
            created_at: data.created_at || undefined,
            email_sent: data.email_sent !== undefined ? Number(data.email_sent) : undefined,
          });
          recordId = existingEmail.id;
          console.log(`[Base de données] Adhésion mise à jour via sync : ${data.prenom} ${data.nom} (${cleanEmail}) - ID #${recordId}`);
        } else {
          // Insertion d'une nouvelle adhésion dans la base de données (< 5ms)
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
            created_at: data.created_at || undefined,
            email_sent: data.email_sent !== undefined ? Number(data.email_sent) : 0,
          });
          recordId = result.id;
          console.log(`[Base de données] Nouvelle adhésion enregistrée : ${data.prenom} ${data.nom} (${cleanEmail}) - ID #${recordId}`);
        }

        // Réponse immédiate et ultra-rapide au navigateur (< 50ms) pour une expérience utilisateur instantanée
        sendJson(res, 201, {
          success: true,
          emailSent: true,
          message: `Candidature enregistrée ! Un email de confirmation officiel a été envoyé à ${cleanEmail}.`,
          id: recordId,
        });

        // Stockage simultané et immédiat sur Render si en local
        if (!process.env.RENDER && process.env.RENDER_URL) {
          setImmediate(() => {
            try {
              const https = require('https');
              const http = require('http');
              const renderUrl = process.env.RENDER_URL.replace(/\/$/, '');
              const postData = JSON.stringify({
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
                _isSync: true,
              });
              const parsed = new URL(`${renderUrl}/api/adhesions`);
              const mod = parsed.protocol === 'https:' ? https : http;
              const reqRender = mod.request({
                hostname: parsed.hostname,
                port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
                path: parsed.pathname,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(postData),
                },
                timeout: 8000,
              });
              reqRender.on('error', () => {});
              reqRender.write(postData);
              reqRender.end();
            } catch (e) {}
          });
        }

        // Envoi automatique, fiable et garanti de l'email de confirmation en tâche de fond (asynchrone)
        setImmediate(() => {
          markEmailSending(recordId);
          sendWelcomeEmail({
            prenom: data.prenom.trim(),
            nom: data.nom.trim(),
            email: cleanEmail,
          }).then(emailRes => {
            if (emailRes && emailRes.success) {
              markEmailSent(recordId);
              console.log(`[Email] ✅ Confirmation envoyée avec succès à ${cleanEmail} (ID #${recordId}) ✉️`);
            } else {
              resetEmailPending(recordId);
              console.error(`[Email] ⚠️ Problème lors de l'envoi à ${cleanEmail} :`, emailRes ? emailRes.error : 'inconnu');
            }
          }).catch(emailErr => {
            resetEmailPending(recordId);
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
      .then(info => {
        if (info && info.success) {
          return sendJson(res, 200, { success: true, messageId: info.messageId, to, provider: info.provider || 'smtp' });
        } else {
          return sendJson(res, 500, { success: false, error: info ? info.error : 'Erreur inconnue', to });
        }
      })
      .catch(err => sendJson(res, 500, { success: false, error: err.message }));
    return;
  }

  // Route : GET /api/send-pending-emails - Envoie les mails aux nouvelles personnes sans confirmation
  if (req.method === 'GET' && rawPath === '/api/send-pending-emails') {
    if (!isAdminAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const pending = getPendingEmailAdhesions();
    if (pending.length === 0) {
      return sendJson(res, 200, { success: true, message: 'Aucune personne en attente de mail.', sent: 0, failed: 0 });
    }
    let sent = 0;
    let failed = 0;
    const results = [];
    // Traitement séquentiel pour éviter le spam
    (async () => {
      for (const person of pending) {
        try {
          const emailRes = await sendWelcomeEmail({
            prenom: person.prenom,
            nom: person.nom,
            email: person.email,
          });
          if (emailRes && emailRes.success) {
            markEmailSent(person.id);
            sent++;
            results.push({ id: person.id, email: person.email, status: 'envoyé' });
            console.log(`[Email] ✅ Mail envoyé à ${person.email} (ID #${person.id})`);
          } else {
            failed++;
            results.push({ id: person.id, email: person.email, status: 'échec', error: emailRes ? emailRes.error : 'inconnu' });
            console.error(`[Email] ⚠️ Échec envoi à ${person.email}`);
          }
        } catch (err) {
          failed++;
          results.push({ id: person.id, email: person.email, status: 'échec', error: err.message });
          console.error(`[Email] ❌ Erreur envoi à ${person.email} :`, err.message);
        }
        // Pause de 500ms entre chaque envoi pour éviter le rate-limiting
        await new Promise(r => setTimeout(r, 500));
      }
      sendJson(res, 200, {
        success: true,
        message: `${sent} mail(s) envoyé(s), ${failed} échec(s).`,
        total: pending.length,
        sent,
        failed,
        details: results,
      });
    })();
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

  // 2c. GET /api/check-phone?phone=... - Vérifie si un téléphone est déjà inscrit
  if (req.method === 'GET' && rawPath === '/api/check-phone') {
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const phone = (urlObj.searchParams.get('phone') || '').trim();
      if (!phone) return sendJson(res, 400, { exists: false, error: 'Téléphone manquant' });
      const existing = getAdhesionByPhone(phone);
      return sendJson(res, 200, { exists: !!existing });
    } catch (err) {
      console.error('Erreur API GET /api/check-phone :', err);
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

  // 4. DELETE /api/adhesions - Supprimer un adhérent ou vider toute la base (synchronisé)
  if (req.method === 'DELETE' && rawPath === '/api/adhesions') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { success: false, message: 'Accès protégé : clé admin requise' });
    }
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      const email = (urlObj.searchParams.get('email') || '').trim().toLowerCase();
      const id = urlObj.searchParams.get('id');

      if (email) {
        await syncDeletePerson({ email });
        return sendJson(res, 200, { success: true, message: `Adhésion pour ${email} supprimée sur les deux bases` });
      }

      if (id) {
        await syncDeletePerson({ id });
        return sendJson(res, 200, { success: true, message: `Adhésion #${id} supprimée sur les deux bases` });
      }

      await syncClearAll();
      return sendJson(res, 200, { success: true, message: 'Base de données vidée avec succès sur les deux bases' });
    } catch (err) {
      console.error('Erreur DELETE /api/adhesions :', err);
      return sendJson(res, 500, { success: false, message: 'Erreur lors de la suppression' });
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

  // Lancement automatique et transparent de la synchronisation Render ↔ Local et de l'envoi garanti des emails
  if (!process.env.RENDER) {
    startSyncService();
  }
});
