# War Room

An open-source AI fantasy football agent for **Sleeper** leagues, with a dark neon command-center UI.

Sync any Sleeper league and get:

- **Weekly to-do** – the few things worth doing this week: lineup fixes compared to your saved Sleeper lineup, lineup-lock alerts, the best waiver move, bye holes coming up, roles about to shrink, sell-high and buy-low names.
- **Trade finder** – pick a need (or "any upgrade") and it scans every team for fair deals that help your lineup and pass the market-value check, each fully simulated. Lock players you'll never trade.
- **Start/Sit compare** – 2-3 players side by side with floor-to-ceiling ranges, matchup, Vegas, injuries on both lines, weather, and a call that leans safe when you're favored and swings big when you're the underdog.
- **Streamers and FAAB** – one-week QB/TE/K/DEF pickups by matchup, and suggested FAAB bids tuned to how your league bids.
- **Player search** – find anyone from the header and open his card.
- **Are they playing?** – every fantasy-relevant player on the injury report with his chance to suit up, injury, matchup and day-by-day practice report. The chance comes from a model trained on recent seasons' official injury reports (designation, last practice, missed last game, injury type, position) and updates with this week's practice reports and ESPN injury notes.
- **Expert consensus** – FantasyPros rest-of-season and weekly consensus rankings, read fresh from fantasypros.com (DynastyProcess mirror as backup), feed player values, team needs, the trade check and start/sit. Rest-of-season values lean on the consensus: by default it carries about half of each player's value.
- **Three projection sources** – Sleeper, ESPN and FantasyPros consensus are averaged. FantasyPros' free pages list only the top 10 projections at each position, so everyone else gets FantasyPros' number from its weekly expert consensus rank (rank N is worth what the Nth-best projection at that position is worth this week). Independent multi-season studies find an average of sources beats nearly every single source, and that the "best" source changes year to year, so learned weights are pulled halfway toward an even split.
- **Playoff odds** – simulates the rest of the season thousands of times on your league's real schedule, then the bracket: every team's chance to make the playoffs, get a bye and win the title. The trade simulator shows how a deal moves your odds.
- **Saved AI chats** – conversations stay after a refresh (stored in your browser only).
- **Command dashboard** – this week's head-to-head with win odds, a live league wire of every add, drop and trade, your roster with usage (snap %, target share, carry share), next matchup, value over replacement, rest-of-season points, a week-by-week outlook to the championship, standings, and every team's needs.
- **Trade simulator** – shows each manager's trading habits (how often they trade, what they buy and sell), then plays out a trade week by week through your fantasy playoffs. Shows how many points your *actual best lineup* gains or loses (byes, injuries, forced drops included), the best player in the deal, and how likely the other manager is to accept.
- **Waiver radar** – free agents ranked by how many points they add to your lineup if you drop your weakest bench player, plus usage and trending adds.
- **Start / Sit** – optimal lineup with your win probability, matchups, injured opposing defenders and own O-linemen, Vegas spreads, implied team totals, kickoff times, weather, and lineup-lock warnings (for example, a questionable late-game starter with no healthy late backup).
- **Player cards** – tap any player for snap share, target and first-read share, air yards, red zone and goal-line work, expected fantasy points (xFP) vs actual, Next Gen Stats, the official practice report, his offense's pass rate over expected and pace, upcoming matchups, kickoff weather, market trade value and the latest news.
- **AI agent** – chat with an analyst that has your whole league loaded and can call tools: rosters, advanced usage, team environment, injury and practice reports, player news, weather, market values, free agents, matchups, the trade simulator, start/sit, and live web search.

Everything uses **your league's own scoring settings**.

**Works on phones.** On mobile you get a compact header and an app-style bottom tab bar. Open the site in Safari or Chrome and choose **Add to Home Screen** to install it like an app, with its own icon and full-screen view.

