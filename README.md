# Fire Sale

One page that helps one person sell their stuff fast and hit a money goal. It runs on your own
computer, keeps its data in a local SQLite file, and installs on your phone as an app.

## Goals

1. Track how much I've sold and when.
2. Charts and graphs of sales.
3. Total it up (progress = landed net).
4. Set a target: dollar amount + number of days. Editable, pinned at top, with a progress bar.
5. Full CRUD on items.
6. Upload one-to-many photos. The app drafts listings on the appropriate marketplace, interviewing
   me first if a photo is ambiguous.
7. Approve listing drafts manually. Auto-mark a draft "ready to publish" at >= 80% confidence
   (publishing still needs my tap).
8. Offer rules: auto-decline below 70% of original asking. Queue at/above-asking offers for my
   one-tap OK. Surface in-between.
9. Per-item buyer-chat with a hard stop before any sale/ship/pickup.
10. Per-item status + activity/timeline log.
11. Auto-generate 4x6 and narrow-format shipping labels + receipts.
12. PWA push when a sale closes or buyer-chat needs me.

## Run it

You need Node 22.22 or newer. The app uses only Node's built-in modules, so there is nothing to
install for the server itself.

1. Get the Tailwind CLI and build the CSS.

   ```sh
   sh scripts/get-tailwind.sh
   npm run build:css
   ```

2. Copy the settings file. Every value in it is a placeholder.

   ```sh
   cp .env.example .env
   ```

3. Start the app, then open <http://127.0.0.1:8080>.

   ```sh
   npm start
   ```

Your data lives in `data/` (the database, cleaned photos, and push keys). That folder is
git-ignored.

### Try it with sample data

```sh
npm run demo
```

This starts the app with made-up items and sales in memory. Nothing is saved, and it never touches
`data/`.

### Use it on your phone

The server listens on `127.0.0.1`, so only your computer can reach it. Push notifications and
installing to the iPhone home screen both need HTTPS.

1. Set `FIRE_SALE_PASSCODE` in `.env`.
2. Put the app behind HTTPS on a private network you control. One option is
   `tailscale serve 8080`, which gives the app an HTTPS address only your own devices can reach.
3. Open that address in Safari, tap Share, then Add to Home Screen.
4. Open the app from the home screen and tap "Turn on notifications".

Don't expose the app to the public internet.

## How it works

The page runs top to bottom in this order: photo upload, money target, sales charts, item table.

### Photos to drafts

Pick one photo or many. Each photo becomes its own draft, or tick "All selected photos are one
item". Drafts run in parallel.

Before upload, the browser re-encodes each photo, which drops the location and camera data. The
server strips any metadata that's left. The app flags photos that may show mail, a shipping label,
a serial number, or a face.

If a photo is unclear, the draft asks a few short questions first, then drafts from your answers.

### Confidence gate

Every draft gets a confidence score from 0 to 1.

- 0.80 or higher is marked "ready to publish".
- Below 0.80 is marked "needs review". You must edit it before it can be published.

"Ready to publish" is only a label. Publishing always waits for your tap.

### Confirm queue

Nothing is listed, sold, shipped, or picked up until you tap Approve. The Confirm button at the top
shows how many requests are waiting.

The queue holds these requests:

- Publish a listing.
- Accept an offer, or decide on one.
- Ship, or buy a label.
- Book a pickup, or share the handoff spot.
- Cut a price.

A money deadline never skips this step.

### Offer rules

These are the defaults. Change them under "Offer and price rules" at the bottom of the page.

- Offers below 70% of the original asking price are declined automatically.
- Offers at or above the asking price go to the queue for a one-tap OK. They never auto-accept.
- Offers in between go to the queue for you to decide.

### Price cuts

After 7 days unsold, the app cuts its own suggested price by 5%, once. It never goes below your
floor price. Every later cut is a request in the queue. The 70% decline line stays tied to the
original asking price.

### Suggested price

