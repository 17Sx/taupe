# 🐾 Taupe

Explorateur d'espace disque rapide pour macOS. Zéro dépendance, il faut seulement Node ≥ 20.

## Lancer

Double-clique sur `start.command` dans le Finder, ou :

```bash
npm start
```

La page s'ouvre sur http://127.0.0.1:4747.

## Ce que ça fait

- **Contenu** : liste triée par taille + treemap cliquable du dossier courant. Ça se met à jour en direct pendant le scan.
- **Gros fichiers** : les 300 plus gros fichiers du dossier et de tous ses sous-dossiers.
- **Par type** : vidéos, images, archives, apps, dépendances dev… et le détail par extension.
- **Nettoyable** : `node_modules`, `.next`, caches, DerivedData, simulateurs, Corbeille, etc.
- **Suppression** : tout part à la **Corbeille** (`/usr/bin/trash`) après confirmation. Les dossiers système et les dossiers principaux sont protégés.

## IA (avec ton abonnement Claude ou ChatGPT)

Taupe appelle les CLI installées sur ton Mac, donc pas de clé API ni de facturation à l'usage :
- **Claude** → CLI `claude` (Claude Code). Connecte-toi avec `claude` puis `/login`.
- **ChatGPT** → CLI `codex`. Connecte-toi avec `codex login`.

Fonctions :
- **✨ Suggestions** : règles automatiques instantanées (caches de build, `node_modules` dormants, worktrees, vieux installeurs, doublons…) + un bouton **Analyse IA** qui renvoie une liste triée avec un niveau de risque.
- **💬 Chat** (panneau de gauche) : pose des questions sur le dossier affiché. L'assistant connaît ce dossier, ses sous-dossiers, ses gros fichiers et ta sélection. Les chemins dans ses réponses sont cliquables.

L'IA ne reçoit que la structure : noms, tailles et dates. Jamais le contenu des fichiers. Elle ne peut rien supprimer : c'est toujours toi qui coches et confirmes.

## Raccourcis

| Touche | Action |
|---|---|
| ↑ ↓ | naviguer |
| → / Entrée | ouvrir le dossier |
| ← / ⌫ | dossier parent |
| Espace | aperçu (Quick Look) |
| ⌘clic / ⇧clic | sélectionner |
| ⌘A | tout sélectionner |
| ⌘⌫ | mettre à la corbeille |
| / | filtrer |

## Astuces

- Les tailles sont celles **réellement occupées sur disque** (comme `du`), avec les hard links comptés une seule fois.
- Pour tout voir (Mail, Messages, Photos…), donne l'**Accès complet au disque** à ton Terminal : Réglages Système → Confidentialité et sécurité → Accès complet au disque.
- Le serveur n'écoute que sur `127.0.0.1` et exige un jeton secret injecté dans la page : un site web ne peut donc pas déclencher de suppression.
