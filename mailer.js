const nodemailer = require('nodemailer');
const https = require('https');
const path = require('path');
const fs   = require('fs');

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
    process.env[key] = val;
  });
}

// URLs officielles hébergées en HTTPS (accessibles partout, jamais bloquées par les filtres professionnels/universitaires)
const PUBLIC_BASE_URL       = (process.env.RENDER_URL || 'https://arsii-iit-form.onrender.com').replace(/\/$/, '');
const LOGO_URL              = `${PUBLIC_BASE_URL}/assets/img/logo-light.png`;
const CAMPUS_URL            = `${PUBLIC_BASE_URL}/assets/img/iit-campus.jpg`;
const TITRE_BIENVENUE_URL   = `${PUBLIC_BASE_URL}/assets/img/titre-bienvenue.png`;
const BANNIERE_SLOGAN_URL   = `${PUBLIC_BASE_URL}/assets/img/banniere-slogan.png`;
const QR_INSTAGRAM_URL      = `${PUBLIC_BASE_URL}/assets/img/qr-instagram.png`;
const REJOINS_URL           = `${PUBLIC_BASE_URL}/assets/img/rejoins-communaute.png`;
const BIENVENUE_AVENTURE_URL= `${PUBLIC_BASE_URL}/assets/img/bienvenue-aventure.png`;
const SIGNATURE_URL         = `${PUBLIC_BASE_URL}/assets/img/signature-equipe.png`;
const AVION_URL             = `${PUBLIC_BASE_URL}/assets/img/avion-papier.png`;

