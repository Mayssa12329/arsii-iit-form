# 🚀 Guide de Déploiement Public & Professionnel — Club ARSII IIT

Ce guide explique étape par étape comment rendre le formulaire d'adhésion public et accessible à tous les étudiants via une adresse HTTPS sécurisée.

---

## 🔒 1. Sécurité Préalable (Déjà configurée)

- **Fichiers protégés via `.gitignore`** : Le mot de passe Gmail (`.env`) et la base SQLite locale (`data/`) ne seront jamais exposés publiquement sur GitHub.
- **Accès Admin Sécurisé** : La route d'exportation CSV et la suppression sont protégées par une clé secrète `ADMIN_KEY` configurable dans les variables d'environnement.
  - Exemple de téléchargement sécurisé du fichier Excel : `https://votre-site.com/api/adhesions/export.csv?key=votre_cle_secrete`

---

## 🌐 Méthode 1 (Recommandée & Gratuite) : Déploiement sur Render.com

Render est la solution cloud la plus simple et moderne avec HTTPS automatique gratuit.

### Étape 1 : Publier le code sur GitHub
1. Ouvrez un terminal dans le dossier du projet (`d:\arsii-iit-form`).
2. Initialisez Git et commitez votre code :
   ```bash
   git init
   git add .
   git commit -m "Formulaire ARSII IIT prêt pour production"
   ```
3. Créez un nouveau dépôt sur [GitHub](https://github.com/new) nommé `arsii-iit-form` (en mode **Public** ou **Private**).
4. Liez et poussez votre code :
   ```bash
   git branch -M main
   git remote add origin https://github.com/VOTRE_PSEUDO/arsii-iit-form.git
   git push -u origin main
   ```

### Étape 2 : Créer le service sur Render
1. Rendez-vous sur [render.com](https://render.com/) et connectez-vous avec votre compte GitHub.
2. Cliquez sur **New +** > **Web Service**.
3. Sélectionnez votre dépôt `arsii-iit-form`.
4. Renseignez les paramètres suivants :
   - **Name** : `arsii-iit-form` (ou le nom de votre choix)
   - **Region** : Frankfurt (EU Central)
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : `Free`

### Étape 3 : Ajouter les variables d'environnement (Secret)
Dans l'onglet **Environment Variables**, ajoutez :
- `SMTP_SERVICE` = `gmail`
- `SMTP_USER` = `arsii.iit189@gmail.com`
- `SMTP_PASS` = *(Votre mot de passe d'application Google)*
- `SMTP_FROM` = `"Club ARSII IIT" <arsii.iit189@gmail.com>`
- `ADMIN_KEY` = *(Choisissez un mot de passe fort pour le bureau du club, ex: `arsii_bureau_2026`)*

5. Cliquez sur **Deploy Web Service**.
6. En moins de 2 minutes, votre formulaire est en ligne avec un lien public sécurisé, ex :
   👉 **`https://arsii-iit-form.onrender.com`**

---

## 🚆 Méthode 2 : Déploiement sur Railway.app (Avec persistance SQLite)

Railway offre un support exceptionnel avec des volumes de disque persistant pour la base de données SQLite :
1. Créez un compte sur [railway.app](https://railway.app/).
2. Cliquez sur **New Project** > **Deploy from GitHub repo**.
3. Dans **Variables**, ajoutez `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` et `ADMIN_KEY`.
4. (Optionnel) Ajoutez un **Persistent Volume** monté sur le dossier `/app/data` pour garantir que les adhésions ne s'effacent jamais lors des redémarrages.
5. Dans **Settings** > **Generate Domain**, récupérez votre URL publique :
   👉 **`https://arsii-iit-form.up.railway.app`**

---

## 🏢 Méthode 3 (Standard Club / Université) : VPS Linux (Hostinger, OVH, etc.)

Idéal si le Club ARSII dispose de son propre serveur ou nom de domaine officiel (ex: `adhesion.arsii-iit.org`) :

### 1. Sur le serveur Ubuntu :
```bash
# Installer Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Cloner le projet et installer
git clone https://github.com/VOTRE_PSEUDO/arsii-iit-form.git /var/www/arsii-form
cd /var/www/arsii-form
npm install --omit=dev

# Configurer .env
cp .env.example .env
nano .env # renseignez vos mots de passe et clés
```

### 2. Démarrage permanent avec PM2 :
```bash
sudo npm install -g pm2
pm2 start server.js --name "arsii-form"
pm2 save
pm2 startup
```

### 3. Nginx Reverse Proxy & SSL Let's Encrypt :
```nginx
server {
    server_name adhesion.arsii-iit.org;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Puis activez le certificat SSL gratuit :
```bash
sudo certbot --nginx -d adhesion.arsii-iit.org
```

---

## ⚡ Méthode 4 (Immédiate) : Tunnel Cloudflare (En 1 minute sans inscription)

Si vous souhaitez partager le formulaire dès maintenant à vos collègues depuis votre ordinateur :
```powershell
npx cloudflared tunnel --url http://localhost:3000
```
Cloudflare vous fournira immédiatement un lien public HTTPS (ex: `https://random-name.trycloudflare.com`) qui redirige directement vers votre serveur local actif !
