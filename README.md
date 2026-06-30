# 🎬 Drift Stream — Lecteur de Revue Augmenté

> **Hackathon ESTIAM × 42C 2026** — Pôle 1 *Application & Collaboration* · **Sujet A**
> Plateforme Vidéo B2B « V-Secure & Collaborate »

Expérience utilisateur **interactive et collaborative** posée sur un lecteur
vidéo : on **dessine** des annotations (flèches, formes, dessin libre, texte)
directement sur l'image, on **commente à l'horodatage** près, et tout est
**synchronisé en temps réel** entre les participants via WebSockets. Le tout
s'exporte en **JSON** (le livrable autonome demandé).

---

## ✅ Conformité au sujet

| Exigence du brief | Implémentation |
|---|---|
| **Interface React** | Client Vite + React 18 + TypeScript |
| **Annotations dessinées (flèches, formes)** | Overlay **Canvas API** : flèche, rectangle, ellipse, dessin libre, texte — **éditables** (sélection, déplacement, redimensionnement par poignées), **gomme** et **éditeur de texte inline** (sans `prompt` navigateur) |
| **Commentaires horodatés en temps réel** | Panneau de commentaires liés au temps vidéo, diffusés via **WebSockets** |
| **Stack : React · WebSockets · Canvas API** | Exactement cette stack — aucune dépendance UI lourde |
| **Livrable : composant autonome exportant les annotations en JSON** | `<ReviewPlayer />` autonome + bouton **« Exporter JSON »** ([format](#-format-du-livrable-json)) |

### Au-delà du minimum
- 🏠 **Salles personnelles & rôles collaboratifs** : on **crée sa propre salle** (et on en devient propriétaire) ou on **rejoint** celle d'un ami via un lien. Un panneau **Participants** liste les présents avec leur rôle ; un propriétaire peut **promouvoir** un invité au rang de propriétaire (mêmes droits) ou le **rétrograder**, et un invité peut **demander le rôle propriétaire** — la demande arrive aux propriétaires qui **acceptent / refusent**. Plusieurs propriétaires possibles ; la dernière couronne ne peut pas être retirée. Tout est **vérifié côté serveur**.
- 🌗 **Thème clair / sombre** : bascule instantanée, mémorisée, appliquée à toute l'interface (variables CSS) sans toucher au reste.
- ✏️ **Annotations entièrement éditables** : avec l'outil **Sélection**, on clique une forme pour la **déplacer** ou la **redimensionner** (poignées de coins / d'extrémités) ; la **gomme** (ou la touche `Suppr`) la supprime. Toutes les modifications sont diffusées en temps réel.
- 🅣 **Éditeur de texte inline (façon Canva)** : la saisie de texte ouvre une **zone d'écriture directement sur le canvas** (plus de boîte de dialogue `prompt`), et le texte reste éditable (double-clic) et supprimable comme toute autre forme.
- 👑 **Rôle propriétaire & média de salle (CRUD)** : le **premier arrivé** devient propriétaire et gère le média partagé (charger une vidéo par URL ou échantillon, le remplacer, le retirer). Les **invités** sont en lecture seule — ils annotent et commentent mais ne peuvent ni ajouter ni supprimer le média. La règle est **appliquée côté serveur** (pas seulement masquée dans l'UI). Si le propriétaire quitte, la propriété est transmise au plus ancien participant restant.
- 📝 **Mode tableau blanc** : à la place d'une vidéo, le propriétaire peut démarrer une **feuille blanche** (claire ou sombre) pour dessiner et collaborer librement, sans timeline.
- 👥 **Présence en direct** (avatars, statut de connexion) et **curseurs collaboratifs**.
- 🔁 **Sync d'état à la connexion** : un participant qui rejoint reçoit tout l'état (média, annotations, commentaires, propriétaire).
- 🧭 **Timeline augmentée** : marqueurs d'annotations et de commentaires cliquables.
- ⌨️ **Raccourcis clavier** (espace = lecture/pause, `v` sélection, `a` flèche, `r` rect, `e` ellipse, `p` crayon, `t` texte, `g` gomme, `Suppr` supprimer la sélection, `f` plein écran, `m` muet).
- 🌐 **Robustesse** : reconnexion automatique, **mode local** si le serveur est injoignable, et plus de doublon de session (correctif React StrictMode).

---

## 🚀 Démarrage

Prérequis : **Node.js ≥ 18**.

```bash
# 1. Installer toutes les dépendances (racine + client + serveur)
npm run install:all

# 2. Lancer le serveur de collaboration ET le client en parallèle
npm run dev
```

- Client : http://localhost:5173
- Serveur WebSocket : ws://localhost:8080

Ouvrez **deux onglets** sur la même salle (ex. `?room=revue-demo`) pour voir la
collaboration en temps réel : annotations, commentaires et curseurs se
propagent instantanément.

### Lancement séparé

```bash
npm run dev:server   # serveur WebSocket seul
npm run dev:client   # client Vite seul
npm run build        # build de production du client
```

---

## 🧩 Architecture

```
Drift Stream/
├── client/                      # React + Vite + TypeScript
│   └── src/
│       ├── components/
│       │   ├── ReviewPlayer.tsx     # ⭐ composant autonome (livrable) : média + canvas + timeline + export
│       │   ├── AnnotationCanvas.tsx # overlay Canvas API : dessin + rendu des annotations & curseurs
│       │   ├── MediaControls.tsx    # CRUD du média (propriétaire) : vidéo / tableau blanc / retrait
│       │   ├── ParticipantsPanel.tsx# participants, rôles, promotion/rétrogradation, demandes
│       │   ├── Toolbar.tsx          # outils (sélection, flèche, formes, crayon, texte, gomme)
│       │   ├── CommentsPanel.tsx    # commentaires horodatés
│       │   └── PresenceBar.tsx      # présence + statut de connexion
│       ├── lib/
│       │   ├── useCollab.ts         # hook WebSocket (sync optimiste, reconnexion, présence)
│       │   ├── annotations.ts       # géométrie normalisée, visibilité, export JSON
│       │   └── types.ts             # modèle de domaine partagé
│       └── App.tsx                  # écran de connexion + salle de revue
└── server/
    └── index.js                 # serveur WebSocket (salles, broadcast, présence, sync)
```

### Choix techniques notables
- **Géométrie normalisée (0..1)** : les annotations sont stockées en coordonnées
  relatives au cadre vidéo → elles restent alignées quel que soit le
  redimensionnement du lecteur (responsive, plein écran).
- **Annotations pinées à un instant** : chaque dessin porte un `time` (secondes)
  et n'apparaît qu'autour de ce moment (fenêtre ±3 s avec fondu), comme une vraie
  revue image par image.
- **Sync optimiste** : l'UI applique l'action localement puis le serveur la
  rediffuse à tous — réactivité immédiate, cohérence garantie.
- **Serveur sans base de données** : état en mémoire par salle, reproductible
  localement en une commande (seule dépendance : `ws`).

### Protocole WebSocket (messages JSON)

| Client → Serveur | Serveur → Clients |
|---|---|
| `join` `{ roomId, name }` | `welcome` (état complet + `owners[]` + `media`), `presence` (avec `owners[]` et `isOwner` par participant), `peer:joined` / `peer:left` |
| `media:set` / `media:remove` *(propriétaires uniquement)* | `media:update` `{ media }` |
| `role:grant` / `role:revoke` `{ peerId }` *(propriétaires)* · `role:request` *(invité)* | `role:granted` / `role:revoked` (au concerné) · `role:request` (aux propriétaires) · `presence` (rôles à jour) |
| `annotation:add` / `:update` / `:delete` / `:clear` | `annotation:upsert` / `annotation:delete` / `annotation:clear` |
| `comment:add` / `comment:delete` | `comment:add` / `comment:delete` |
| `cursor` `{ x, y }` | `cursor` (rediffusé aux autres) |

> Le serveur vérifie `room.owners.has(clientId)` avant tout `media:set` / `media:remove` / `role:grant` / `role:revoke` : un invité qui tente une action réservée est **ignoré**.

---

## 📦 Format du livrable JSON

Le bouton **« Exporter JSON »** produit un fichier autonome décrivant toute la
revue (voir [`docs/sample-export.json`](docs/sample-export.json)) :

```json
{
  "schema": "drift-stream/review-export",
  "version": 1,
  "exportedAt": "2026-06-30T10:00:00.000Z",
  "room": "revue-demo",
  "media": { "kind": "video", "src": "…/BigBuckBunny.mp4", "title": "Big Buck Bunny", "duration": 596.5 },
  "annotations": [
    {
      "id": "a_…", "tool": "arrow", "time": 12.5,
      "color": "#ff5c7c", "strokeWidth": 3,
      "x1": 0.21, "y1": 0.18, "x2": 0.46, "y2": 0.42,
      "authorName": "Selyess"
    }
  ],
  "comments": [
    { "id": "c_…", "text": "Recadrer ce plan", "time": 12.5, "authorName": "Selyess" }
  ]
}
```

Les coordonnées étant normalisées, ce JSON est ré-importable et rejouable sur
n'importe quelle taille de lecteur.

---

## 🔌 Réutiliser le composant autonome

`<ReviewPlayer />` est **présentationnel** : tout l'état arrive par props, ce qui
permet de l'utiliser branché à la collaboration (comme dans `App.tsx`) **ou**
en local avec de simples tableaux.

```tsx
<ReviewPlayer
  room="revue-demo"
  media={{ kind: 'video', src: '/ma-video.mp4' }} // ou { kind: 'whiteboard', background: 'white' } | null
  isOwner={true}
  onSetMedia={…}
  onRemoveMedia={…}
  annotations={annotations}
  comments={comments}
  peers={peers}
  self={self}
  cursors={cursors}
  status={status}
  onCreateAnnotation={…}
  onDeleteAnnotation={…}
  onClearAnnotations={…}
  onAddComment={…}
  onDeleteComment={…}
  onCursorMove={…}
/>
```

---

## 🛠️ Stack

**Cœur imposé par le sujet :** **React 18 · WebSockets (`ws`) · Canvas API**
(+ TypeScript · Vite · Node.js).

**Polish UI/UX :** [`framer-motion`](https://www.framer.com/motion/) (animations &
micro-interactions), [`lucide-react`](https://lucide.dev) (icônes),
[`react-hot-toast`](https://react-hot-toast.com) (notifications), **Inter** (typographie).
Ces bibliothèques ne touchent qu'à la présentation : le dessin reste en **Canvas
API** pur et le temps réel en **WebSockets** natifs.

## 📄 Licence

MIT — voir [`LICENSE`](LICENSE).

---

<p align="center"><em>42c × ESTIAM · Hackathon V-Secure & Collaborate · 2026</em></p>