let transporter = null;
async function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER || 'arsii.iit189@gmail.com';
  let pass   = (process.env.SMTP_PASS || 'ypji muzb fbyi qowf').replace(/\s+/g, '');
  const service = process.env.SMTP_SERVICE || 'gmail';

  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    console.log(`[Email] SMTP via host ${process.env.SMTP_HOST}:${port} (${user})`);
  } else {
    transporter = nodemailer.createTransport({
      service,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    console.log(`[Email] SMTP via ${service} (${user})`);
  }

  return transporter;
}

function buildWelcomeEmailHtml(prenom, useCid = false) {
  const p = prenom
    ? prenom.trim().charAt(0).toUpperCase() + prenom.trim().slice(1).toLowerCase()
    : 'Adhérent(e)';

  const logoSrc        = useCid ? 'cid:logo_img'        : LOGO_URL;
  const campusSrc      = useCid ? 'cid:campus_img'      : CAMPUS_URL;
  const titreSrc       = useCid ? 'cid:titre_img'       : TITRE_BIENVENUE_URL;
  const sloganSrc      = useCid ? 'cid:slogan_img'      : BANNIERE_SLOGAN_URL;
  const qrInstaSrc     = useCid ? 'cid:qr_insta_img'    : QR_INSTAGRAM_URL;
  const rejoinsSrc     = useCid ? 'cid:rejoins_img'     : REJOINS_URL;
  const bienvenueSrc   = useCid ? 'cid:bienvenue_img'   : BIENVENUE_AVENTURE_URL;
  const signatureSrc   = useCid ? 'cid:signature_img'   : SIGNATURE_URL;
  const avionSrc       = useCid ? 'cid:avion_img'       : AVION_URL;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Bienvenue ${p} - Club ARSII IIT</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Montserrat:wght@600;700;800;900&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Montserrat:wght@600;700;800;900&family=Nunito:wght@400;600;700;800&display=swap');
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    .insta-btn:hover {
      background-color: #006d62 !important;
      cursor: pointer;
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#e6f6f4;font-family:'Nunito','Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<!-- Preheader officiel pour aperçu direct en boîte de réception -->
<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
  Bienvenue ${p} au Club ARSII IIT ! Ton adhésion est bien confirmée. Découvre nos projets et notre communauté.
</div>

<!-- Wrapper principal -->
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#e6f6f4" style="background-color:#e6f6f4;padding:24px 12px;">
<tr><td align="center">

<!-- Carte Flyer 600px -->
<table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0"
  style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;box-shadow:0 12px 40px rgba(7,38,50,0.12);overflow:hidden;">

  <!-- ════════════════════ 1. HEADER : PHOTO CAMPUS AVEC LOGO & BIENVENUE ════════════════════ -->
  <tr>
    <td style="padding:0;background:linear-gradient(180deg,#1297ad 0%,#1a9fb7 100%);line-height:0;">
      <!-- Bandeau ciel avec Logo + Bienvenue dans l'aventure ! -->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0e8ca1 0%,#169ab2 100%);">
        <tr>
          <td valign="middle" align="left" style="padding:18px 24px 12px 24px;">
            <img src="${logoSrc}" alt="ARSII IIT" width="145"
              style="display:block;width:145px;max-width:145px;height:auto;border:0;"/>
          </td>
          <td valign="middle" align="right" style="padding:14px 24px 10px 10px;">
            <img src="${bienvenueSrc}" alt="Bienvenue dans l'aventure !" width="145"
              style="display:block;width:145px;height:auto;max-width:100%;border:0;margin-left:auto;" />
          </td>
        </tr>
      </table>

      <!-- Photo IIT Campus Sfax -->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0;line-height:0;font-size:0;max-height:150px;overflow:hidden;">
            <img src="${campusSrc}" alt="Campus IIT Sfax" width="600" height="150"
              style="display:block;width:100%;max-width:600px;height:150px;max-height:150px;object-fit:cover;object-position:center 30%;border:0;"/>
          </td>
        </tr>
      </table>

      <!-- Vague de transition turquoise & blanche en bas de photo -->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0;line-height:0;font-size:0;">
            <svg viewBox="0 0 600 55" width="100%" height="55" preserveAspectRatio="none" style="display:block;" fill="none">
              <!-- Transition sous photo -->
              <rect width="600" height="15" fill="#d2beaf"/>
              <!-- Vague turquoise superieure droite -->
              <path d="M360,0 C440,6 520,12 600,0 L600,55 L480,55 C520,35 460,18 360,0 Z" fill="#00c4b4"/>
              <path d="M420,0 C490,6 550,10 600,0 L600,38 C560,24 500,14 420,0 Z" fill="#36d6c6" opacity="0.85"/>
              <!-- Courbe blanche fluide montante -->
              <path d="M0,0 C140,28 280,52 500,38 C545,35 575,26 600,16 L600,55 L0,55 Z" fill="#ffffff"/>
            </svg>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ════════════════════ 2. CORPS BLANC DU FLYER ════════════════════ -->
  <tr>
    <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0;position:relative;">

      <!-- Table avec decors lateraux (vague turquoise droite + bulle menthe gauche) -->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
      <tr>

        <!-- Colonne gauche decoratrice (bulle douce menthe) -->
        <td width="24" valign="top" style="width:24px;padding:0;line-height:0;">
          <svg viewBox="0 0 24 180" width="24" height="180" style="display:block;" fill="none">
            <path d="M0,20 C18,20 24,50 24,90 C24,130 16,160 0,170 Z" fill="#daf4ef"/>
          </svg>
        </td>

        <!-- Contenu principal -->
        <td valign="top" style="padding:12px 14px 28px 14px;">

          <!-- ─── TITRE : BIENVENUE AU CLUB ARSII IIT ! ─── -->
          <div style="margin:4px 0 16px 0;text-align:left;">
            <img src="${titreSrc}" alt="Bienvenue au Club ARSII IIT !" width="440"
              style="display:block;width:100%;max-width:440px;height:auto;border:0;" />
          </div>

          <!-- ─── SALUTATION AVEC PRENOM DYNAMIQUE EN TURQUOISE ─── -->
          <p style="margin:20px 0 10px 0;font-family:'Montserrat','Nunito',Arial,sans-serif;font-size:19px;font-weight:800;color:#0b343d;line-height:1.3;">
            Bonjour&nbsp;<span style="color:#009e90;">${p}</span>&nbsp;!
          </p>

          <!-- ─── PARAGRAPHES DU FLYER ─── -->
          <p style="margin:0 0 14px 0;font-family:'Nunito','Montserrat',Arial,sans-serif;font-size:15px;line-height:1.65;color:#2c4c56;">
            Nous avons bien re&ccedil;u ton formulaire d&apos;adh&eacute;sion
            au <strong style="color:#0b343d;font-weight:800;">Club ARSII IIT</strong>.&nbsp;&#x1F389;
          </p>

          <p style="margin:0 0 14px 0;font-family:'Nunito','Montserrat',Arial,sans-serif;font-size:15px;line-height:1.65;color:#2c4c56;">
            Merci pour ton int&eacute;r&ecirc;t&nbsp;! Nous sommes ravis de te voir
            rejoindre notre communaut&eacute;.
          </p>

          <p style="margin:0 0 24px 0;font-family:'Nunito','Montserrat',Arial,sans-serif;font-size:15px;line-height:1.65;color:#2c4c56;">
            Au <strong style="color:#009e90;font-weight:800;">Club ARSII IIT</strong>, tu pourras participer &agrave; des &eacute;v&eacute;nements,
            d&eacute;couvrir de nouvelles id&eacute;es, travailler sur des projets innovants
            et rencontrer des &eacute;tudiants passionn&eacute;s par la technologie.
          </p>

          <!-- ─── 3. ENCADRE SLOGAN : ENSEMBLE, INNOVONS, PARTAGEONS ET AVANCONS ! ─── -->
          <div style="margin:0 0 22px 0;text-align:center;">
            <img src="${sloganSrc}" alt="Ensemble, innovons, partageons et avan&ccedil;ons !" width="540"
              style="display:block;width:100%;max-width:540px;height:auto;border:0;margin:0 auto;" />
          </div>

          <!-- ─── 4. ENCADRE INSTAGRAM AVEC "REJOINS LA COMMUNAUTE ! ♡" ─── -->
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"
            style="margin:0 0 28px 0;background-color:#eaf8f5;border-radius:24px;">
            <tr><td style="padding:18px 20px;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"><tr>

                <!-- QR Code Instagram ARSII_IIT (non cliquable, uniquement pour être scanné) -->
                <td valign="middle" width="90" style="width:90px;padding-right:14px;">
                  <img src="${qrInstaSrc}" alt="Scanner pour rejoindre ARSII IIT sur Instagram" width="90" height="90"
                    style="display:block;width:90px;height:90px;border:0;pointer-events:none;cursor:default;"/>
                </td>

                <!-- Texte Instagram & Bouton URL cliquable -->
                <td valign="middle">
                  <div style="font-family:'Montserrat',Arial,sans-serif;font-size:16px;font-weight:800;color:#0b343d;line-height:1.25;">
                    Suis-nous sur Instagram
                  </div>
                  <div style="font-family:'Nunito',Arial,sans-serif;font-size:13px;color:#3d5f6a;line-height:1.4;margin-top:2px;margin-bottom:8px;">
                    pour d&eacute;couvrir nos actualit&eacute;s et nos<br/>prochains &eacute;v&eacute;nements&nbsp;:
                  </div>
                  <!-- Bouton lien pilule turquoise cliquable -->
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
                    <td bgcolor="#008477" style="background-color:#008477;border-radius:50px;">
                      <a href="https://www.instagram.com/arsii_iit/" target="_blank" class="insta-btn"
                        style="display:inline-block;padding:7px 18px;font-family:'Nunito','Montserrat',Arial,sans-serif;font-size:12px;font-weight:800;color:#ffffff;text-decoration:none;white-space:nowrap;background-color:#008477;border-radius:50px;transition:background-color 0.2s ease;">
                        https://www.instagram.com/arsii_iit/
                      </a>
                    </td>
                  </tr></table>
                </td>

                <!-- Droite : "Rejoins la communaute ! ♡" en ecriture manuscrite penchee avec coeur -->
                <td valign="middle" width="130" style="width:130px;padding-left:10px;text-align:center;">
                  <img src="${rejoinsSrc}" alt="Rejoins la communaut&eacute; ! &hearts;" width="125"
                    style="display:block;width:125px;height:auto;max-width:100%;border:0;margin-left:auto;" />
                </td>

              </tr></table>
            </td></tr>
          </table>

          <!-- ─── 5. SIGNATURE & AVION EN PAPIER AVEC TRAINÉE POINTILLÉE ─── -->
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            <tr>
              <!-- Gauche : Signature -->
              <td valign="middle" align="left">
                <img src="${signatureSrc}" alt="&Agrave; tr&egrave;s bient&ocirc;t au Club ARSII IIT ! L'&eacute;quipe ARSII IIT" width="215"
                  style="display:block;width:215px;height:auto;max-width:100%;border:0;" />
              </td>

              <!-- Droite : Avion en papier origami avec trainee en pointilles boucles -->
              <td valign="bottom" align="right" width="140" style="width:140px;padding-bottom:4px;">
                <img src="${avionSrc}" alt="Avion en papier" width="130"
                  style="display:block;width:130px;height:auto;max-width:100%;border:0;margin-left:auto;" />
              </td>
            </tr>
          </table>

        </td>

        <!-- Colonne droite decoratrice (vague turquoise haute) -->
        <td width="24" valign="top" style="width:24px;padding:0;line-height:0;">
          <svg viewBox="0 0 24 200" width="24" height="200" style="display:block;margin-left:auto;" fill="none">
            <path d="M24,0 C6,20 0,60 12,110 C20,150 24,180 24,200 Z" fill="#00c4b4"/>
            <path d="M24,0 C12,15 6,45 16,90 C22,125 24,150 24,170 Z" fill="#36d6c6" opacity="0.8"/>
          </svg>
        </td>

      </tr>
      </table>

    </td>
  </tr>

  <!-- ════════════════════ 3. FOOTER SOMBRE ARSII IIT ════════════════════ -->
  <tr>
    <td bgcolor="#072632" style="background-color:#072632;padding:24px 28px 20px 28px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
        <tr>
          <!-- Logo ARSII IIT gauche -->
          <td valign="middle" align="left" width="45%">
            <img src="${logoSrc}" alt="ARSII IIT" width="125" height="auto"
              style="display:block;width:125px;height:auto;border:0;"/>
          </td>
          <!-- INNOVER • CONNECTER • IMPACTER droite -->
          <td valign="middle" align="right" width="55%"
            style="font-family:'Montserrat',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2.5px;color:#70b8c8;text-transform:uppercase;line-height:1.6;">
            INNOVER&nbsp;&bull;&nbsp;CONNECTER&nbsp;&bull;&nbsp;IMPACTER
          </td>
        </tr>
      </table>

      <!-- Mentions legales & infos club conformes anti-spam -->
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"
        style="margin-top:16px;border-top:1px solid #144453;padding-top:14px;">
        <tr><td align="center"
          style="font-family:'Nunito',Arial,sans-serif;font-size:11px;color:#508292;line-height:1.7;">
          Association ARSII &bull; Institut International de Technologie &mdash; IIT Sfax<br/>
          Cet email officiel de confirmation vous est envoy&eacute; suite &agrave; votre demande d&apos;adh&eacute;sion en ligne au Club ARSII IIT.
        </td></tr>
      </table>
    </td>
  </tr>

</table><!-- Fin carte -->

</td></tr>
</table><!-- Fin wrapper -->

</body>
</html>`;
}

// ── Envoi via l'API HTTP Brevo (port 443 HTTPS — fonctionne sur Render) ────
function sendViaBrevoAPI({ apiKey, senderEmail, toEmail, toName, subject, htmlContent, textContent }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender     : { name: 'Club ARSII IIT', email: senderEmail },
      to         : [{ email: toEmail, name: toName }],
      subject,
      htmlContent,
      textContent,
    });
    const options = {
      hostname: 'api.brevo.com',
      path    : '/v3/smtp/email',
      method  : 'POST',
      headers : {
        'api-key'       : apiKey,
        'Content-Type'  : 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 20000,
    };
    const req = https.request(options, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve({ success: true, messageId: parsed.messageId || 'brevo-api-sent' });
          } catch (e) {
            resolve({ success: true, messageId: 'brevo-api-sent' });
          }
        } else {
          reject(new Error(`Brevo API HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Brevo API timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Envoi via l'API HTTP Resend (port 443 HTTPS — alternative robuste sur Render) ──
function sendViaResendAPI({ apiKey, senderEmail, toEmail, subject, htmlContent, textContent }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      from: senderEmail,
      to: [toEmail],
      subject,
      html: htmlContent,
      text: textContent,
    });
    const options = {
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 20000,
    };
    const req = https.request(options, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve({ success: true, messageId: parsed.id || 'resend-sent' });
          } catch (e) {
            resolve({ success: true, messageId: 'resend-sent' });
          }
        } else {
          reject(new Error(`Resend API HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Resend API timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Fonction principale d'envoi ──────────────────────────────────────────────
async function sendWelcomeEmail({ prenom, nom, email }) {
  try {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error(`Adresse email invalide ou manquante : "${email}"`);
    }

    const p = prenom
      ? prenom.trim().charAt(0).toUpperCase() + prenom.trim().slice(1).toLowerCase()
      : 'Adhérent(e)';
    const senderEmail = process.env.SMTP_USER || 'arsii.iit189@gmail.com';
    const subject     = `Confirmation d'adhésion au Club ARSII IIT – ${p}`;
    const textContent = [
      `Bonjour ${p} !`, '',
      `Ton adhésion au Club ARSII IIT est bien confirmée ! 🎉`, '',
      `Nous avons bien reçu ton formulaire d'adhésion au Club ARSII IIT.`,
      `Merci pour ton intérêt ! Nous sommes ravis de te voir rejoindre notre communauté.`, '',
      `Au Club ARSII IIT, tu pourras :`,
      `- Participer à des événements et workshops enrichissants,`,
      `- Découvrir de nouvelles idées et technologies,`,
      `- Travailler sur des projets innovants,`,
      `- Rencontrer des étudiants passionnés et élargir ton réseau.`, '',
      `Ensemble, innovons, partageons et avançons !`, '',
      `Suis-nous sur Instagram pour ne rien manquer : https://www.instagram.com/arsii_iit/`, '',
      `À très bientôt au Club ARSII IIT !`,
      `L'équipe ARSII IIT`, '',
      `INNOVER • CONNECTER • IMPACTER`,
      `Association ARSII - Institut International de Technologie (IIT Sfax)`,
    ].join('\n');

    // ── PRIORITÉ 1 : API HTTP Brevo (fonctionne sur Render, port 443 HTTPS) ────
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    if (brevoApiKey) {
      try {
        console.log(`[Email] Envoi via Brevo API HTTP -> ${cleanEmail}`);
        const result = await sendViaBrevoAPI({
          apiKey     : brevoApiKey,
          senderEmail,
          toEmail    : cleanEmail,
          toName     : `${p} ${(nom || '').trim()}`.trim(),
          subject,
          htmlContent: buildWelcomeEmailHtml(prenom, false),
          textContent,
        });
        console.log(`[Email] OK (Brevo) -> ${cleanEmail} | prenom: ${p} | ID: ${result.messageId}`);
        return { success: true, messageId: result.messageId, provider: 'brevo' };
      } catch (brevoErr) {
        console.error(`[Email] ⚠️ Échec Brevo API :`, brevoErr.message);
        // Si Brevo échoue, on continue vers les fallbacks
      }
    }

    // ── PRIORITÉ 2 : API HTTP Resend (fonctionne sur Render, port 443 HTTPS) ────
    const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
    if (resendApiKey) {
      try {
        console.log(`[Email] Envoi via Resend API HTTP -> ${cleanEmail}`);
        const fromAddress = process.env.RESEND_FROM || `"Club ARSII IIT" <onboarding@resend.dev>`;
        const result = await sendViaResendAPI({
          apiKey     : resendApiKey,
          senderEmail: fromAddress,
          toEmail    : cleanEmail,
          subject,
          htmlContent: buildWelcomeEmailHtml(prenom, false),
          textContent,
        });
        console.log(`[Email] OK (Resend) -> ${cleanEmail} | prenom: ${p} | ID: ${result.messageId}`);
        return { success: true, messageId: result.messageId, provider: 'resend' };
      } catch (resendErr) {
        console.error(`[Email] ⚠️ Échec Resend API :`, resendErr.message);
      }
    }

    // ── PRIORITÉ 3 : SMTP nodemailer (Gmail officiel — en local ou VPS) ────────
    console.log(`[Email] Tentative via SMTP -> ${cleanEmail}`);
    const mailClient  = await getTransporter();
    const fromAddress = `"Club ARSII IIT" <${senderEmail}>`;
    const replyAddress = senderEmail;

    const htmlToSend = buildWelcomeEmailHtml(prenom, false);

    const info = await mailClient.sendMail({
      from   : fromAddress,
      replyTo: replyAddress,
      to     : cleanEmail,
      subject,
      text   : textContent,
      html   : htmlToSend,
    });

    console.log(`[Email] OK (SMTP) -> ${cleanEmail} | prenom: ${p} | ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId, provider: 'smtp' };

  } catch (err) {
    console.error(`[Email] ERREUR GLOBALE -> ${email} :`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendWelcomeEmail, buildWelcomeEmailHtml, getTransporter };