Each item shows two prices side by side. The middle of comparable sales is the default. A lower
"fast" price is more likely to sell inside your target window. Pick either per item.

### Buyer chat

Paste a buyer's message into an item's chat. The app drafts a reply from fixed templates. It never
copies the buyer's text into a reply, and it never follows instructions written in a message.

It flags common scams: off-platform payment, couriers, overpayment, fake payment proof,
verification codes, and requests for your address. A risky message never creates an offer or a
queue request.

Payment stays inside each marketplace's checkout. Any reply that would sell, ship, or set up a
pickup stops at the queue.

### Labels and receipts

Each sold item can print a 4x6 label and a narrow 48 mm label or receipt for a travel printer, as
PDFs. When the marketplace issues its own label, the app tells you to use that one.

### Targets and charts

Set a dollar amount and a number of days. Progress counts landed net: the sale price minus fees and
postage. The charts show net over time against an even pace line, net by marketplace, and net per
day.

### Notifications

The app sends a push notification when a sale closes and when a buyer question needs you.

## Safety and privacy

- The repo holds no secrets, keys, cookies, or sessions. `.env` is git-ignored, and
  `.env.example` has placeholders only.
- Marketplace and eBay sign-in gets wired later, on your own machine.
- No address is stored anywhere in the code, config, sample data, or logs. Labels print a
  placeholder for the ship-from address. To print a real one, pass `FIRE_SALE_SHIP_FROM` from your
  password vault when you start the app.
- Replies are checked for street addresses and unit numbers before you send them.
- `tests/unit/privacy-guard.test.js` fails the build if a tracked file holds a unit number, a key,
  a `.env` file, or the `data/` folder.
- The server only accepts changes from its own page, logs no request bodies, and sends a strict
  Content Security Policy.

## What's stubbed in v1

Each stub sits behind the same interface as the real thing, so it can be swapped in later.

| Part                 | v1 behavior                                                                           |
| -------------------- | ------------------------------------------------------------------------------------- |
| eBay                 | Builds listing drafts in Inventory API shape. Publishing stops at "blocked on login". |
| Swappa               | Stub with a fee estimate.                                                             |
| Facebook Marketplace | Stub with a fee estimate.                                                             |
| OfferUp              | Stub with a fee estimate.                                                             |
| Mercari              | Stub with a fee estimate.                                                             |
| Price scoring        | `scorePrice()` returns placeholder numbers until the scoring rubric arrives.          |
| Photo recognition    | `inferItem()` matches keywords from your answers and file names.                      |
| Auto-negotiation     | `autoNegotiator` is switched off and does nothing yet.                                |

When an item sells, the app marks every other listing for that item to be taken down.

## Tests

```sh
npm ci              # dev tools for linting and browser tests
npm run test:unit   # offer rules, confidence gate, price-cut cadence, chat safety, push, privacy
npm run lint        # html-validate, Stylelint, ESLint, markdownlint, Prettier
npm run test:e2e    # Playwright: dashboard flows, axe, layout from 320 to 3840 px, RTL
npm run test:lhci   # Lighthouse budgets
```

The browser tests start their own servers on ports 8180 to 8182 with a throwaway in-memory
database, so they never touch your data.

To run pa11y, start a throwaway server first, then run the check.

```sh
FIRE_SALE_DB=:memory: npm start &
npm run test:a11y
```

## Project layout

