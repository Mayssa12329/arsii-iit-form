/**
 * Club ARSII IIT – Réception des adhésions dans Google Sheets
 * Collez ce code dans script.google.com (voir README.md).
 */
const SHEET_NAME = 'Adhésions';
const NOTIFY_EMAIL = '';   // ex: 'arsii.iit@gmail.com' → reçoit un email à chaque candidature (laisser vide pour désactiver)

const HEADERS = ['Date', 'Nom', 'Prénom', 'Email', 'Téléphone', 'Niveau', 'Filière',
                 'Année', 'Motivation', 'Centres d’intérêt', 'Source'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse(e.postData.contents);

    if (d.website) return json({ ok: true });                 // honeypot
    if (!d.nom || !d.prenom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '')) {
      return json({ ok: false, error: 'invalid' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#129891').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // Anti-doublon par email
    const emails = sheet.getLastRow() > 1 ? sheet.getRange(2, 4, sheet.getLastRow() - 1, 1).getValues().flat() : [];
    if (emails.includes(d.email)) return json({ ok: true, duplicate: true });

    sheet.appendRow([new Date(), d.nom, d.prenom, d.email, "'" + d.telephone, d.niveau, d.filiere,
                     d.annee, d.motivation, d.interets, d.source]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL, 'Nouvelle adhésion ARSII IIT : ' + d.prenom + ' ' + d.nom,
        'Email : ' + d.email + '\nTéléphone : ' + d.telephone + '\nFilière : ' + d.filiere +
        ' (' + d.niveau + ', ' + d.annee + ')\n\nMotivation :\n' + d.motivation);
    }

    // Envoi automatique de l'email de confirmation à l'adhérent
    if (d.email) {
      try {
        const p = d.prenom ? (d.prenom.trim().charAt(0).toUpperCase() + d.prenom.trim().slice(1).toLowerCase()) : 'Adhérent(e)';
        const subject = "Confirmation d'adhésion au Club ARSII IIT – " + p;
        const body = "Bonjour " + p + " !\n\n" +
          "Ton adhésion au Club ARSII IIT est confirmée ! 🎉\n\n" +
          "Nous avons bien reçu ton formulaire d'adhésion au Club ARSII IIT.\n" +
          "Merci pour ton intérêt ! Nous sommes ravis de te voir rejoindre notre communauté.\n\n" +
          "Au Club ARSII IIT, tu pourras participer à des événements, découvrir de nouvelles idées, " +
          "travailler sur des projets innovants et rencontrer des étudiants passionnés par la technologie.\n\n" +
          "Ensemble, innovons, partageons et avançons !\n\n" +
          "Suis-nous sur Instagram : https://www.instagram.com/arsii_iit/\n\n" +
          "À très bientôt au Club ARSII IIT !\n" +
          "L'équipe ARSII IIT\n" +
          "INNOVER • CONNECTER • IMPACTER\n" +
          "Association ARSII - Institut International de Technologie (IIT Sfax)";

        MailApp.sendEmail({
          to: d.email,
          subject: subject,
          body: body,
          name: 'Club ARSII IIT',
        });
      } catch (errEmail) {
        Logger.log("Erreur envoi email d'adhésion : " + errEmail);
      }
    }

    return json({ ok: true, emailSent: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