Each user brings their own AI key: **Claude**, **GPT**, **Gemini** (Google's free tier works), or any **OpenAI-compatible** provider like OpenRouter, Groq, xAI, DeepSeek or Mistral. Keys are stored only in the user's browser and sent straight to the AI provider, never to this app's server.

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

### Nightly data updates (GitHub Actions)

`.github/workflows/update-data.yml` rebuilds `data/nfl.json` from nflverse twice a day (about 7am and 7pm Eastern) and commits it if anything changed. The site reads the newest copy straight from your repo, so snap counts, practice reports and team stats stay current on their own. Nothing to set up: GitHub runs it for free on public repos. To run it right away, open your repo's **Actions** tab, pick **Update NFL data**, and click **Run workflow**.


## Getting an API key

| Provider | Where | Notes |
|---|---|---|
| Gemini (free) | https://aistudio.google.com/apikey | No card needed. Free use has per-minute and daily limits. Picks the newest Flash model automatically. |
| Claude | https://console.anthropic.com/settings/keys | Add a few dollars of credit. Default model `claude-sonnet-5`. |
| GPT | https://platform.openai.com/api-keys | Add billing. Default model `gpt-5.5`. |
| Other | OpenRouter, Groq, xAI, DeepSeek, Mistral | Choose **Other**, pick the provider, paste the key, then **Load models**. OpenRouter lists its free models (ending in `:free`) first. The model must support tool calling. |

In **Settings**, click **Load models** to pick from the models your key can use. A typical question costs a few cents on paid keys. Claude, GPT and newer Gemini models can search the web; the agent turns search off automatically if your key or model doesn't support it.

## Customize the agent's brain

**Settings → Your strategy** is the playbook the agent follows (scarcity, injury rules, how to judge trades, how to research). Edit it to match how you play. It's saved per browser, so each friend can have their own.

## How the numbers work

- **Value per game** (rest of season) blends projections with this week's matchup and Vegas stripped back out, season and recent scoring and expected fantasy points (xFP), then pulls toward two outside views: FantasyPros rest-of-season expert consensus and FantasyCalc trade-market values. So one big week can't flip a player's value or a team's needs.
- **Chance to play** multiplies this week's expected points, so a 55% questionable player counts as 55% of his projection.
- **VORP** (value over replacement) is points per game above a waiver-level starter at that position. This is how positional scarcity shows up: in a league where good RBs are scarce, RB VORP rises.
- **Expected points** for a week = value × a damped matchup factor (points the opponent allows to that position this season), set to zero on byes and for players ruled out.
- **Trade and waiver results** re-optimize your lineup every remaining week and sum the difference, so byes, injuries and roster spots all count.
- **Win probability** compares both teams' best projected lineups with a normal approximation (team weekly scores vary about 22%).
- **Trenches**: defenders and O-linemen who played 60%+ of snaps over their last 3 games count as starters. If one is ruled out or questionable (ESPN, then the official report), it shows on the matchup.
- **Trade fairness and acceptance** combine how the other team's lineup changes, a value check from FantasyCalc market values and FantasyPros expert ranks (with a star premium), and whether the deal fills one of their needs. The trade finder only suggests deals that improve your lineup, don't hurt theirs, and are fair on that value check.
- **Team needs** compare each team's rest-of-season starters to the league's typical team at each position; a need is a clear gap, not just a low rank.
- **Injury status** uses Sleeper plus ESPN's injury feed (refreshed every 15 minutes); the more serious recent designation wins. Starters who missed practice or have been on the report 3+ weeks get flagged.
- **Team environment**: pass rate over expected and neutral pass rate (1st/2nd down, win probability 20-80%, outside the last 2 minutes of a half), seconds per play in neutral situations, red zone trips, the QB's share of carries inside the 5, and EPA per play allowed on defense. League-average PROE is about -2%.

These are models, not crystal balls. They lag breaking news, which is why the agent checks the web.

## It gets better every week

When a new NFL week finishes, the nightly job (`scripts/calibrate.py`) replays last season and this season player by player: what did Sleeper, ESPN and FantasyPros consensus project, what was his season average, last 3 games and expected points from usage, and what did he actually score? It then refits:

- how much to trust each input, by position (projections vs recent form vs season average vs expected points)
- how to weigh Sleeper, ESPN and FantasyPros projections (learned, then pulled halfway toward equal)
- how big a typical miss is at each position, which drives the win probability
- how often starters at each position miss the next game, which drives depth value in trades
- how much Vegas implied team totals and defense-vs-position should move each position's projection
- how much FantasyCalc market value should count (the job saves a market snapshot before every week, so this one starts learning after a few weeks of snapshots and keeps improving)
- how much FantasyPros expert rankings should count (same idea: weekly snapshots, learned once enough weeks exist)
- each player's chance to play from his injury designation and practice report (refit on the last three seasons plus this one)

It also tests itself honestly (trained on last season, scored on this season's games) and shows War Room's average miss next to Sleeper's and ESPN's in **Settings → Data sources**.

## Data sources (all free)

| Data | Source | Freshness |
|---|---|---|
| League, rosters, scoring, standings, matchups | [Sleeper API](https://docs.sleeper.com) | ~1-2 min |
| Transactions and trade history (this and last season) | Sleeper API | 5 min |
| Weekly stats, projections, trending adds | Sleeper (public, undocumented endpoints) | 10 min to 2 h |
| Official injury report (practice participation, game status) | nfl.com, laid over the nflverse copy | each data update (Wed-Sat evenings on the default schedule) |
| Second projection source | ESPN fantasy (public, undocumented) | 2 h |
| Third projection source: consensus of many sites | FantasyPros projections (top 10 per position) + weekly expert ranks | twice daily |
| Injury designations | ESPN injuries feed + Sleeper | 15 min |
| Player news | ESPN fantasy news (Rotowire blurbs) | 20 min |
| Schedule, kickoff, spreads, totals | ESPN scoreboard | 30 min |
| Snap counts, target/air yards share, WOPR, red zone and goal-line work, practice reports, Next Gen Stats, team PROE, pace, EPA, defensive and O-line starters, rest days, surface | [nflverse](https://github.com/nflverse/nflverse-data) | twice daily |
| First-read targets | FTN Data via nflverse | twice daily |
| Expected fantasy points (xFP) | [ffopportunity](https://github.com/ffverse/ffopportunity) | twice daily |
| Player ID matching | [DynastyProcess](https://github.com/dynastyprocess/data) | twice daily |
| Expert consensus rankings (FantasyPros ROS + weekly, PPR) | FantasyPros rankings pages, [DynastyProcess mirror](https://github.com/dynastyprocess/data) as backup | twice daily (Sunday morning too) |
| Past-week projections (for projected vs actual) | Sleeper | cached 12 h |
| Trade market values | [FantasyCalc](https://fantasycalc.com) | 6 h |
| Kickoff weather | [Open-Meteo](https://open-meteo.com) | 1 h |
| Breaking news | Your AI provider's web search | live |

Data is cached on the server (and at Vercel's edge) so the app stays light on these services. Every optional source fails gracefully: if one is down, the rest of the app keeps working.

Not available for free (the agent searches the web when it matters): route participation, PFF grades, CB shadow matchups. Betting player props are left out on purpose.

**Attribution:** nflverse data is CC-BY 4.0. FTN charting data is CC-BY-SA 4.0 (FTN Data via nflverse). Thanks to the nflverse, ffverse and DynastyProcess maintainers. Expert consensus rankings and projections: FantasyPros. Check FantasyPros' terms before any paid version of War Room; it would likely need a licensed data feed.

## Project structure

```
app/
  api/            server routes that fetch and slim Sleeper + ESPN data (with caching)
  page.tsx        app entry
components/       UI: Shell, Dashboard, Trades, Waivers, StartSit, Chat, Settings
lib/
  model.ts        analytics engine (scoring, usage, DvP, VORP, lineups, trades, waivers)
  agent/          multi-provider agent loop (Claude, GPT, Gemini, OpenAI-compatible), tools, default strategy
  server/         fetchers + cache (Sleeper, ESPN, FantasyCalc, Open-Meteo, nflverse file)
  live.ts         on-demand news and weather in the browser
data/nfl.json     advanced stats built by scripts/build_nfl_data.py
scripts/          nightly nflverse data builder (Python + pandas)
.github/workflows nightly GitHub Action that runs the builder
```

To rebuild the advanced data yourself: `pip install pandas && python scripts/build_nfl_data.py`.

## Ideas for next versions

- Local models (Ollama)
- ESPN / Yahoo league support
- Rest-of-season projections from more sources
- Saved trade ideas and weekly AI briefings

## Disclaimer

Not affiliated with Sleeper, ESPN, nflverse, FTN, FantasyCalc, Anthropic, OpenAI or Google. For entertainment. Always check the latest news before you lock your lineup.

## License

MIT. See [LICENSE](./LICENSE).