| Path                     | What it holds                                                     |
| ------------------------ | ----------------------------------------------------------------- |
| `server/index.js`        | Starts the app and reads settings from the environment.           |
| `server/rules.js`        | Confidence gate, offer rules, price-cut cadence, target progress. |
| `server/service.js`      | Items, the confirm queue, sales, and the activity log.            |
| `server/http.js`         | The JSON API and static files.                                    |
| `server/db.js`           | SQLite schema and queries (`node:sqlite`).                        |
| `server/chat.js`         | Buyer message checks and reply templates.                         |
| `server/marketplaces.js` | eBay drafts and the marketplace stubs.                            |
| `server/inference.js`    | Draft interview and the price scoring stub.                       |
| `server/labels.js`       | 4x6 and narrow label and receipt PDFs.                            |
| `server/push.js`         | Web Push (VAPID keys and payload encryption).                     |
| `server/images.js`       | Photo metadata stripping.                                         |
| `public/`                | The page, its scripts, the service worker, manifest, and icons.   |
| `src/input.css`          | Tailwind entry with the color and spacing tokens.                 |
| `tests/unit/`            | Node unit tests.                                                  |
| `tests/*.spec.js`        | Playwright browser tests.                                         |

## Starter kit notes

Fire Sale is built on a static Tailwind CSS v4 starter. The CSS build is still the Tailwind
standalone CLI, a single binary. Node runs the app server and the checks.

### Visual baselines

Screenshot baselines depend on the fonts where they're rendered, so only the CI runner makes them.
Never commit baselines rendered on your own machine. To refresh them, run the **Update visual
baselines** workflow on your branch, download its `baselines` artifact, review it, and commit it.
The dashboard shows live data, so only the static 404 page has baselines.

### GitHub Pages

The Pages deploy is manual now. Fire Sale needs its server and private data, so it must not
publish to a public static host by itself.

### Agent skills

Agents must follow [AGENTS.md](AGENTS.md) and [CONFIG_CODING_PREFS.md](CONFIG_CODING_PREFS.md). [CLAUDE.md](CLAUDE.md) imports AGENTS.md with an `@AGENTS.md` line. The 487 skills below are vendored in `.agents/skills/`. `.claude/skills`, `.cursor/skills`, and `.grok/skills` are symlinks to that folder, and Codex reads `.agents/skills` directly. `skills-lock.json` records each skill's source, path, full commit SHA, license, and content hash, and `npm run lint:skills` (also part of `npm run lint` and CI) verifies them. License texts are in `.agents/licenses/`.

| Repository                           | Path                                                                            | Skills | Commit         | License    |
| ------------------------------------ | ------------------------------------------------------------------------------- | -----: | -------------- | ---------- |
| addyosmani/web-quality-skills        | `skills/*`                                                                      |      6 | `afa8da942115` | MIT        |
| thedaviddias/Front-End-Checklist     | `skills/*`                                                                      |    391 | `e8d14d049010` | MIT        |
| anthropics/skills                    | `skills/frontend-design`                                                        |      1 | `683bc88e56f3` | Apache-2.0 |
| Leonxlnx/taste-skill                 | `skills/taste-skill`                                                            |      1 | `b482f7a970ab` | MIT        |
| nextlevelbuilder/ui-ux-pro-max-skill | `.claude/skills/ui-ux-pro-max`                                                  |      1 | `4f2dbb67e649` | MIT        |
| anthropics/knowledge-work-plugins    | `design/skills/` ux-copy, design-critique, design-handoff, accessibility-review |      4 | `ae1513ea94dc` | Apache-2.0 |
| pbakaus/impeccable                   | `.agents/skills/impeccable` (skill-v4.8.0)                                      |      1 | `414603bf14c7` | Apache-2.0 |
| wondelai/skills                      | `web-typography`                                                                |      1 | `c172996495be` | MIT        |
| mblode/agent-skills                  | `skills/typography-audit`                                                       |      1 | `3bd75bc16611` | MIT        |
| mblode/agent-skills                  | `skills/agent-ready`                                                            |      1 | `0148e6250dce` | MIT        |
| emilkowalski/skills                  | `animate`, `emil-design-eng`, `improve-animations`, `review-animations`         |      4 | `f1090bec2771` | MIT        |
| emilkowalski/skills                  | `skills/*` except the four above                                                |     10 | `e8a175de22ae` | MIT        |
| cloudflare/skills                    | `skills/web-perf`                                                               |      1 | `29de2b2f187f` | Apache-2.0 |
| ChromeDevTools/chrome-devtools-mcp   | `skills/*` (release v1.13.0)                                                    |      7 | `b1e35e3ab177` | Apache-2.0 |
| i18n-agent/i18nstack                 | `skills/*`                                                                      |     55 | `e1e722bfd3ca` | MIT        |
| wshobson/agents                      | `plugins/frontend-mobile-development/skills/tailwind-design-system`             |      1 | `51b6e0b507aa` | MIT        |
| coreyhaines31/marketingskills        | `skills/schema` (release v2.14.12)                                              |      1 | `1f837447b20b` | MIT        |

