# Runner Dashboard Ultimate

Dashboard Strava ultime avec analyses avancées, prédictions et conseils personnalisés.

## 🚀 Déploiement sur Render

### Étape 1 : Initialiser Git

```bash
cd "C:\Users\Eleve\Documents\Claude Code\runner-dashboard"
git init
git add .
git commit -m "Initial commit - Runner Dashboard Ultimate"
```

### Étape 2 : Push sur GitHub

1. Crée un nouveau repo sur GitHub (runner-dashboard)
2. Push ton code :

```bash
git remote add origin https://github.com/TON_USERNAME/runner-dashboard.git
git branch -M main
git push -u origin main
```

### Étape 3 : Déployer sur Render

1. Va sur [render.com](https://render.com) et connecte-toi
2. Clique sur **"New +"** → **"Web Service"**
3. Connecte ton repo GitHub
4. Configure :
   - **Name** : `runner-dashboard` (ou ce que tu veux)
   - **Environment** : `Python 3`
   - **Build Command** : `pip install -r requirements.txt`
   - **Start Command** : `python server.py`
   - **Plan** : `Free`

5. **Variables d'environnement** (dans l'onglet Environment) :
   ```
   STRAVA_CLIENT_ID = 264617
   STRAVA_CLIENT_SECRET = d3f2b7e2f4d8aa88d99f6f74acd586f252068988
   REDIRECT_URI = https://TON-APP.onrender.com/auth/callback
   ```
   (Remplace `TON-APP` par le nom que Render te donne)

6. Clique sur **"Create Web Service"**

### Étape 4 : Configurer Strava

1. Va sur [strava.com/settings/api](https://www.strava.com/settings/api)
2. Dans **"Authorization Callback Domain"**, ajoute :
   ```
   TON-APP.onrender.com
   ```

### Étape 5 : C'est en ligne ! 🎉

Ton dashboard sera accessible sur : `https://TON-APP.onrender.com`

⚠️ **Note** : Le plan gratuit de Render met le service en veille après 15 min d'inactivité. Le premier chargement peut prendre 30-60 secondes.

## ✨ Fonctionnalités

- 📊 Dashboard complet avec statistiques
- 🏃 Liste de tous tes runs avec recherche
- 🎯 Prédictions sur 400m, 800m, 1km, 5km, 10km, Semi, Marathon
- 💡 Conseils personnalisés pour progresser
- 🔍 Analyses critiques détaillées
- 📈 Graphiques de progression
- ❤️ Zones de fréquence cardiaque
- 🏆 Records et objectifs
- ⚖️ Équivalences d'effort
- Et bien plus !
