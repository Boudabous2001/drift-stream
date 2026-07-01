# Intégration Streamix — les 3 pôles en une plateforme

> Bloc B du barème (« Intégration & cohérence »). Ce document décrit comment
> **Phantom Frame** (Pôle 1) se branche au **Pôle 2** (Infra/Sécurité) et au
> **Pôle 3** (IA/Data) pour former une seule plateforme, testable via un unique
> `docker-compose up`.

## Schéma des flux

```
                Navigateur — http://localhost:5173
                Phantom Frame (React + Canvas + WebSockets)
                        │
      lecture vidéo     │  panneau IA
      (HLS chiffré)     │  (résumé + chapitres)
        ┌───────────────┼─────────────────┐
        ▼               ▼                  ▼
  Nginx HLS :8001   Key Server :8085   FastAPI IA :8000
  (AES-128, .ts)    (clé si token OK)  (Whisper + Gemini)
     └── Pôle 2 ────────┘                 └── Pôle 3 ──┘

  WebSocket collab :8080  ── Pôle 1 (serveur Node)
```

## Points de branchement (contrats)

| Sens | Contrat | Fichier côté Pôle 1 |
|---|---|---|
| **Pôle 2 → Pôle 1** | Le propriétaire charge une **URL `.m3u8`** (ex. `http://localhost:8001/video/stream.m3u8`). `hls.js` lit le manifeste et demande la clé AES au Key Server avec le **token** (`VITE_HLS_TOKEN`). | [`client/src/hooks/useHLSPlayer.ts`](client/src/hooks/useHLSPlayer.ts) |
| **Pôle 1 → Pôle 3** | Le panneau IA envoie l'**URL MP4** à `POST /analyze-url` et affiche résumé / mots-clés / **chapitres cliquables**, injectés comme annotations violettes sur la timeline. | [`client/src/lib/aiService.ts`](client/src/lib/aiService.ts), [`AIMetadataPanel.tsx`](client/src/components/AIMetadataPanel.tsx) |
| **Pôle 1 → tous** | Le bouton **Exporter JSON** produit annotations + commentaires horodatés (réutilisable par l'analyse d'audience). | [`client/src/lib/annotations.ts`](client/src/lib/annotations.ts) |

## Variables d'environnement (client)

Voir [`client/.env.example`](client/.env.example). Sans elles, l'app fonctionne
en autonome (valeurs par défaut `localhost`).

```
VITE_WS_URL=ws://localhost:8080
VITE_HLS_BASE_URL=http://localhost:8001
VITE_KEY_SERVER_URL=http://localhost:8085
VITE_HLS_TOKEN=token_cyber_2026
VITE_AI_API_URL=http://localhost:8000
```

## Démarrage de la plateforme complète (avec Docker)

La structure attendue par le `docker-compose.yml` unifié (fourni par le Pôle 2) :

```
streamix/
├── docker-compose.yml
├── .env                     # GEMINI_API_KEY=...
├── drift-stream/            # ← CE REPO (contient Dockerfile.client + Dockerfile.server)
├── pole2-infra/
└── pole3-ia/
```

```bash
# 1. générer la clé AES (une fois)
bash pole2-infra/generate_key.sh
# 2. clé Gemini gratuite dans .env  (https://aistudio.google.com/apikey)
# 3. tout lancer
docker-compose up --build
```

> Ce repo fournit les deux images Pôle 1 attendues par le compose :
> [`Dockerfile.client`](Dockerfile.client) (Vite, port 5173) et
> [`Dockerfile.server`](Dockerfile.server) (WebSocket, port 8080).

## Parcours de démo (bout en bout)

1. Ouvrir `http://localhost:5173`, **créer une salle** (on devient propriétaire).
2. Charger `http://localhost:8001/video/stream.m3u8` → lecture du **flux chiffré**
   (sans token valide, la clé est refusée → vidéo illisible = sécurité prouvée).
3. Annoter / commenter en temps réel ; inviter un ami (rôles).
4. Charger une **URL MP4** → le **panneau IA** génère résumé + chapitres, cliquables.
5. **Exporter JSON** → données réutilisables par l'analyse d'audience.
