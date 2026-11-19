# Changelog

Toutes les évolutions notables de Taupe. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- **L'assistant agit dans Taupe** : il cherche, lit des dossiers, repère les gros fichiers, ouvre, coche et propose des mises à la corbeille (toujours confirmées par l'utilisateur).
- Chaque action de l'IA s'affiche **en direct avec une animation** dans l'assistant, et l'interface réagit (dossier ouvert, lignes sélectionnées).
- Bouton « Arrêter » pendant une réponse de l'IA.

### Modifié
- Retour du logo aux traces de pattes : icône de l'app, logo de l'en-tête et icône d'onglet.

### Corrigé
- La fenêtre s'affiche toujours au démarrage, et une erreur claire apparaît si le moteur ne répond pas.

## [1.0.0] - 2026-11-19

Première version publique.

### Ajouté
- Application de bureau **macOS** (Apple Silicon et Intel) et **Windows** (x64, ARM64), basée sur Electron.
- Scan parallèle très rapide avec affichage en direct, liste triée et treemap.
- Onglets Gros fichiers, Par type, Nettoyable et **Suggestions** (règles automatiques avec niveau de risque).
- **Assistant IA** contextuel et **analyse IA** via ton abonnement Claude (Claude Code) ou ChatGPT (Codex CLI).
- **Connexion en un clic** à Claude ou ChatGPT : installation automatique de l'outil officiel si besoin, page de connexion dans le navigateur, code Claude détecté automatiquement.
- Mise à la Corbeille native, « Afficher dans le Finder / l'Explorateur », Quick Look sur macOS, sélecteur de dossier natif.
- Identité visuelle blanc / noir / orange, icônes au trait fin, thèmes clair et sombre (menu Présentation → Apparence).
