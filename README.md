# para ti

Letters, places and little gifts that open at their own time.

- `docs/` is the app, served by GitHub Pages at https://heyneeff.github.io/for-you/
  - `admin.html` is backstage, where surprises are written (needs the admin key)
- `worker/` is the backend (Cloudflare Worker `for-you-api`). It holds every surprise and
  only releases one once its unlock time has passed, so nothing can be read early
  from the public site. It also rings push notifications every minute for anything
  that just opened.

Deploy the backend: `cd worker && npx wrangler deploy`
Change her secret word: `cd worker && npx wrangler secret put RECIPIENT_KEY`
