# SVR Pipeline — self-hosted setup

This is your sales pipeline CRM as a standalone website you control: one HTML file, backed by a free Supabase database, deployable to any static host. Nothing here depends on Claude to keep running.

There are five files:

- `index.html` — the whole app (board, drawer, login screen). This is the only file your host needs to serve.
- `schema.sql` — the database structure. You run this once, inside Supabase.
- `supabase/functions/fetch-page/index.ts` — an optional add-on that powers "Import properties" (step 7 below). Skip it if you don't need that feature yet.
- `supabase/functions/geocode/index.ts` — an optional add-on that powers the dashboard's map view (step 8 below). Skip it if you don't need that feature yet.
- `README.md` — this file.

Setup takes about 10 minutes and doesn't require any coding. You'll create a Supabase project, run one SQL script, paste two values into `index.html`, create one login for your team, and upload the file. Steps 7 and 8 (the property importer and the map) are optional and can be added any time.

## 1. Create a free Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (a GitHub or email account both work).
2. Click **New project**. Pick any name (e.g. "SVR Pipeline") and a database password — you won't need that password day-to-day, so save it somewhere safe and move on.
3. Wait about a minute for the project to finish provisioning.

## 2. Create the database tables

1. In your new project, open **SQL Editor** in the left sidebar, then **New query**.
2. Open `schema.sql` (included here), copy its entire contents, and paste into the query editor.
3. Click **Run**.

You should see "Success. No rows returned." This created two tables (`prospects` and `interactions`), locked them down so only signed-in users can touch them, and turned on live sync. If you ever need to re-run this script (say, after fixing a typo), it's safe to run again.

## 3. Connect index.html to your database

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://xxxxxxxx.supabase.co`).
3. Copy the **anon public** key (a long string starting with `eyJ...`). This key is meant to be public — it's not a secret, since the RLS policies from `schema.sql` are what actually protect your data.
4. Open `index.html` in any text editor and find these two lines near the top of the `<script>` section (around line 529):

   ```js
   var SUPABASE_URL = "YOUR_SUPABASE_URL";           // e.g. https://xxxxxxxx.supabase.co
   var SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";  // the "anon public" key
   ```

5. Replace the placeholder text with your actual URL and key, keeping the quotes:

   ```js
   var SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
   ```

