'use strict';
// UI translation. French is the source language: French strings are the keys and English
// translations live in EN below. The language comes from ?lang= (set by the desktop app from the
// system language or View → Language), then from the browser.
const LANG = (() => {
  const l = new URLSearchParams(location.search).get('lang') || navigator.language || 'en';
  return l.toLowerCase().startsWith('fr') ? 'fr' : 'en';
})();
const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US';
document.documentElement.lang = LANG;

const EN = {
  // Welcome, header, toolbar
  'Analyser': 'Scan',
  'Parcourir…': 'Browse…',
  'Choisir un dossier…': 'Choose a folder…',
  'Chemin à analyser (~, /, ~/Documents…)': 'Path to scan (~, /, ~/Documents…)',
  'Retour à la racine du scan': 'Back to the scan root',
  'Assistant': 'Assistant',
  'Afficher / masquer l’assistant IA': 'Show / hide the AI assistant',
  'Arrêter': 'Stop',
  'Où est passé ton <span class="hl">espace disque</span>&nbsp;?': 'Where did your <span class="hl">disk space</span> go?',
  'Choisis quoi analyser. Rien n’est supprimé sans ta confirmation, et tout part à la Corbeille.': 'Choose what to scan. Nothing is deleted without your confirmation, and everything goes to the Trash.',
  'Pour tout voir (Mail, Messages, Photos…), donne l’<b>Accès complet au disque</b> à {app} : Réglages Système → Confidentialité et sécurité → Accès complet au disque.':
    'To see everything (Mail, Messages, Photos…), give {app} <b>Full Disk Access</b>: System Settings → Privacy & Security → Full Disk Access.',
  'ton Terminal': 'your Terminal',
  'Certains dossiers système demandent les droits administrateur : clic droit sur Taupe → <b>Exécuter en tant qu’administrateur</b> pour tout voir.':
    'Some system folders need administrator rights: right-click Taupe → <b>Run as administrator</b> to see everything.',
  '<b>{free}</b> libres <span class="muted">sur {total}</span>': '<b>{free}</b> free <span class="muted">of {total}</span>',
  'Parent': 'Parent', 'Dossier parent (←)': 'Parent folder (←)',
  'Rescanner': 'Rescan', 'Re-scanner ce dossier': 'Rescan this folder',
  'Ouvrir dans le {fm}': 'Open in {fm}', 'Afficher dans le {fm}': 'Show in {fm}',
  'Explorateur': 'File Explorer', 'Fichiers': 'Files', 'Suppr': 'Delete',
  'Contenu': 'Contents', 'Suggestions': 'Suggestions', 'Gros fichiers': 'Big files', 'Par type': 'By type', 'Nettoyable': 'Cleanable',
  'Filtrer par nom…': 'Filter by name…',
  '↑↓ naviguer · → ouvrir · ← remonter · Espace aperçu · {mod}/⇧clic sélection · {del} corbeille': '↑↓ move · → open · ← up · Space preview · {mod}/⇧click select · {del} trash',
  'Dossier perso': 'Home folder',
  '{n} fichier': '{n} file', '{n} fichiers': '{n} files',
  'Différence entre l’espace utilisé et ce qui est visible : système, snapshots APFS (Time Machine), espace purgeable, fichiers d’autres utilisateurs non lisibles.':
    'Difference between used space and what is visible: system, APFS snapshots (Time Machine), purgeable space, other users’ unreadable files.',
  'volume utilisé : {x}': 'disk used: {x}',
  'Ces dossiers n’ont pas pu être lus (droits d’accès).': 'These folders could not be read (permissions).',
  '⚠ {n} dossier inaccessible': '⚠ {n} unreadable folder', '⚠ {n} dossiers inaccessibles': '⚠ {n} unreadable folders',
  'L’assistant voit ce dossier : {p}': 'The assistant sees this folder: {p}',
  'Nom': 'Name', 'Taille': 'Size', 'Modifié': 'Modified',
  'accès refusé': 'access denied', 'autre volume': 'other volume',
  'Aperçu (Espace)': 'Preview (Space)', 'Ouvrir (→)': 'Open (→)', 'Ouvrir dans Taupe': 'Open in Taupe',
  'Aucun résultat pour ce filtre': 'No results for this filter',
  'Rien de connu à nettoyer ici': 'Nothing known to clean up here',
  'Accès refusé à ce dossier.': 'Access to this folder was denied.',
  'Vérifie les autorisations du système.': 'Check the system permissions.',
  'Dossier vide': 'Empty folder',
  '+ {n} autres éléments plus petits · {size}': '+ {n} more, smaller items · {size}',
  '{n} élément': '{n} item', '{n} éléments': '{n} items',
  ' — les plus gros fichiers de ce dossier et sous-dossiers': ' — the biggest files in this folder and its subfolders',
  ' — caches & dossiers régénérables connus': ' — known caches & regenerable folders',
  'Rien à afficher': 'Nothing to show',
  'à l’instant': 'just now',
  'Clic pour ouvrir': 'Click to open', 'Fichier': 'File',

  // Types
  'Par catégorie': 'By category', 'Par extension': 'By extension', 'Vide': 'Empty',
  '« Applications » = contenu des .app · « Dépendances & builds dev » = node_modules, .git, .next, venv, DerivedData…':
    '“Applications” = contents of .app bundles · “Dev dependencies & builds” = node_modules, .git, .next, venv, DerivedData…',
  '(hors apps & dépendances — clique pour voir les fichiers)': '(excluding apps & dependencies — click to see the files)',
  'Voir les plus gros fichiers .{ext}': 'See the biggest .{ext} files', '{n} fich.': '{n} files',
  'Vidéos': 'Videos', 'Images': 'Images', 'Audio': 'Audio', 'Archives & images disque': 'Archives & disk images', 'Documents': 'Documents',
  'Code': 'Code', 'Bases de données & logs': 'Databases & logs', 'Applications': 'Applications', 'Dépendances & builds dev': 'Dev dependencies & builds',
  'Autres': 'Other', '(sans extension)': '(no extension)',

  // Suggestions
  'Sans risque': 'Safe', 'À vérifier': 'Check first', 'Prudence': 'Careful',
  'Pas de mise à la corbeille directe pour celui-ci': 'Not trashable directly',
  'Tout sélectionner': 'Select all', 'Réduire': 'Show less', 'Voir les {n} autres': 'Show {n} more',
  'Repéré automatiquement': 'Found automatically',
  'Rien de suspect selon les règles automatiques. Essaie l’analyse IA.': 'Nothing suspicious according to the built-in rules. Try the AI analysis.',
  '{p} analyse <b>{path}</b>… {s} s <span class="muted">(compte 1 à 2 min)</span>': '{p} is analyzing <b>{path}</b>… {s} s <span class="muted">(about 1–2 min)</span>',
  'L’analyse a échoué.': 'The analysis failed.',
  'Ton compte {p} n’est pas connecté.': 'Your {p} account is not connected.',
  '{n} suggestion': '{n} suggestion', '{n} suggestions': '{n} suggestions',
  'Sélectionner les {n} « sans risque » ({size})': 'Select the {n} “safe” ones ({size})',
  'Copier': 'Copy', 'Commande copiée': 'Command copied',
  'Aucune suggestion exploitable.': 'No usable suggestion.',
  'Connecte ton abonnement Claude ou ChatGPT pour obtenir une liste triée de ce que tu peux supprimer, avec le niveau de risque. L’IA ne voit que les noms, tailles et dates — jamais le contenu de tes fichiers.':
    'Connect your Claude or ChatGPT subscription to get a sorted list of what you can delete, with a risk level. The AI only sees names, sizes and dates — never the contents of your files.',
  'L’IA voit les noms, tailles et dates des éléments les plus lourds — <b>jamais le contenu de tes fichiers</b> — et propose quoi supprimer, avec le niveau de risque. Rien n’est supprimé sans toi.':
    'The AI sees the names, sizes and dates of the heaviest items — <b>never the contents of your files</b> — and suggests what to delete, with a risk level. Nothing is deleted without you.',
  'Analyse IA': 'AI analysis', 'Comptes': 'Accounts', 'Relancer': 'Run again', 'Analyser ce dossier': 'Analyze this folder',
  'Analyse IA terminée : {n} suggestions': 'AI analysis done: {n} suggestions',

  // Selection, Trash
  '<b>{n}</b> élément sélectionné · <b>{size}</b>': '<b>{n}</b> item selected · <b>{size}</b>',
  '<b>{n}</b> éléments sélectionnés · <b>{size}</b>': '<b>{n}</b> items selected · <b>{size}</b>',
  'Tout désélectionner': 'Deselect all', 'Mettre à la corbeille': 'Move to Trash',
  'Mettre {n} éléments à la corbeille ? ({size})': 'Move {n} items to the Trash? ({size})',
  'Mettre « {name} » à la corbeille ? ({size})': 'Move “{name}” to the Trash? ({size})',
  'Les éléments vont dans la Corbeille : tu peux encore les récupérer. L’espace n’est vraiment libéré qu’une fois la Corbeille vidée.':
    'Items go to the Trash, so you can still get them back. The space is only freed once the Trash is emptied.',
  'Annuler': 'Cancel',
  '✓ {n} élément à la corbeille · <b>{size}</b>': '✓ {n} item moved to the Trash · <b>{size}</b>',
  '✓ {n} éléments à la corbeille · <b>{size}</b>': '✓ {n} items moved to the Trash · <b>{size}</b>',
  'Vide la Corbeille pour vraiment libérer l’espace.': 'Empty the Trash to actually free the space.',

  // Assistant
  'Effacer': 'Clear', 'Nouvelle conversation': 'New conversation', 'Masquer l’assistant': 'Hide the assistant',
  'Comptes IA (Claude / ChatGPT)': 'AI accounts (Claude / ChatGPT)', 'Comptes IA': 'AI accounts',
  'Modèle utilisé (ton abonnement)': 'Model used (your subscription)', 'Envoyer': 'Send', 'Fermer': 'Close',
  'Ton abonnement Claude ou ChatGPT, via leurs outils officiels : pas de clé API, pas de frais en plus.': 'Your Claude or ChatGPT subscription, through their official tools: no API key, no extra cost.',
  'Interrompu.': 'Interrupted.',
  'Qu’est-ce qui prend le plus de place ici ?': 'What takes the most space here?',
  'Trouve tous les node_modules et sélectionne-les': 'Find all node_modules folders and select them',
  'Montre-moi mes plus gros fichiers': 'Show me my biggest files',
  'Supprime les vieux installeurs .dmg': 'Delete old .dmg installers',
  'C’est quoi ces dossiers ?': 'What are these folders?',
  'Ouvrir dans Taupe · {size}': 'Open in Taupe · {size}',
  'Connecte ton IA': 'Connect your AI',
  'Pose des questions sur tes dossiers avec ton abonnement Claude ou ChatGPT. Pas de clé API, pas de frais en plus.': 'Ask about your folders with your Claude or ChatGPT subscription. No API key, no extra cost.',
  'Demande-moi d’explorer, de trouver ou de faire le ménage dans le dossier affiché. Je vois les noms, tailles et dates — pas le contenu de tes fichiers — et je te demande toujours avant de supprimer.':
    'Ask me to explore, find or clean up the folder on screen. I see names, sizes and dates — not the contents of your files — and I always ask before deleting anything.',
  'Réfléchit…': 'Thinking…', 'Lit le dossier et réfléchit…': 'Reading the folder and thinking…',
  'Recherche {q} dans {where}…': 'Searching for {q} in {where}…',
  'Recherche {q} — {n} résultat': 'Search {q} — {n} result', 'Recherche {q} — {n} résultats': 'Search {q} — {n} results',
  'Repère les plus gros fichiers de {where}…': 'Finding the biggest files in {where}…', 'Plus gros fichiers de {where}': 'Biggest files in {where}',
  'Ouvre et lit {where}…': 'Opening and reading {where}…', 'Lit {where} — {n} éléments': 'Read {where} — {n} items',
  'Affiche {where}': 'Showing {where}',
  'Sélectionne {n} élément · {size}': 'Selecting {n} item · {size}', 'Sélectionne {n} éléments · {size}': 'Selecting {n} items · {size}',
  'Tout cocher': 'Check all', 'Tout décocher': 'Uncheck all', 'Non': 'No',
  'Met {n} élément à la corbeille…': 'Moving {n} item to the Trash…', 'Met {n} éléments à la corbeille…': 'Moving {n} items to the Trash…',
  '{n} élément à la corbeille': '{n} item moved to the Trash', '{n} éléments à la corbeille': '{n} items moved to the Trash',
  '<b class="freed">{size}</b> libérés': '<b class="freed">{size}</b> freed', '{size} libérés': '{size} freed',
  '{n} gardé': '{n} kept', '{n} gardés': '{n} kept', '{n} échec(s)': '{n} failed',
  'Suppression refusée': 'Deletion declined', 'Suppression non confirmée': 'Deletion not confirmed',
  'Mettre à la corbeille {on} sur {n} éléments ?': 'Move {on} of {n} items to the Trash?',
  'Mettre cet élément à la corbeille ?': 'Move this item to the Trash?',
  'Mettre {n} éléments à la corbeille': 'Move {n} items to the Trash',
  'Arrêté.': 'Stopped.', 'Erreur inconnue': 'Unknown error',
  'Ton compte n’est pas connecté : clique sur « Comptes » en haut de l’assistant.': 'Your account is not connected: click “Accounts” at the top of the assistant.',
  'Installation de l’outil {p} officiel…': 'Installing the official {p} tool…', 'environ 1 min': 'about 1 min',
  'Connecte-toi dans la page {p} qui vient de s’ouvrir.': 'Sign in on the {p} page that just opened.',
  'Copie le code affiché à la fin : il est validé automatiquement dès que tu reviens ici.': 'Copy the code shown at the end: it is submitted automatically as soon as you come back here.',
  'ou colle le code ici': 'or paste the code here', 'Valider': 'Submit', 'Rouvrir la page': 'Reopen the page',
  'La connexion à {p} a échoué.': 'Connecting to {p} failed.',
  'Continuer avec {p}': 'Continue with {p}',
  'Compte {p} connecté': '{p} account connected',
  'Connecter aussi ton compte {p}': 'Also connect your {p} account',
  'Pose une question sur ce dossier… (Entrée pour envoyer)': 'Ask about this folder… (Enter to send)',
  'Connecte un compte IA pour discuter': 'Connect an AI account to chat',
  'Non installé': 'Not installed', 'Connecté': 'Connected', 'Non connecté': 'Not connected', 'Prêt': 'Ready', 'Se déconnecter': 'Sign out',
  'Agent de démonstration': 'Demo agent', 'Démo': 'Demo',
  'Code envoyé, connexion en cours…': 'Code sent, signing in…',

  // Scan
  'Reconnecté': 'Reconnected',
  'Le moteur ne répond plus — relance Taupe': 'The engine is not responding — restart Taupe',
  'Analyse de <b>{path}</b> — <b>{n}</b> fichiers · <b>{size}</b> · {s} s · <span>{cur}</span>': 'Scanning <b>{path}</b> — <b>{n}</b> files · <b>{size}</b> · {s} s · <span>{cur}</span>',
  '✓ Analyse terminée : <b>{n}</b> fichiers en {s} s': '✓ Scan complete: <b>{n}</b> files in {s} s',
};

function t(s, v) {
  let r = LANG === 'fr' ? s : (EN[s] ?? s);
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
  return r;
}
// Plural: in French 0 and 1 are singular, in English only 1 is
const isPlural = n => (LANG === 'fr' ? n > 1 : n !== 1);
function tn(n, one, many, v = {}) {
  return t(isPlural(n) ? many : one, { n: new Intl.NumberFormat(LOCALE).format(n), ...v });
}
// Static HTML text: data-t (content), data-t-title (tooltip), data-t-ph (placeholder)
function applyI18n(root = document) {
  if (LANG === 'fr') return;
  for (const el of root.querySelectorAll('[data-t]')) el.innerHTML = t(el.innerHTML.trim());
  for (const el of root.querySelectorAll('[data-t-title]')) el.title = t(el.title);
  for (const el of root.querySelectorAll('[data-t-ph]')) el.placeholder = t(el.placeholder);
}
