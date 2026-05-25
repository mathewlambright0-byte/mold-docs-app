# Mold Docs — Field App

The Mold Docs field app, built as an **installable Progressive Web App (PWA)**.
This is the first real build, grown out of the clickable prototype. It runs on
any phone or computer with a browser — no app store, no install fees, nothing
to compile.

---

## What this is

A self-contained web app. The whole thing is plain HTML, CSS, and JavaScript —
there is no build step and nothing to `npm install`. You can open it directly,
or serve the folder and add it to a phone's home screen where it behaves like a
native app (full screen, its own icon, works offline).

```
mold-docs-app/
├── index.html              the app
├── manifest.webmanifest    makes it installable (name, icon, colors)
├── service-worker.js       offline caching — works on job sites with no signal
├── logo.png                the Mold Docs mascot
├── css/
│   ├── styles.css           all screen styling (brand colors, layout)
│   └── app-shell.css        makes the app fill a real phone screen
├── js/
│   ├── app.js               screen navigation + interactive features
│   └── sw-register.js       turns on offline mode
└── icons/                  home-screen icons (iOS + Android)
```

## Run it locally

Any static web server works. From inside the `mold-docs-app/` folder:

```bash
# Python (already on most machines)
python3 -m http.server 8080

# or Node
npx serve .
```

Then open <http://localhost:8080>. On a wide screen it shows a phone frame for
preview; on a phone-sized screen it fills the display like a real app.

> Service workers and "Add to Home Screen" only work over `http://localhost`
> or `https://` — not when opening the file directly with `file://`.

## Install it on a phone

1. Put the app online (see "Going live" below) or serve it on your local
   network so the phone can reach it.
2. **iPhone (Safari):** Share button → *Add to Home Screen*.
3. **Android (Chrome):** menu → *Install app* / *Add to Home screen*.

It then opens full screen with the Mold Docs icon and works offline.

---

## What's real vs. mock right now

This build is the **complete interface** with **sample data**. Every screen,
button, and flow is there — Dashboard, Project timelines, Photos, the
Spanish-first Materials/Home Depot list, Camera, Schedule, Client SMS, the
"Ask the Doc" AI timeline assistant, and the Housecall Pro import.

What is still simulated (it looks and behaves right, but isn't wired to live
services yet):

- **Photos** — the camera UI works; photos aren't stored to a real database yet.
- **Client SMS** — composes the message; doesn't send a real text yet.
- **AI timeline assistant** — parses typed updates with simple keyword matching;
  not yet calling a real AI model.
- **Housecall Pro import** — shows the picker; not yet pulling live customers.

## Going live — what's needed to make those features real

Each one needs an account/service. These have to be set up by you (accounts and
API keys should never be created by an assistant on your behalf):

| Feature | Service needed | Notes |
|---|---|---|
| Hosting (put the app online) | Netlify or Vercel | Free tier is enough; drag-and-drop this folder |
| Photo storage + project data | Supabase | Free tier; database + file storage + login |
| Texting clients with photos | Twilio | Pay-per-message; needs a sending number |
| Real AI timeline assistant | Anthropic API | Pay-per-use API key |
| Housecall Pro customer/job sync | Zapier + Google Sheets | Bridge already drafted in the shared Drive folder |

The Housecall Pro sync is the closest to ready — the Google Sheet bridge and
Zap setup guide are in the shared Mold Docs App Drive folder.

## Continuing the build (for David / Claude Code)

This folder is a plain static project, so it works with any tool. To keep
building:

- Edit `js/app.js` to change behavior, `css/styles.css` for styling.
- When you change files, bump `CACHE` in `service-worker.js` (e.g. `molddocs-v2`)
  so phones pick up the new version.
- The original single-file prototype is kept one level up as
  `mold-docs-app-prototype.html` for reference.

The next real milestone is hosting + Supabase so photos and projects persist
between sessions and across devices.
