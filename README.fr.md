[English version](README.md)

<p align="center">
  <img src="build/icon.png" width="112" alt="Taupe">
</p>

<h1 align="center">Taupe</h1>

<p align="center">
  <b>Où est passé ton espace disque ?</b><br>
  Explorateur d'espace disque rapide pour <b>macOS</b> et <b>Windows</b>, avec un assistant IA qui connaît tes dossiers.
</p>

<p align="center">
  <a href="https://github.com/17Sx/taupe-releases/releases/latest">Télécharger</a> ·
  <a href="#fonctionnalités">Fonctionnalités</a> ·
  <a href="#ia-claude--chatgpt">IA</a> ·
  <a href="#développement">Développement</a> ·
  <a href="README.md">English</a>
</p>

---

## Fonctionnalités

- **Scan ultra-rapide** : environ 120 000 fichiers/s, avec un affichage qui se met à jour pendant l'analyse.
- **Liste + treemap** : vois d'un coup d'œil ce qui prend de la place, puis descends dans les dossiers au clavier.
- **Gros fichiers**, **répartition par type**, dossiers **nettoyables** (caches, `node_modules`, DerivedData, `%TEMP%`…).
- **Suggestions** automatiques avec un niveau de risque : caches de build, dépendances de projets dormants, vieux installeurs, doublons, worktrees…
- **Assistant IA** dans un panneau latéral. Il connaît le dossier affiché, et ses réponses contiennent des chemins cliquables.
- **Suppression sûre** : tout part à la **Corbeille** (macOS / Windows) après confirmation. Les dossiers système sont protégés.
- **Interface en français et en anglais** : elle suit la langue du système et se change dans Présentation → Langue.
- **100 % local** : aucune donnée n'est envoyée, sauf à l'IA si tu l'utilises (structure uniquement, voir ci-dessous). La seule autre requête est la recherche de mises à jour (le numéro de la dernière version, sur GitHub), que tu peux désactiver.

## Installer

