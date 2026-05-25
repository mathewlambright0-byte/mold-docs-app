# Deploying the Mold Docs app to Render

The Mold Docs app and the AI estimator are two separate apps. Render serves
whatever repo is connected to it — so the Mold Docs app needs its OWN GitHub
repo and its OWN Render Static Site. Once set up, every `git push` auto-deploys.

## One-time setup

1. **Create an empty GitHub repo** named e.g. `mold-docs-app`.
   Do NOT let GitHub add a README, .gitignore, or license — keep it empty.

2. **Turn this folder into a Git repo and push it.** Open a terminal in this
   `mold-docs-app` folder and run (replace `<your-username>`):

   ```
   git init
   git add -A
   git commit -m "Mold Docs field app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/mold-docs-app.git
   git push -u origin main
   ```

3. **Create the Render Static Site.** In the Render dashboard:
   New → **Static Site** → connect the `mold-docs-app` repo.

4. **Settings:**
   - Build Command: *(leave blank)*
   - Publish Directory: `.`

5. Click **Create Static Site**. Render builds it and gives you an HTTPS URL —
   that's the Mold Docs app, separate from the estimator.

## After that

Every time the code changes, `git commit` and `git push` — Render
auto-deploys within a minute. Bump `CACHE` in `service-worker.js` when you
ship changes so installed phones pick up the new version.

`render.yaml` in this folder documents the same config for Render's Blueprint
flow if you ever prefer that.