6. Save the file. (Until you do this, opening `index.html` shows a "Setup needed" message instead of the app — that's expected.)

## 4. Create your team's shared login

This app uses one shared login for the whole team, rather than individual accounts, per what you asked for. There's no public sign-up page in the app itself — you create the one login directly in Supabase:

1. Go to **Authentication → Users** in the Supabase sidebar.
2. Click **Add user → Create new user**.
3. Enter an email and password for the team to share (e.g. `team@yourcompany.com`), and make sure **Auto Confirm User** is checked.
4. Click **Create user**.

Share that email and password with your team through whatever channel you'd normally use for shared credentials.

## 5. Turn off public sign-ups

Since the app has no sign-up form, this step just closes a back door — it stops anyone from creating their own account directly against your Supabase project's API.

1. Go to **Authentication → Providers**, click **Email**.
2. Turn off **Allow new users to sign up**.
3. Save.

(Supabase's dashboard wording shifts slightly between versions — look for anything referring to allowing new sign-ups and switch it off.)

## 6. Put index.html on your website

`index.html` is fully self-contained — no build step, no server-side code, no other files to upload alongside it. Upload it wherever your website is hosted: Netlify, Vercel, GitHub Pages, or your existing cPanel/FTP host all work the same way — just drop the file in and point a URL at it.

That's it. Visit the page, sign in with the shared login from step 4, and the board should load empty and ready to use.

## 7. Optional: turn on the property importer

The "Import properties" button lets you point the app at a page — a county property-records search, or a company's own portfolio/property-listing page, for instance — and turn every property listed there into a new prospect in one pass. It recognizes a few common page shapes automatically: a results table (typical of assessor sites), a list of property cards each with a linked name and an address nearby (typical of a management company's own portfolio page), and structured data some sites embed for search engines. It works two ways: paste the page's content in directly (select the results in your own browser, copy, paste into the app — this always works, no setup needed), or enter a URL and let the app fetch it for you automatically (this requires the one-time setup below). Either way, before anything is added you'll see a review screen listing what was found, with anything that matches an address already in your pipeline flagged so you can skip it, replace it, or add it anyway.

An important note on where to point this: many real estate listing sites (Zillow, Realtor.com, Redfin, and similar) explicitly prohibit automated scraping in their terms of use and actively block it — avoid pointing this feature at those. County or municipal property-records sites, and a company's own public portfolio page listing its own properties, are generally a better fit — this feature was built with those in mind — but terms vary by site, so it's worth a quick check of a site's terms of use before relying on this against it regularly. If a page's results only appear after the page loads (common on some government sites, and on some heavily JavaScript-driven portfolio pages), fetch-by-URL may come back empty; paste the visible results instead, since that captures what's actually rendered in your browser.

To turn on the "fetch by URL" half of this feature (paste-in works without any of this):

1. In Supabase, go to **Edge Functions** in the left sidebar, then **Deploy a new function**.
2. Choose **Via Editor**, and start from a blank/"Hello World" template.
3. Name the function exactly `fetch-page`.
4. Delete the template code, and paste in the entire contents of `supabase/functions/fetch-page/index.ts` (included here).
5. Click **Deploy function**.

That's the whole setup — the function reads your project's URL and anon key automatically, and it only responds to requests from someone already signed in to your app, so nothing further needs configuring. If a URL fetch ever fails with a message about the function not being deployed, this is the step to revisit.

## 8. Optional: turn on the map

Turning on **Show map** in the toolbar plots every prospect that has a located address on an OpenStreetMap view, with a popup for each one linking back to its full details. It's free and doesn't need any API key or billing — but it does need the one-time setup below, since looking up coordinates for an address ("geocoding") has to happen on the server, not in the app itself.

1. In Supabase, go to **Edge Functions** in the left sidebar, then **Deploy a new function**.
2. Choose **Via Editor**, and start from a blank/"Hello World" template.
3. Name the function exactly `geocode`.
4. Before pasting it in, open `supabase/functions/geocode/index.ts` (included here) and edit the `CONTACT_EMAIL` line near the top to your own team's email address. The free mapping service this uses (OpenStreetMap's Nominatim) asks every automated user to provide a contact address, in case there's ever a problem with how it's being used.
5. Delete the template code, and paste in the entire (edited) contents of the file.
6. Click **Deploy function**.

Once deployed, a prospect's location is looked up automatically the first time it's added with an address, or whenever its address is changed afterward — and the result is saved, so the same address is never looked up twice. Prospects added before this was turned on won't have a location yet; opening the map and clicking **Locate missing prospects** looks them up one at a time, with a short pause between each (out of respect for the free service's rate limit — this may take a little while for a large pipeline). If that button reports it couldn't locate anyone, double-check the function deployed correctly above.

## Day-to-day notes

- **Changing the shared password**: Supabase dashboard → Authentication → Users → click the user → you can reset the password there.
- **Adding a second login** (e.g. a separate one for a subset of the team): repeat step 4 to create another user — anyone signed in at all has the same full access, since access control here is "on the team" vs. "not on the team," not per-person permissions.
- **The "logged by" name on notes**: each person's browser remembers the last name they typed into the "Logged by" field (via their browser's local storage) and pre-fills it next time, so interactions stay attributed even though everyone shares one login. It's just a convenience — it doesn't affect who can see or edit anything.
- **Imported properties**: a prospect added through "Import properties" gets its address filled in and a note logging where it came from, but its estimated value is left at $0 — the value field tracks what a job would be worth to you, not a home's list or assessed price, so that number is always yours to set. If the source page had a link, the drawer shows a "View source page" link back to it.
- **Sector**: a simple classification (Residential, Commercial, etc.) you can filter the board by — set it from the Add/Edit panels, and it shows on each card next to the assigned rep.
- **Map pins**: a pin only appears once a prospect's address has been looked up (see step 8) — this happens automatically going forward, and the map's "Locate missing prospects" button backfills older ones.
- **Backups**: your data lives in Supabase's Postgres database. Supabase's dashboard (Database → Backups) has details on their backup schedule for your plan.
- **Costs**: Supabase's free tier comfortably covers a small team's pipeline. If you outgrow it, Supabase will prompt you to upgrade — nothing here requires that ahead of time.
