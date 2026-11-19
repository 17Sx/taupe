# Contribuer à Taupe

Merci de ton intérêt ! Quelques règles simples :

## Branches

- `main` : uniquement des versions publiées (chaque merge = une release taguée).
- `develop` : branche d'intégration. **Les PR visent `develop`.**
- `feat/nom-court`, `fix/nom-court` : une branche par sujet, créée depuis `develop`.

## Avant d'ouvrir une PR

```bash
npm install
npm run check
npm test
npm start   # vérifie à la main dans l'application
```

- Garde le moteur (`src/`) **sans dépendance** : uniquement des modules Node intégrés.
- Tout ce qui dépend du système va dans `src/platform.mjs` ou `electron/main.mjs`.
- Ajoute une ligne dans `CHANGELOG.md`, section « Non publié ».
- Messages de commit courts, à l'impératif (« Ajoute… », « Corrige… »).

## Sécurité

Rien ne doit pouvoir supprimer un fichier sans confirmation explicite de l'utilisateur. Les suppressions passent toujours par la Corbeille, et l'API locale reste protégée (127.0.0.1, jeton, vérification du chemin). Voir [SECURITY.md](SECURITY.md).
