# 🌌 Mana Family — la quille

> **La Présence fait vivre. La Mémoire fait durer.**

Le système de cercles familiaux vivants. Vision complète : [docs/mana-family-livre-blanc.md](docs/mana-family-livre-blanc.md) (v2.7, figé) et son compagnon [docs/mana-family-pistes-produit.md](docs/mana-family-pistes-produit.md).

## Ce que cette quille contient

**Incrément 1 — la primitive transmission dans un Cercle 1 réel.** Un appareil, une famille, un mois. Si des parents transmettent spontanément au lieu de texter, tout le reste a un sol.

- **Fondation** : nommer la famille, allumer les astres du Cercle.
- **Transmettre** : deux gestes (type, destinataires) puis les mots. L'épreuve de vérité n°2 (battre WhatsApp en friction) se joue sur cet écran.
- **Le fil de vie** : les transmissions se contemplent ; la **lueur** ✦ apparaît quand quelqu'un a veillé — et son absence ne se voit jamais (asymétrie, livre blanc §6).

## Décisions de charpente

- **Repo séparé, base séparée** : les données d'enfants ne cohabitent pas avec une app sociale publique (§9). On réutilise les recettes de l'écosystème MANA, pas ses bases.
- **Le voilage est dans la quille** : voir [supabase/migrations/00010000000000_quille.sql](supabase/migrations/00010000000000_quille.sql) — table `veils` native, graphe centré sur les astres (jamais sur un foyer payeur), pas de `deleted_at` sur les transmissions.
- **Stockage local d'abord** ([src/store.ts](src/store.ts)) : l'adaptateur Supabase remplacera le module au même contrat à l'incrément 2 — le pont ne bouge pas quand la coque change.
- **Interdits câblés dans le code** : pas de compteur, pas de complétude, pas de « qui n'a pas veillé », pas de suppression de mémoire.

## Lancer

```bash
npm install
npm run dev   # port 5175
```

## Cap des prochains incréments

1. ~~Primitive transmission (cet incrément)~~ → tester un mois en famille réelle.
2. Adaptateur Supabase (projet neuf, RLS durcie avec le DPO) + multi-appareils.
3. Interface **Veilleuse** (grands-parents : gros boutons, lueur, audio) à côté de l'interface **Architecte**.
4. Capture invisible : widget vocal / transmissions entrantes par SMS.

*Une app, une doctrine : le livre blanc est la loi ; en cas de doute, il gagne.*
