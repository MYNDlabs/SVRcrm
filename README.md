# SVR Pipeline — self-hosted setup

This is your sales pipeline CRM as a standalone website you control: one HTML file, backed by a free Supabase database, deployable to any static host. Nothing here depends on Claude to keep running.

There are three files:

- `index.html` — the whole app (board, drawer, login screen). This is the only file your host needs to serve.
- `schema.sql` — the database structure. You run this once, inside Supabase.
- `README.md` — this file.

Setup takes about 10 minutes and doesn't require any coding. You'll create a Supabase project, run one SQL script, paste two values into `index.html`, create one login for your team, and upload the file.

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

## Day-to-day notes

- **Changing the shared password**: Supabase dashboard → Authentication → Users → click the user → you can reset the password there.
- **Adding a second login** (e.g. a separate one for a subset of the team): repeat step 4 to create another user — anyone signed in at all has the same full access, since access control here is "on the team" vs. "not on the team," not per-person permissions.
- **The "logged by" name on notes**: each person's browser remembers the last name they typed into the "Logged by" field (via their browser's local storage) and pre-fills it next time, so interactions stay attributed even though everyone shares one login. It's just a convenience — it doesn't affect who can see or edit anything.
- **Backups**: your data lives in Supabase's Postgres database. Supabase's dashboard (Database → Backups) has details on their backup schedule for your plan.
- **Costs**: Supabase's free tier comfortably covers a small team's pipeline. If you outgrow it, Supabase will prompt you to upgrade — nothing here requires that ahead of time.
