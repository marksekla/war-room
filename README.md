# War Room

An open-source AI fantasy football agent for **Sleeper** leagues, with a dark neon command-center UI.

Sync any Sleeper league and get:

- **Command dashboard** – your roster with usage (snap %, target share, carry share), next matchup, value over replacement, rest-of-season points, a week-by-week outlook to the championship, standings, and every team's needs.
- **Trade simulator** – plays out a trade week by week through your fantasy playoffs. Shows how many points your *actual best lineup* gains or loses (byes, injuries, forced drops included), the best player in the deal, and how likely the other manager is to accept.
- **Waiver radar** – free agents ranked by how many points they add to your lineup if you drop your weakest bench player, plus usage and trending adds.
- **Start / Sit** – optimal lineup with matchups, Vegas spreads, implied team totals, kickoff times, and lineup-lock warnings (for example, a questionable late-game starter with no healthy late backup).
- **AI agent** – chat with an analyst that has your whole league loaded and can call tools: rosters, player game logs, free agents, matchups, defense vs position, the trade simulator, start/sit, and live web search for injury news.

Everything uses **your league's own scoring settings**.

**Works on phones.** On mobile you get a compact header and an app-style bottom tab bar. Open the site in Safari or Chrome and choose **Add to Home Screen** to install it like an app, with its own icon and full-screen view.

Each user brings their own **Anthropic (Claude)** or **OpenAI (GPT)** API key. Keys are stored only in the user's browser and sent straight to the AI provider, never to this app's server.

---

## Quick start (run it on your computer)

You need [Node.js](https://nodejs.org) 20 or newer (the LTS version).

```bash
npm install
npm run dev
```

Open http://localhost:3000, enter your Sleeper username (or a league ID), then open **Settings** to paste your API key.

## Deploy it free on Vercel (share with friends)

1. Create a free account at [github.com](https://github.com).
2. Create a new repository (for example `war-room`), then upload this folder's contents. On GitHub's website, click **Add file → Upload files** and drag everything in, *except* the `node_modules` and `.next` folders if you have them.
3. Create a free account at [vercel.com](https://vercel.com) using **Continue with GitHub**.
4. Click **Add New → Project**, pick your `war-room` repo, and click **Deploy**. No settings or environment variables are needed.
5. In about two minutes you get a link like `war-room.vercel.app`. Send it to your friends.

Every time you push changes to GitHub, Vercel redeploys automatically.

Optional: set `NEXT_PUBLIC_REPO_URL` in Vercel to your GitHub repo URL so the "Open source" link in the sidebar points to it.

## Getting an API key

| Provider | Where | Notes |
|---|---|---|
| Anthropic (Claude) | https://console.anthropic.com/settings/keys | Add a few dollars of credit. Default model `claude-sonnet-5`. |
| OpenAI (GPT) | https://platform.openai.com/api-keys | Add billing. Default model `gpt-5.5`. |

In **Settings**, click **Load models** to pick from the models your key can use. A typical question costs a few cents. Web search adds a small charge per search; you can turn it off in Settings. If your key doesn't have web search enabled, the agent keeps working without it.

## Customize the agent's brain

**Settings → Your strategy** is the playbook the agent follows (scarcity, injury rules, how to judge trades, how to research). Edit it to match how you play. It's saved per browser, so each friend can have their own.

## How the numbers work

- **Value per game** blends Sleeper projections with recent and season scoring, using your league's scoring.
- **VORP** (value over replacement) is points per game above a waiver-level starter at that position. This is how positional scarcity shows up: in a league where good RBs are scarce, RB VORP rises.
- **Expected points** for a week = value × a damped matchup factor (points the opponent allows to that position this season), set to zero on byes and for players ruled out.
- **Trade and waiver results** re-optimize your lineup every remaining week and sum the difference, so byes, injuries and roster spots all count.

These are models, not crystal balls. They lag breaking news, which is why the agent checks the web.

## Data sources

- [Sleeper API](https://docs.sleeper.com) – leagues, rosters, players, stats, projections, trending players. The stats and projections endpoints are public but undocumented.
- ESPN's public scoreboard feed – schedule, kickoff times, spreads and totals. It's unofficial and could change.
- Web search by your AI provider – news, injuries and practice reports.

Data is cached on the server (and at Vercel's edge) so the app stays light on these services.

## Project structure

```
app/
  api/            server routes that fetch and slim Sleeper + ESPN data (with caching)
  page.tsx        app entry
components/       UI: Shell, Dashboard, Trades, Waivers, StartSit, Chat, Settings
lib/
  model.ts        analytics engine (scoring, usage, DvP, VORP, lineups, trades, waivers)
  agent/          multi-provider agent loop, tools, default strategy
  server/         fetchers + cache
```

## Ideas for next versions

- More providers (Google Gemini, local models)
- ESPN / Yahoo league support
- Rest-of-season projections from more sources
- Saved trade ideas and weekly AI briefings

## Disclaimer

Not affiliated with Sleeper, ESPN, Anthropic or OpenAI. For entertainment. Always check the latest news before you lock your lineup.

## License

MIT. See [LICENSE](./LICENSE).
