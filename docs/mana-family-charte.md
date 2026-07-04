# 🎨 Mana Family — Charte « Haute Mer & Clarté calme »

*Proposée par Gemini (l'enlumineur) le 05/07/2026, sans avoir vu la première coque — qui s'était déjà peinte dans les mêmes tons. Convergence prise comme validation : c'est la doctrine qui tient le pinceau. Implémentée dans [src/styles.css](../src/styles.css).*

## Palette

| Nom | Valeur | Usage |
|---|---|---|
| **Noir Atlantique** | `#0B131F` | fond du mode nuit — jamais de noir pur |
| **Écume** | `#F8F9FA` | fond du mode jour — jamais de blanc chirurgical |
| **Toile de Lin** | `#EAE6DF` | cartes, chips, séparations douces |
| **Or Mana** | `#E5B842` | la Lueur, le laiton des boutons — la seule couleur qui « appelle » |
| **Bleu Horizon** | `#2B5275` | repères, titres du mode jour |

Les cinq soins sont des variantes **sourdes, jamais saturées** : santé et école déclinent le Bleu Horizon, l'émotion est une rose éteinte, la logistique est un lin, le souvenir est l'Or Mana. **Aucun rouge dans toute l'application** — il n'y a pas d'urgence dans un ciel calme.

## Typographie

- **La Mémoire (titres, noms des astres, citations)** : serif littéraire — pile `Iowan Old Style / Palatino / Caslon / Georgia`. Le statut d'héritage se pose à l'œil.
- **La Présence (interface, transmissions)** : sans-serif ultra-lisible — pile `Inter / système`. Lisible à 3h du matin par le membre le moins technophile.

## Grammaire visuelle

- **Pas de feed.** L'accueil visé est la **Constellation** : les astres disposés organiquement, halo Or Mana flou autour d'un astre quand quelqu'un a veillé. *(Incrément à venir — rejoint la « carte stellaire » des pistes produit. La v0 affiche le fil de vie, calme, sans scroll infini.)*
- **La Lueur** : jamais de point rouge, jamais de chiffre « 1 ». Une chaleur, pas une alerte. Et toujours asymétrique (livre blanc §6).
- **Le bouton Transmettre** : pièce de laiton — dégradé or, liseré clair, ombre chaude.
- **Les séparateurs** : filets **pointillés** (les routes maritimes des cartes anciennes) ou respiration Toile de Lin. Jamais de ligne grise standard.
- **Icônes** : trait fin, légèrement imparfait, presque dessiné à la main *(à venir — les emoji tiennent le quart en attendant)*.
- **Photos** : aucun filtre ; angles légèrement courbés, comme des tirages argentiques.

## Le tangible — packaging des artefacts

- Livres et coffrets : reliure **toile de lin brut** ou **cuir bleu marine mat**, marquage à chaud **or/laiton**.
- La clé des archives (le Legs) : une vraie clé en **bronze ou laiton lourd**, gravée aux coordonnées de la Constellation, dans son écrin de bois.

## Notes d'implémentation

- Mode nuit par défaut, mode jour via `prefers-color-scheme` — le jour servira de base à l'interface **Veilleuse** (grands-parents).
- Tokens CSS nommés selon la charte (`--noir-atlantique`, `--or-mana`, `--toile-de-lin`…) : le code parle la langue du bateau.
- « Garfield » de la proposition originale est lu comme un lapsus d'enlumineur pour la famille Caslon/Garamond.
