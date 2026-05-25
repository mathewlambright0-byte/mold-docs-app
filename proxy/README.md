# Mold Docs — AI Proxy

A tiny server the Mold Docs app calls to turn a technician's field note into
structured timeline entries, using the Anthropic API.

## Why it exists

The Mold Docs app is a static site — all of its code runs in the browser. An
API key placed in the app would be public to anyone who opens the page. This
proxy holds the key **server-side**, so it is never exposed.

## Deploy (Render Web Service)

Create a **Web Service** on Render from this folder:

- Build command: `npm install`
- Start command: `npm start`

Render assigns the port automatically (the server reads `PORT`).

## Environment variables

Set these in the Render service's **Environment** tab — never commit them.

- `ANTHROPIC_API_KEY` — **required.** Your Anthropic API key.
- `ANTHROPIC_MODEL` — optional. Defaults to a fast, low-cost Claude model.
- `ALLOWED_ORIGIN` — optional. The app's URL, for CORS. Defaults to the
  Render-hosted app URL.

## Endpoint

`POST /` with JSON body `{ "text": "the tech's note" }`
→ responds `{ "entries": [ { when, what, notes, status, phase }, ... ] }`

A `GET /` returns a plain-text health check.
