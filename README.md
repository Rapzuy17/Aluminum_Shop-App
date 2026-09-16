# Aluminum & Glass Job Tracker

A shop app for tracking jobs (windows, doors, screens), materials, worker
pay, budgets, pieces made vs. ordered, and shop inventory — with a dashboard
across all jobs.

Data is stored in a shared **Supabase** database, so it's the same data
whether you open the app from your phone, a second phone, or a computer.

## 1. Create your Supabase project (one-time)

1. Go to [supabase.com](https://supabase.com), sign up free, and create a
   new project. Pick any name/password/region — save the database password
   somewhere safe.
2. Once it's created, open the **SQL Editor** (left sidebar) → **New query**,
   paste in everything from `supabase-setup.sql` in this folder, and click
   **Run**. This creates the table that holds your app's data.
3. Go to **Project Settings → API**. You'll need two values from this page:
   - **Project URL**
   - **anon public** key (not the `service_role` key — that one's secret)

## 2. Run it locally

You need [Node.js](https://nodejs.org) installed (v18+).

```bash
npm install
cp .env.example .env
```

Open `.env` and paste in your Project URL and anon key from step 1. Then:

```bash
npm run dev
```

Open the URL it prints. Changes you make here will now save to your shared
Supabase database, not just your browser.

## 3. Put it on GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Your `.env` file is git-ignored on purpose — it holds credentials and should
never be committed. `.env.example` (safe, no real keys) is what gets shared
instead.

## 4. Deploy it so it works on your phone(s)

This is the part that gets you a real web address you can open from any
phone, not just `localhost` on your computer.

1. Go to [vercel.com](https://vercel.com) (or [netlify.com](https://netlify.com))
   and sign up — you can sign in directly with your GitHub account.
2. Click **Add New → Project**, and pick your GitHub repo. It auto-detects
   this as a Vite project — you don't need to change any build settings.
3. Before deploying, add your environment variables (same two values as
   your `.env` file):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (Vercel: under "Environment Variables" in the import screen. Netlify:
   Site settings → Environment variables, after the first deploy.)
4. Click **Deploy**. You'll get a URL like `your-app.vercel.app`.
5. Open that URL on both phones (bookmark it, or add it to your home screen
   for an app-like icon: in your phone's browser menu, look for "Add to
   Home Screen"). Both phones now read and write the same shared data.

Any time you push new changes to GitHub, Vercel/Netlify automatically
redeploys — no manual re-upload needed.

## Notes

- **Live sync:** if you add a material on one phone, the other phone
  updates automatically within a second or two, no refresh needed.
- **Security:** this app has no login screen — anyone with your deployed
  URL and the anon key baked into the app could read or edit your data.
  That's fine for a small tool used by a couple of trusted people, but if
  you ever want to restrict access, the next step would be adding Supabase
  Auth (sign-in) and tightening the row-level security policy.
- **Offline:** since data now lives in the cloud, you'll need an internet
  connection to load or save. If you want offline support later, that's
  a bigger change worth discussing separately.

## Project structure

```
supabase-setup.sql    Run once in Supabase's SQL Editor
.env.example           Template for your Supabase credentials
index.html              Entry HTML page
src/main.jsx             Mounts the app
src/supabaseClient.js    Connects to your Supabase project
src/App.jsx               All app logic and UI
```
