# Formulaire d'adhésion – Club ARSII IIT

Site statique (HTML / CSS / JS pur, aucune dépendance) avec envoi des réponses vers Google Sheets.

```
arsii-iit-form/
├── index.html          ← page + structure du formulaire
├── css/style.css       ← design responsive
├── js/main.js          ← validation, saisie et envoi
├── server.js           ← serveur HTTP & API REST
├── db.js               ← gestion de la base de données SQLite
├── data/
│   ├── adhesions.db    ← base de données SQLite
│   └── adhesions.json  ← copie miroir JSON des adhésions
├── assets/img/         ← logos, photo campus IIT, favicon
└── backend/Code.gs     ← script Google Apps Script alternatif
```

## 1. Lancement et Base de Données
Lancez le serveur avec :
```bash
npm start
# ou
node server.js
```
Le serveur écoute sur **http://localhost:3000** et enregistre directement chaque candidature dans :
- **SQLite :** `data/adhesions.db`
- **JSON :** `data/adhesions.json`

### Endpoints utiles :
- `POST /api/adhesions` : Enregistre une nouvelle adhésion (nom, prénom, email, téléphone, niveau, filière, année, motivation...).
- `GET /api/adhesions` : Récupère la liste de tous les adhérents en JSON.
- `GET /api/adhesions/export.csv` : Télécharge le fichier CSV complet compatible Excel.

## 2. Recevoir les réponses dans Google Sheets (gratuit)
1. Crée un Google Sheet « Adhésions ARSII IIT ».
2. Menu **Extensions → Apps Script**, colle le contenu de `backend/Code.gs`.
3. (Optionnel) mets ton email dans `NOTIFY_EMAIL` pour être notifié.
4. **Déployer → Nouveau déploiement → Application Web** :
   *Exécuter en tant que* : **Moi** · *Accès* : **Tout le monde** → Déployer, autorise l'accès.
5. Copie l'URL `https://script.google.com/macros/s/…/exec`.
6. Dans `js/main.js`, colle-la dans `CONFIG.ENDPOINT`.

> Après chaque modification de `Code.gs`, refais **Déployer → Gérer les déploiements → Nouvelle version**.

## 3. Mettre en ligne (gratuit)
Glisse le dossier sur **Netlify Drop**, ou utilise **GitHub Pages** / **Vercel**.

## Personnalisation
- Couleurs : variables `--teal-*` en haut de `css/style.css`.
- Options des listes (niveau, année) : balises `<option>` dans `index.html`.
- Anti-spam inclus : champ piège invisible + délai minimum + anti-doublon email côté Sheet.
