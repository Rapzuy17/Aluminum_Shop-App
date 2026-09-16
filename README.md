# BALAGAPO Aluminum & Glass Job Tracker

A small shop app for tracking jobs (windows, doors, screens), materials, worker
pay, budgets, pieces made vs. ordered, and shop inventory — with a dashboard
across all jobs.

This is a standalone version of the app you saw in Claude. It saves data to
your browser's local storage instead of Claude's storage, so it can run
anywhere: on GitHub Pages, Vercel, Netlify, or just on your own computer.

## Run it locally

You need [Node.js](https://nodejs.org) installed (v18 or later).

```bash
npm install
npm run dev
```

Then open the URL it prints (usually `http://localhost:5173`).

## Put it on GitHub

1. Create a new empty repository on [github.com](https://github.com/new) —
   don't add a README, .gitignore, or license (this project already has them).
2. In this project folder, run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

   (Replace the URL with the one GitHub shows you after creating the repo.)

## Open it in Visual Studio Code

- **If you already cloned/pushed it:** open VS Code, then
  `File → Open Folder…` and select this project folder. Or from a terminal
  inside the folder, just run `code .`
- **If you want to grab it fresh from GitHub:** in VS Code, open the Command
  Palette (`Cmd/Ctrl+Shift+P`), type **Git: Clone**, paste your repo URL, and
  pick a folder to clone into.
- Once open, use VS Code's built-in terminal (`` Ctrl+` ``) to run
  `npm install` and `npm run dev` as above.

## Deploy it somewhere people can use it

Since it's a normal Vite + React app, any static host works:

- **Vercel** or **Netlify**: connect your GitHub repo, they auto-detect Vite,
  no config needed.
- **GitHub Pages**: run `npm run build`, then deploy the generated `dist`
  folder (e.g. with the `gh-pages` npm package, or GitHub's Pages settings
  pointing at `dist`).

## A note on data

Each job and inventory item is saved to `localStorage` in your browser —
meaning it stays on the device/browser you're using it in. It won't sync
across devices unless you add a backend (e.g. Supabase, Firebase) later. If
you outgrow local-only storage, that's the natural next step.

## Project structure

```
index.html         Entry HTML page
src/main.jsx        Mounts the app
src/App.jsx          All app logic and UI (jobs, materials, labor, pieces,
                     budget, dashboard, inventory)
```
