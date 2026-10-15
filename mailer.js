const nodemailer = require('nodemailer');
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

let transporter = null;
async function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  let pass   = process.env.SMTP_PASS;
  if (pass) pass = pass.replace(/\s+/g, '');
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
    console.log(`[Email] SMTP configuré via ${process.env.SMTP_HOST}:${port} (${user})`);
  } else {
    transporter = nodemailer.createTransport({
      service,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    console.log(`[Email] SMTP configuré via ${service} (${user})`);
  }

  return transporter;
}

function buildWelcomeEmailHtml(prenom) {
  const p = prenom
    ? prenom.trim().charAt(0).toUpperCase() + prenom.trim().slice(1).toLowerCase()
    : 'Adhérent(e)';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="fr">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Bienvenue ${p} - Club ARSII IIT</title>
</head>
<body style="margin:0;padding:0;background-color:#e6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1c3d47;">

  <!-- Preheader discret anti-spam -->
  <div style="display:none;font-size:1px;color:#e6f6f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Bienvenue ${p} au Club ARSII IIT ! Ton adhésion est confirmée.
  </div>

  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#e6f6f4" style="background-color:#e6f6f4;padding:24px 12px;">
  <tr><td align="center">

    <!-- CARTE PRINCIPALE 600px -->
    <table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0"
      style="max-width:600px;width:100%;background-color:#ffffff;border-radius:20px;box-shadow:0 10px 30px rgba(7,38,50,0.12);overflow:hidden;border:1px solid #cce8e4;">

      <!-- 1. EN-TÊTE BLEU TURQUOISE -->
      <tr>
        <td style="background:linear-gradient(135deg,#0c7c8c 0%,#1497ad 100%);background-color:#1297ad;padding:20px 24px;text-align:left;">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" align="left">
                <img src="cid:logo-arsii" alt="Club ARSII IIT" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0;"/>
              </td>
              <td valign="middle" align="right" style="color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
                <span style="display:inline-block;background:rgba(255,255,255,0.22);padding:6px 14px;border-radius:50px;">
                  Adhésion 2026-2027
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- PHOTO DU CAMPUS IIT -->
      <tr>
        <td style="padding:0;line-height:0;font-size:0;max-height:160px;overflow:hidden;border-bottom:4px solid #00c4b4;">
          <img src="cid:campus-iit" alt="Campus IIT Sfax" width="600" height="160"
            style="display:block;width:100%;max-width:600px;height:160px;object-fit:cover;border:0;"/>
        </td>
      </tr>

      <!-- 2. CORPS DU MESSAGE -->
      <tr>
        <td style="padding:32px 30px 24px 30px;background-color:#ffffff;">

          <!-- TITRE PRINCIPAL -->
          <div style="font-size:23px;font-weight:800;color:#0b343d;margin-bottom:6px;line-height:1.25;">
            Bienvenue au Club ARSII IIT !
          </div>

          <!-- SALUTATION AVEC PRENOM -->
          <p style="font-size:18px;font-weight:700;color:#009e90;margin:12px 0 16px 0;">
            Bonjour ${p} ! 👋
          </p>

          <p style="font-size:15px;line-height:1.65;color:#2c4c56;margin:0 0 14px 0;">
            Nous avons le plaisir de te confirmer que ton formulaire d&apos;adh&eacute;sion au <strong style="color:#0b343d;">Club ARSII IIT</strong> a bien &eacute;t&eacute; re&ccedil;u et valid&eacute;&nbsp;! 🎉
          </p>

          <p style="font-size:15px;line-height:1.65;color:#2c4c56;margin:0 0 18px 0;">
            Merci pour ton int&eacute;r&ecirc;t. Nous sommes ravis de t&apos;accueillir au sein de notre communaut&eacute; d&apos;&eacute;tudiants et de passionn&eacute;s par la technologie, l&apos;innovation et l&apos;entrepreneuriat.
          </p>

          <!-- ENCADRE MISSIONS -->
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:20px 0;background-color:#f0fbf9;border-left:4px solid #009e90;border-radius:6px;">
            <tr>
              <td style="padding:14px 18px;font-size:14px;line-height:1.6;color:#18535e;">
                💡 <strong>Au Club ARSII IIT, tu pourras :</strong><br/>
                &bull; Participer &agrave; nos ateliers techniques et formations pratiques.<br/>
                &bull; Travailler sur des projets technologiques concrets et innovants.<br/>
                &bull; Rencontrer des &eacute;tudiants motiv&eacute;s et &eacute;largir ton r&eacute;seau.<br/>
                &bull; D&eacute;couvrir les comp&eacute;titions, hackathons et &eacute;v&eacute;nements universitaires.
              </td>
            </tr>
          </table>

          <!-- SLOGAN -->
          <div style="text-align:center;margin:24px 0 20px 0;padding:12px 16px;background:linear-gradient(90deg,#008477 0%,#00a896 100%);border-radius:10px;color:#ffffff;font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
            🚀 ENSEMBLE, INNOVONS, PARTAGEONS ET AVAN&Ccedil;ONS !
          </div>

          <!-- ENCADRE INSTAGRAM -->
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:22px 0 16px 0;background-color:#eaf8f5;border-radius:14px;">
            <tr>
              <td style="padding:18px 20px;">
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle" width="75" style="width:75px;padding-right:16px;">
                      <img src="cid:qr-instagram" alt="QR Code Instagram" width="75" height="75" style="display:block;width:75px;height:75px;border-radius:8px;border:1px solid #bceae2;"/>
                    </td>
                    <td valign="middle">
                      <div style="font-size:16px;font-weight:800;color:#0b343d;margin-bottom:4px;">
                        Rejoins notre communaut&eacute; Instagram
                      </div>
                      <div style="font-size:13px;color:#3d5f6a;line-height:1.4;margin-bottom:10px;">
                        D&eacute;couvre nos annonces, r&eacute;unions et prochains &eacute;v&eacute;nements.
                      </div>
                      <div>
                        <a href="https://www.instagram.com/arsii_iit/" target="_blank"
                          style="display:inline-block;padding:8px 20px;background-color:#008477;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:50px;">
                          Suivre @arsii_iit sur Instagram &rarr;
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- SIGNATURE -->
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e1f2ef;font-size:14px;line-height:1.5;color:#2c4c56;">
            &Agrave; tr&egrave;s bient&ocirc;t au Club ARSII IIT !<br/>
            <strong style="color:#0b343d;">L&apos;&eacute;quipe Club ARSII IIT</strong>
          </div>

        </td>
      </tr>

      <!-- 3. FOOTER OFFICIEL -->
      <tr>
        <td style="background-color:#072632;padding:20px 24px;text-align:center;">
          <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#70b8c8;text-transform:uppercase;margin-bottom:8px;">
            INNOVER &bull; CONNECTER &bull; IMPACTER
          </div>
          <div style="font-size:11px;color:#7ba6b2;line-height:1.6;">
            Association ARSII &bull; Institut International de Technologie (IIT Sfax)<br/>
            Cet e-mail est envoy&eacute; automatiquement suite &agrave; ton inscription au Club ARSII IIT.
          </div>
        </td>
      </tr>

    </table>

  </td></tr>
  </table>

</body>
</html>`;
}

async function sendWelcomeEmail({ prenom, nom, email }) {
  try {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error(`Adresse email invalide ou manquante : "${email}"`);
    }

    const mailClient  = await getTransporter();
    const p = prenom
      ? prenom.trim().charAt(0).toUpperCase() + prenom.trim().slice(1).toLowerCase()
      : 'Adhérent(e)';
    const senderEmail = process.env.SMTP_USER || 'arsii.iit189@gmail.com';
    const fromAddress = process.env.SMTP_FROM || `"Club ARSII IIT" <${senderEmail}>`;
    const replyAddress = process.env.SMTP_REPLY_TO || senderEmail;
    const htmlContent = buildWelcomeEmailHtml(prenom);
    const subject     = `Confirmation d'adhésion au Club ARSII IIT – ${p}`;

    const textContent = [
      `Bonjour ${p} !`, '',
      `Ton adhésion au Club ARSII IIT est bien confirmée ! 🎉`, '',
      `Nous avons le plaisir de te confirmer que ton formulaire d'adhésion au Club ARSII IIT a bien été reçu et validé.`,
      `Merci pour ton intérêt ! Nous sommes ravis de t'accueillir au sein de notre communauté.`, '',
      `Au Club ARSII IIT, tu pourras :`,
      `- Participer à nos ateliers techniques et formations pratiques.`,
      `- Travailler sur des projets technologiques innovants.`,
      `- Rencontrer des étudiants motivés et élargir ton réseau.`, '',
      `Suis-nous sur Instagram pour ne rien manquer : https://www.instagram.com/arsii_iit/`, '',
      `À très bientôt au Club ARSII IIT !`,
      `L'équipe Club ARSII IIT`, '',
      `INNOVER • CONNECTER • IMPACTER`,
      `Association ARSII - Institut International de Technologie (IIT Sfax)`,
    ].join('\n');

    const attachments = [
      {
        filename: 'logo-arsii.png',
        path: path.join(__dirname, 'assets', 'img', 'logo-light.png'),
        cid: 'logo-arsii',
        contentType: 'image/png',
      },
      {
        filename: 'campus-iit.jpg',
        path: path.join(__dirname, 'assets', 'img', 'iit-campus.jpg'),
        cid: 'campus-iit',
        contentType: 'image/jpeg',
      },
      {
        filename: 'qr-instagram.png',
        path: path.join(__dirname, 'assets', 'img', 'qr-instagram.png'),
        cid: 'qr-instagram',
        contentType: 'image/png',
      },
    ];

    const info = await mailClient.sendMail({
      from: fromAddress,
      replyTo: replyAddress,
      to: cleanEmail,
      subject,
      text: textContent,
      html: htmlContent,
      attachments,
    });

    console.log(`[Email] ✅ Envoyé avec succès à ${cleanEmail} (ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] ❌ Erreur lors de l'envoi à ${email} :`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendWelcomeEmail, buildWelcomeEmailHtml, getTransporter };