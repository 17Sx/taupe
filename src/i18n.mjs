// Engine strings that reach the UI (errors, suggestions, welcome shortcuts, AI account messages).
// French is the source language (keys); English translations below. The UI sends its language
// in the `x-lang` header of every request.
export const pickLang = l => (String(l || '').toLowerCase().startsWith('fr') ? 'fr' : 'en');

const EN = {
  // API errors
  'Élément introuvable (supprimé ou pas encore scanné)': 'Item not found (deleted or not scanned yet)',
  'Dossier introuvable dans le scan : {p}': 'Folder not found in the scan: {p}',
  'Ce n’est pas un dossier : {p}': 'Not a folder: {p}',
  'Chemin introuvable : {p}': 'Path not found: {p}',
  'Ce chemin n’est pas un dossier': 'This path is not a folder',
  'URL refusée': 'URL refused',
  'Message vide': 'Empty message',
  'Conversation introuvable': 'Conversation not found',
  'Plus rien à confirmer': 'Nothing left to confirm',
  'Conversation terminée': 'Conversation is over',
  'Outil inconnu : {p}': 'Unknown tool: {p}',
  'Une analyse IA est déjà en cours': 'An AI analysis is already running',
  'Attends la fin du scan avant de lancer l’analyse IA': 'Wait for the scan to finish before running the AI analysis',
  'Trop gros': 'Too large', 'JSON invalide': 'Invalid JSON', 'Host refusé': 'Host refused',
  'Jeton invalide — recharge la page': 'Invalid token — reload the page',
  'Route inconnue': 'Unknown route', 'Méthode refusée': 'Method not allowed',
  'Chemin protégé (système ou dossier principal)': 'Protected path (system or main folder)',
  'Non déplacé': 'Not moved',
  'L’élément a changé depuis l’affichage — recharge': 'The item changed since it was displayed — reload',

  // Suggestions (rules)
  'Caches de build (.next, .turbo…)': 'Build caches (.next, .turbo…)',
  'Recréés automatiquement au prochain build ou « npm run dev ».': 'Recreated automatically on the next build or “npm run dev”.',
  'node_modules de projets dormants': 'node_modules of dormant projects',
  'Pas touchés depuis plus de 45 jours. Un « npm install » / « bun install » les recrée.': 'Untouched for more than 45 days. “npm install” / “bun install” recreates them.',
  'Environnements Python dormants': 'Dormant Python environments',
  'Recréables avec « pip install -r requirements.txt ».': 'Recreate them with “pip install -r requirements.txt”.',
  'Données Xcode': 'Xcode data',
  'DerivedData et symboles d’appareils : Xcode les régénère au besoin.': 'DerivedData and device symbols: Xcode regenerates them when needed.',
  'Caches d’applications': 'App caches',
  'Les apps les reconstruisent. Ferme l’app concernée avant.': 'Apps rebuild them. Quit the app first.',
  'Fichiers temporaires Windows': 'Windows temporary files',
  'Dossier %TEMP% : sûr à vider, sauf fichiers verrouillés par une app ouverte.': '%TEMP% folder: safe to empty, except files locked by an open app.',
  'Gros fichiers de log': 'Large log files',
  'Journaux techniques, rarement utiles une fois le problème passé.': 'Technical logs, rarely useful once the problem is gone.',
  'Worktrees git / Claude Code': 'git / Claude Code worktrees',
  'Copies de travail de branches. Vérifie qu’il n’y a rien de non commité, puis « git worktree prune » dans le projet.': 'Working copies of branches. Check there is nothing uncommitted, then run “git worktree prune” in the project.',
  'Vieux installeurs dans Téléchargements': 'Old installers in Downloads',
  '.dmg, .pkg, .exe, .msi, .zip de plus d’une semaine : l’app est sûrement déjà installée.': '.dmg, .pkg, .exe, .msi, .zip older than a week: the app is most likely installed already.',
  'Doublons probables': 'Likely duplicates',
  'Même nom et même taille à plusieurs endroits. On garde la copie la plus récente.': 'Same name and size in several places. The most recent copy is kept.',
  'Gros fichiers pas modifiés depuis plus d’un an': 'Big files not modified for more than a year',
  'À trier à la main : archive-les sur un disque externe ou supprime-les.': 'Sort them by hand: archive them on an external drive or delete them.',
  'Sauvegardes iPhone/iPad': 'iPhone/iPad backups',
  'Les anciennes sauvegardes d’appareils que tu n’as plus sont inutiles.': 'Old backups of devices you no longer own are useless.',
  'projet inactif depuis {age}': 'project inactive for {age}',
  'inactif depuis {age}': 'inactive for {age}',
  'modifié il y a {age}': 'modified {age} ago',
  'téléchargé il y a {age}': 'downloaded {age} ago',
  'pas modifié depuis {age}': 'not modified for {age}',
  'copie de {p}': 'copy of {p}',
  'du {date}': 'from {date}',
  'moins d’un jour': 'less than a day', '{n} jours': '{n} days', '{n} mois': '{n} months', '{n} ans': '{n} years',

  // Cleanable tab
  'Dépendances npm': 'npm dependencies', 'Régénérable avec npm install / bun install': 'Regenerate with npm install / bun install',
  'Cache de build front': 'Front-end build cache', 'Recréé au prochain build': 'Recreated on the next build',
  'Environnement Python': 'Python environment', 'Recréable avec pip install -r requirements.txt': 'Recreate with pip install -r requirements.txt',
  'CocoaPods': 'CocoaPods', 'Régénérable avec pod install': 'Regenerate with pod install',
  'Builds Xcode': 'Xcode builds', 'Sûr à vider, Xcode recompile': 'Safe to empty, Xcode rebuilds',
  'Symboles d’appareils Xcode': 'Xcode device symbols', 'Re-téléchargés si besoin': 'Downloaded again if needed',
  'Simulateurs iOS': 'iOS simulators', 'Supprime les vieux via xcrun simctl delete unavailable': 'Remove old ones with xcrun simctl delete unavailable',
  'Caches d’apps': 'App caches', 'En général sûr à vider (apps fermées)': 'Usually safe to empty (with apps closed)',
  'Fichiers temporaires': 'Temporary files', 'Sûr à vider (%TEMP%)': 'Safe to empty (%TEMP%)',
  'Corbeille': 'Trash', 'Vide-la depuis le Finder pour récupérer l’espace': 'Empty it from the Finder to get the space back',
  'Cache gestionnaire de paquets': 'Package manager cache', 'Re-téléchargé à la demande': 'Downloaded again on demand',
  'Cache Java/Gradle': 'Java/Gradle cache', 'Cache divers (~/.cache)': 'Misc cache (~/.cache)', 'Généralement sûr à vider': 'Usually safe to empty',
  'Gérables depuis le Finder > iPhone': 'Manage them from Finder > iPhone',
  'Docker Desktop': 'Docker Desktop', 'Nettoyer avec docker system prune': 'Clean up with docker system prune',
  'Téléchargements': 'Downloads', 'Souvent plein de vieux installeurs': 'Often full of old installers',
  'Archive Xcode': 'Xcode archive', 'Vieilles archives souvent inutiles': 'Old archives are often useless',

  // Welcome screen shortcuts
  'Dossier perso': 'Home folder', '~ — le plus utile': '~ — most useful',
  'Disque entier': 'Whole disk', '/ — tout le Mac': '/ — the whole Mac', 'tout le disque': 'the whole disk', 'Disque {d}': 'Drive {d}',
  'Applications': 'Applications',

  // AI accounts
  'Fournisseur inconnu': 'Unknown provider',
  'CLI « {p} » introuvable. Connecte ton compte d’abord.': '“{p}” CLI not found. Connect your account first.',
  'Installation terminée mais « {p} » reste introuvable. Redémarre Taupe.': 'Installation finished but “{p}” still cannot be found. Restart Taupe.',
  'Installer ChatGPT (Codex) nécessite Node.js : installe-le depuis nodejs.org puis réessaie.': 'Installing ChatGPT (Codex) requires Node.js: install it from nodejs.org, then try again.',
  'Installation échouée (code {p})': 'Installation failed (code {p})',
  'Délai dépassé ({p} s)': 'Timed out ({p} s)',
  'Réponse IA illisible': 'Unreadable AI response',
};

export function tr(lang, s, v) {
  let r = lang === 'fr' ? s : (EN[s] ?? s);
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
  return r;
}