These are pinned in `skills-lock.json` but not vendored, because their upstream repositories declare MIT only in a README and ship no LICENSE file. Install them on demand with the `installCommand` in the lockfile. The folders are git-ignored, and `check-skills.sh` fails if one is committed.

| Repository               | Path                                                                              | Skills | Commit         |
| ------------------------ | --------------------------------------------------------------------------------- | -----: | -------------- |
| vercel-labs/agent-skills | `skills/web-design-guidelines`                                                    |      1 | `063bee94c3f4` |
| AccessLint/skills        | `plugins/accesslint/skills/*` (accessibility-scan, -inspect, -audit, -fix, -diff) |      5 | `2e9d73366783` |

To restore missing skills from the lockfile, run `npx skills experimental_install` (Node 22.22 or newer).

### Harness load test

A one-time check (2026-10-08, 09:07 ET) on fresh clones of `main` at `a5a4dce`. Each harness ran
non-interactively and read-only, and was asked to list the instruction files and skills it loaded
and the Tailwind build command. No task was run, and no files changed.

| Harness                                 | Version            | Model             | Instruction files loaded at startup                                                                                | Project skills                                                                                                                               | Build command reported                                                                          |
| --------------------------------------- | ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Claude Code (`claude -p`)               | 2.1.293            | `claude-opus-5-5` | `CLAUDE.md`, plus `AGENTS.md` through the `@AGENTS.md` import                                                      | 499 via `.claude/skills`, with `tailwind-design-system` and `schema` listed                                                                  | `./bin/tailwindcss -i src/input.css -o public/assets/site.css --minify`                         |
| Codex (`codex exec`, read-only sandbox) | codex-cli 0.161.0  | `gpt-6.1-sol`     | `AGENTS.md`, injected automatically                                                                                | 499 on disk in `.agents/skills`, but the startup catalog it was given listed only some of them, without `tailwind-design-system` or `schema` | Same                                                                                            |
| Grok Build (`grok -p --trust`, dontAsk) | 1.0.46             | `grok-4.7-build`  | `CLAUDE.md` and `AGENTS.md` (plus the global `~/.claude/CLAUDE.md`). `grok inspect` reports "Project trusted: yes" | 496 via `.grok/skills`, with `tailwind-design-system` and `schema` listed                                                                    | `./bin/tailwindcss` (standalone CLI v4.3.3), with no `-i`/`-o` flags in the loaded instructions |
| Cursor (`cursor-agent -p`)              | 2026.10.01-e373342 | none              | Didn't run: "Authentication required. Please run 'agent login' first"                                              | n/a                                                                                                                                          | n/a                                                                                             |

Follow-ups: Grok Build loads nothing from an untrusted clone. Its row was re-run on a trusted clone
of `87c28c0` (`grok --trust`, 2026-10-08, 09:32 ET). A plan-mode run (`--permission-mode plan`)
still stopped as `cancelled` after 3 turns, so use `--permission-mode dontAsk` for read-only checks.
Log in to `cursor-agent` and re-run its row. Codex shows only part of a 499-skill catalog at
startup, so name the skill in the prompt when a task needs one.

## License

[MIT](LICENSE) © 2026 Dani Roxberry. Vendored skills keep their own licenses, listed above and in
`.agents/licenses/`.
