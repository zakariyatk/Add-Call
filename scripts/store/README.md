# Store screenshots

The Microsoft Store and Google Play images in `design/store`, made from the real app with sample people and chats (made-up names; the faces are the sample photos in `public/people`).

```bash
npm run dev -- --port 5175          # in one terminal, from the repo root
cd scripts/store && npm install
node capture.mjs     # drives the app through each screen, saves them to out/raw
node compose.mjs     # lays them out: out/microsoft-store (1920x1080), out/google-play (1080x1920 + 1024x500 feature graphic)
```

`capture.mjs` signs in as a made-up user and answers every request to Supabase itself, from the sample data at its top, so nothing reaches the real project. Copy the results to `design/store` when they look right. Headlines and slide order are the `DESK` and `PHONE` lists in `compose.mjs`; the accent is the app's `#5B3DF5`.

The older Play listing images in `docs/store` are separate; replace them with these if you prefer.
