# Sécurité

## Signaler une faille

Ne publie pas d'issue publique. Utilise **[Security → Report a vulnerability](https://github.com/17Sx/taupe/security/advisories/new)** sur GitHub. Je réponds dès que possible.

## Modèle de sécurité

- L'interface parle à un moteur local qui écoute **uniquement sur 127.0.0.1**, sur un port aléatoire.
- Chaque requête doit porter un **jeton secret** généré au démarrage et injecté dans la page (anti-CSRF). L'en-tête `Host` est vérifié (anti DNS-rebinding).
- Une suppression envoie **l'identifiant et le chemin attendu**. Si l'arbre a changé entre-temps, la suppression est refusée.
- Les suppressions passent par la **Corbeille** du système (`shell.trashItem`). Les dossiers système et les dossiers principaux de l'utilisateur sont **toujours refusés**.
- La fenêtre Electron est isolée : `contextIsolation`, `sandbox`, pas de `nodeIntegration`, aucune navigation hors de l'app.
- L'IA (Claude Code / Codex) est lancée **sans aucun outil** (pas de shell, pas d'accès aux fichiers). Elle ne reçoit que des chemins, des tailles et des dates.