Télécharge la dernière version sur la page **[Releases](https://github.com/17Sx/taupe-releases/releases/latest)** :

| Système | Fichier |
|---|---|
| macOS Apple Silicon (M1–M4) | `Taupe-x.y.z-mac-arm64.dmg` |
| macOS Intel | `Taupe-x.y.z-mac-x64.dmg` |
| Windows 10/11 (installeur) | `Taupe-x.y.z-win-x64-setup.exe` |
| Windows (portable, sans installation) | `Taupe-x.y.z-win-x64-portable.exe` |

> **macOS** : les versions sont signées avec un Developer ID Apple et notarisées dès que le certificat est en place (voir [docs/signing.md](docs/signing.md)). Les notes de chaque version l'indiquent : si elle n'est pas encore notarisée, fais clic droit → **Ouvrir** au premier lancement, ou lance `xattr -cr /Applications/Taupe.app` dans le Terminal.
> Pour tout analyser (Mail, Photos…), donne l'**Accès complet au disque** à Taupe : Réglages Système → Confidentialité et sécurité.
>
> **Windows** : si SmartScreen s'affiche (version non signée, ou certificat encore récent), choisis **Informations complémentaires → Exécuter quand même**.
>
> **Mises à jour** : l'app installée vérifie s'il existe une nouvelle version, propose de l'installer puis redémarre. Sur macOS, elle ne peut l'installer que dans une version notarisée ; sinon, comme la version portable Windows, elle ouvre la page de téléchargement. Désactivable dans Aide → Rechercher automatiquement les mises à jour.

## IA (Claude / ChatGPT)

Taupe utilise **ton abonnement**, pas une clé API. Il passe par les outils officiels en ligne de commande :

| Fournisseur | Outil officiel utilisé |
|---|---|
| Claude (Pro / Max) | [Claude Code](https://docs.claude.com/en/docs/claude-code/setup) |
| ChatGPT (Plus / Pro) | [Codex CLI](https://github.com/openai/codex) |

Clique sur **Continuer avec Claude** ou **Continuer avec ChatGPT** dans l'assistant :
- si l'outil n'est pas installé, Taupe l'installe automatiquement avec l'installeur officiel ;
- la page de connexion s'ouvre dans ton navigateur ;
- pour Claude, copie le code affiché à la fin : Taupe le détecte tout seul quand tu reviens dans l'app.

Le bouton **Comptes**, en haut de l'assistant, affiche l'état des connexions et permet de se déconnecter.

### L'assistant agit pour toi

Demande-lui par exemple « trouve tous les node_modules et sélectionne-les » ou « supprime les vieux installeurs .dmg ». L'assistant peut :
- **chercher** des fichiers par nom, **lire** un dossier, repérer les **plus gros fichiers** ;
- **ouvrir** un dossier dans Taupe et **cocher** des éléments ;
- **proposer une mise à la corbeille** : une carte de confirmation s'affiche, et rien n'est supprimé tant que tu n'as pas cliqué.

Chaque action s'affiche en direct dans l'assistant, avec une animation. Techniquement, Taupe expose ces outils à Claude Code / Codex via un petit serveur [MCP](https://modelcontextprotocol.io) local (`src/mcp.mjs`). L'IA n'a accès à aucun autre outil : pas de shell, pas de lecture de fichiers (les outils intégrés de Claude Code et les outils de commande de Codex sont désactivés, voir [SECURITY.md](SECURITY.md)). ChatGPT demande un Codex CLI récent : le bouton « Continuer avec ChatGPT » l'installe avec l'installeur officiel d'OpenAI (sans npm ni Node.js).

**Confidentialité** : l'IA reçoit uniquement des **chemins, tailles et dates**, jamais le contenu de tes fichiers. Elle ne peut rien supprimer : c'est toujours toi qui coches puis confirmes.

## Raccourcis

| Action | macOS | Windows |
|---|---|---|
| Naviguer / ouvrir / remonter | ↑ ↓ / → / ← | ↑ ↓ / → / ← |
| Aperçu | Espace (Quick Look) | Espace |
| Sélectionner | ⌘clic, ⇧clic, ⌘A | Ctrl+clic, ⇧clic, Ctrl+A |
| Mettre à la corbeille | ⌘⌫ | Suppr |
| Analyser un dossier | ⌘O | Ctrl+O |
| Afficher l'assistant | ⌘J | Ctrl+J |

## Développement

Il faut [Bun](https://bun.com) 1.4 ou plus récent. Pour construire les installeurs, il faut aussi Node.js 20+, car electron-builder tourne sous Node.

```bash
bun install
bun start            # lance l'application (Electron)
bun run test         # tests du moteur
bun run check        # ESLint (syntaxe comprise), tsc --checkJs
bun run dist:mac     # construit le .dmg (sur macOS)
bun run dist:win     # construit l'installeur .exe (sur Windows)
```

Architecture :

```
electron/main.mjs    fenêtre, menus, actions natives (corbeille, Finder/Explorateur, Quick Look)
electron/worker.mjs  processus « moteur » séparé (le scan ne bloque jamais l'interface)
src/scanner.mjs      scan parallèle + arbre compact en mémoire (typed arrays)
src/server.mjs       API locale 127.0.0.1 protégée par jeton
src/ai.mjs           Claude Code / Codex : chat, analyse, connexion des comptes
src/mcp.mjs          serveur MCP local qui expose les outils de Taupe à l'IA
src/platform.mjs     tout ce qui dépend de macOS / Windows / Linux
public/              interface (HTML/CSS/JS sans framework)
```

Branches : `main` = versions publiées, `develop` = intégration, `feat/*` / `fix/*` = travail en cours. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

Pour publier une version : mets à jour `CHANGELOG.md` et la version dans `package.json`, fusionne `develop` dans `main`, puis pousse un tag `vX.Y.Z`. GitHub Actions construit, signe et notarise les installeurs (quand les certificats sont en place, voir [docs/signing.md](docs/signing.md)) et les publie, avec les fichiers de mise à jour, sur le dépôt public [taupe-releases](https://github.com/17Sx/taupe-releases).

## Licence

[MIT](LICENSE) © 2026 17Sx
