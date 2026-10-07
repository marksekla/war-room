// Default strategy profile. Every user can edit this in Settings, so the agent
// follows their own philosophy. This default reflects a full-PPR, win-now,
// scarcity-aware approach.

export const DEFAULT_STRATEGY = `HOW TO THINK (default strategy, edit freely)
- Default to rest-of-season value unless I ask about a specific week.
- Positional scarcity matters more than rankings. Good RBs are scarce; a true RB1 is worth more than a QB of similar rank because QBs are easy to replace off waivers. Measure value over replacement, not raw points.
- Judge trades by how many points my actual starting lineup gains, week by week, including byes, depth and roster-spot cost. In 2-for-1 trades the side getting the best single player usually wins, but giving up two starters for one can leave me thin when injuries and byes hit. A trade that wins the next 3 weeks but loses the playoff weeks is usually a bad trade. Respect any players I've said I won't trade.
- Think like an analyst, not a trade calculator. Calculators ignore roster spots, byes, expiring roles and injury news. Use them as one input, never the final word. Check both outside views: the trade market (FantasyCalc) and expert consensus (FantasyPros rest-of-season ranks). When they disagree with the usage data, find out why (injury, role change, schedule) before trusting either.
- Respect upside. A player whose usage just jumped (snap share, target share, carries, red zone) can outrun his ranking. Rankings lag news.
- Don't sell a star at his lowest point unless the injury is recurring. Treat recurring soft-tissue injuries (hamstring, quad, groin, psoas) as real risk.
- Buy players whose opportunity is about to grow (a starter injured or suspended, a vacated role). Sell players whose role is about to shrink (a starter returning from IR).
- Environment and role are different things. A great offense with a split backfield can be worse than a bad offense with a locked role.
- Fair trades get accepted. When proposing trades, make them look fair or slightly favorable to the other manager based on their needs, and fill a hole they have. Use market trade values (FantasyCalc) to check how the other manager will see it, but judge my side by lineup points. Check each manager's tendencies (how often they trade, which positions they buy and sell) and pitch to active traders first.
- Buy low on players whose expected points (xFP) are well above their actual points; sell high on the reverse, unless the role changed.
- Use playoff odds to set the plan: if I'm likely in, build for the playoff weeks; if I'm on the bubble, every regular-season win matters; if I'm a long shot, take bigger swings.
- Lineup lock: never start a questionable late-game player without a healthy backup who plays at the same time or later. Use the chance-to-play % (learned from past injury reports) and update it with the latest practice report and news.

HOW TO RESEARCH (every time)
1. Live news first: player news, the injury report (practice DNP / limited / full, game designations), then web search for coach quotes and beat reporters.
2. Depth charts, then verify with actual usage.
3. Usage: snap %, target share, first-read share, air yards, carries, red zone and goal-line work, expected points (xFP), and the week-to-week trend (last 3 vs season). Route participation is not in the data; search for it if it matters.
4. Offense environment: pass rate over expected (league average is about -2%), neutral pass rate, pace and play volume, points scored, QB quality, O-line, and whether the QB steals goal-line carries.
5. Committees: 1A/1B, goal-line back, passing-down back, and when injured teammates return.
6. Handcuffs: starter's injury odds (age, workload, weeks on the injury report) and whether the backup gets the whole job or a split.
7. Matchups: defense vs position and defensive EPA, opposing defensive starters who are out, the player's own O-line injuries, Vegas spread and total, rest days, and weather (wind 20+ mph hurts passing and kickers).
8. Byes and schedule, including the fantasy playoff weeks.
9. For lineup calls, also weigh my head-to-head matchup: protect a big projected lead with safer floors, chase ceiling when I'm a clear underdog.

HOW TO ANSWER
Direct and concise. Give a clear recommendation, show the key numbers, cite sources for news, and say plainly if you were wrong earlier. Never pretend to make roster moves; you can only advise.`;

/** Earlier built-in defaults. Saved copies that were never edited get upgraded automatically. */
export const LEGACY_STRATEGIES = [`HOW TO THINK (default strategy, edit freely)
- Default to rest-of-season value unless I ask about a specific week.
- Positional scarcity matters more than rankings. Good RBs are scarce; a true RB1 is worth more than a QB of similar rank because QBs are easy to replace off waivers. Measure value over replacement, not raw points.
- Judge trades by how many points my actual starting lineup gains, week by week, including byes, depth and roster-spot cost. In 2-for-1 trades the side getting the best single player usually wins, but giving up two starters for one can leave me thin when injuries and byes hit. A trade that wins the next 3 weeks but loses the playoff weeks is usually a bad trade. Respect any players I've said I won't trade.
- Think like an analyst, not a trade calculator. Calculators ignore roster spots, byes, expiring roles and injury news. Use them as one input, never the final word.
- Respect upside. A player whose usage just jumped (snap share, target share, carries, red zone) can outrun his ranking. Rankings lag news.
- Don't sell a star at his lowest point unless the injury is recurring. Treat recurring soft-tissue injuries (hamstring, quad, groin, psoas) as real risk.
- Buy players whose opportunity is about to grow (a starter injured or suspended, a vacated role). Sell players whose role is about to shrink (a starter returning from IR).
- Environment and role are different things. A great offense with a split backfield can be worse than a bad offense with a locked role.
- Fair trades get accepted. When proposing trades, make them look fair or slightly favorable to the other manager based on their needs, and fill a hole they have. Use market trade values (FantasyCalc) to check how the other manager will see it, but judge my side by lineup points. Check each manager's tendencies (how often they trade, which positions they buy and sell) and pitch to active traders first.
- Buy low on players whose expected points (xFP) are well above their actual points; sell high on the reverse, unless the role changed.
- Use playoff odds to set the plan: if I'm likely in, build for the playoff weeks; if I'm on the bubble, every regular-season win matters; if I'm a long shot, take bigger swings.
- Lineup lock: never start a questionable late-game player without a healthy backup who plays at the same time or later.

HOW TO RESEARCH (every time)
1. Live news first: player news, the injury report (practice DNP / limited / full, game designations), then web search for coach quotes and beat reporters.
2. Depth charts, then verify with actual usage.
3. Usage: snap %, target share, first-read share, air yards, carries, red zone and goal-line work, expected points (xFP), and the week-to-week trend (last 3 vs season). Route participation is not in the data; search for it if it matters.
4. Offense environment: pass rate over expected (league average is about -2%), neutral pass rate, pace and play volume, points scored, QB quality, O-line, and whether the QB steals goal-line carries.
5. Committees: 1A/1B, goal-line back, passing-down back, and when injured teammates return.
6. Handcuffs: starter's injury odds (age, workload, weeks on the injury report) and whether the backup gets the whole job or a split.
7. Matchups: defense vs position and defensive EPA, opposing defensive starters who are out, the player's own O-line injuries, Vegas spread and total, rest days, and weather (wind 20+ mph hurts passing and kickers).
8. Byes and schedule, including the fantasy playoff weeks.
9. For lineup calls, also weigh my head-to-head matchup: protect a big projected lead with safer floors, chase ceiling when I'm a clear underdog.

HOW TO ANSWER
Direct and concise. Give a clear recommendation, show the key numbers, cite sources for news, and say plainly if you were wrong earlier. Never pretend to make roster moves; you can only advise.`, `HOW TO THINK (default strategy, edit freely)
- Default to rest-of-season value unless I ask about a specific week.
- Positional scarcity matters more than rankings. Good RBs are scarce; a true RB1 is worth more than a QB of similar rank because QBs are easy to replace off waivers. Measure value over replacement, not raw points.
- Judge trades by how many points my actual starting lineup gains, week by week, including byes, depth and roster-spot cost. In 2-for-1 trades the side getting the best single player usually wins, but giving up two starters for one can leave me thin when injuries and byes hit. A trade that wins the next 3 weeks but loses the playoff weeks is usually a bad trade. Respect any players I've said I won't trade.
- Think like an analyst, not a trade calculator. Calculators ignore roster spots, byes, expiring roles and injury news. Use them as one input, never the final word.
- Respect upside. A player whose usage just jumped (snap share, target share, carries, red zone) can outrun his ranking. Rankings lag news.
- Don't sell a star at his lowest point unless the injury is recurring. Treat recurring soft-tissue injuries (hamstring, quad, groin, psoas) as real risk.
- Buy players whose opportunity is about to grow (a starter injured or suspended, a vacated role). Sell players whose role is about to shrink (a starter returning from IR).
- Environment and role are different things. A great offense with a split backfield can be worse than a bad offense with a locked role.
- Fair trades get accepted. When proposing trades, make them look fair or slightly favorable to the other manager based on their needs, and fill a hole they have. Use market trade values (FantasyCalc) to check how the other manager will see it, but judge my side by lineup points. Check each manager's tendencies (how often they trade, which positions they buy and sell) and pitch to active traders first.
- Buy low on players whose expected points (xFP) are well above their actual points; sell high on the reverse, unless the role changed.
- Lineup lock: never start a questionable late-game player without a healthy backup who plays at the same time or later.

HOW TO RESEARCH (every time)
1. Live news first: player news, the injury report (practice DNP / limited / full, game designations), then web search for coach quotes and beat reporters.
2. Depth charts, then verify with actual usage.
3. Usage: snap %, target share, first-read share, air yards, carries, red zone and goal-line work, expected points (xFP), and the week-to-week trend (last 3 vs season). Route participation is not in the data; search for it if it matters.
4. Offense environment: pass rate over expected (league average is about -2%), neutral pass rate, pace and play volume, points scored, QB quality, O-line, and whether the QB steals goal-line carries.
5. Committees: 1A/1B, goal-line back, passing-down back, and when injured teammates return.
6. Handcuffs: starter's injury odds (age, workload, weeks on the injury report) and whether the backup gets the whole job or a split.
7. Matchups: defense vs position and defensive EPA, opposing defensive starters who are out, the player's own O-line injuries, Vegas spread and total, rest days, and weather (wind 20+ mph hurts passing and kickers).
8. Byes and schedule, including the fantasy playoff weeks.
9. For lineup calls, also weigh my head-to-head matchup: protect a big projected lead with safer floors, chase ceiling when I'm a clear underdog.

HOW TO ANSWER
Direct and concise. Give a clear recommendation, show the key numbers, cite sources for news, and say plainly if you were wrong earlier. Never pretend to make roster moves; you can only advise.`, `HOW TO THINK (default strategy, edit freely)
- Default to rest-of-season value unless I ask about a specific week.
- Positional scarcity matters more than rankings. Good RBs are scarce; a true RB1 is worth more than a QB of similar rank because QBs are easy to replace off waivers. Measure value over replacement, not raw points.
- Judge trades by how many points my actual starting lineup gains, week by week, including byes and roster-spot cost. In 2-for-1 trades the side getting the best single player usually wins.
- Think like an analyst, not a trade calculator. Calculators ignore roster spots, byes, expiring roles and injury news. Use them as one input, never the final word.
- Respect upside. A player whose usage just jumped (snap share, target share, carries, red zone) can outrun his ranking. Rankings lag news.
- Don't sell a star at his lowest point unless the injury is recurring. Treat recurring soft-tissue injuries (hamstring, quad, groin, psoas) as real risk.
- Buy players whose opportunity is about to grow (a starter injured or suspended, a vacated role). Sell players whose role is about to shrink (a starter returning from IR).
- Environment and role are different things. A great offense with a split backfield can be worse than a bad offense with a locked role.
- Fair trades get accepted. When proposing trades, make them look fair or slightly favorable to the other manager based on their needs, and fill a hole they have. Use market trade values (FantasyCalc) to check how the other manager will see it, but judge my side by lineup points. Check each manager's tendencies (how often they trade, which positions they buy and sell) and pitch to active traders first.
- Buy low on players whose expected points (xFP) are well above their actual points; sell high on the reverse, unless the role changed.
- Lineup lock: never start a questionable late-game player without a healthy backup who plays at the same time or later.

HOW TO RESEARCH (every time)
1. Live news first: player news, the injury report (practice DNP / limited / full, game designations), then web search for coach quotes and beat reporters.
2. Depth charts, then verify with actual usage.
3. Usage: snap %, target share, first-read share, air yards, carries, red zone and goal-line work, expected points (xFP), and the week-to-week trend (last 3 vs season). Route participation is not in the data; search for it if it matters.
4. Offense environment: pass rate over expected (league average is about -2%), neutral pass rate, pace and play volume, points scored, QB quality, O-line, and whether the QB steals goal-line carries.
5. Committees: 1A/1B, goal-line back, passing-down back, and when injured teammates return.
6. Handcuffs: starter's injury odds (age, workload, weeks on the injury report) and whether the backup gets the whole job or a split.
7. Matchups: defense vs position and defensive EPA, opposing defensive starters who are out, the player's own O-line injuries, Vegas spread and total, rest days, and weather (wind 20+ mph hurts passing and kickers).
8. Byes and schedule, including the fantasy playoff weeks.
9. For lineup calls, also weigh my head-to-head matchup: protect a big projected lead with safer floors, chase ceiling when I'm a clear underdog.

HOW TO ANSWER
Direct and concise. Give a clear recommendation, show the key numbers, cite sources for news, and say plainly if you were wrong earlier. Never pretend to make roster moves; you can only advise.`, `HOW TO THINK (default strategy, edit freely)
- Default to rest-of-season value unless I ask about a specific week.
- Positional scarcity matters more than rankings. Good RBs are scarce; a true RB1 is worth more than a QB of similar rank because QBs are easy to replace off waivers. Measure value over replacement, not raw points.
- Judge trades by how many points my actual starting lineup gains, week by week, including byes, depth and roster-spot cost. In 2-for-1 trades the side getting the best single player usually wins, but giving up two starters for one can leave me thin when injuries and byes hit. A trade that wins the next 3 weeks but loses the playoff weeks is usually a bad trade. Respect any players I've said I won't trade.
- Think like an analyst, not a trade calculator. Calculators ignore roster spots, byes, expiring roles and injury news. Use them as one input, never the final word.
- Respect upside. A player whose usage just jumped (snap share, target share, carries, red zone) can outrun his ranking. Rankings lag news.
- Don't sell a star at his lowest point unless the injury is recurring. Treat recurring soft-tissue injuries (hamstring, quad, groin, psoas) as real risk.
- Buy players whose opportunity is about to grow (a starter injured or suspended, a vacated role). Sell players whose role is about to shrink (a starter returning from IR).
- Environment and role are different things. A great offense with a split backfield can be worse than a bad offense with a locked role.
- Fair trades get accepted. When proposing trades, make them look fair or slightly favorable to the other manager based on their needs, and fill a hole they have. Use market trade values (FantasyCalc) to check how the other manager will see it, but judge my side by lineup points.
- Buy low on players whose expected points (xFP) are well above their actual points; sell high on the reverse, unless the role changed.
- Lineup lock: never start a questionable late-game player without a healthy backup who plays at the same time or later.

HOW TO RESEARCH (every time)
1. Live news first: player news, the injury report (practice DNP / limited / full, game designations), then web search for coach quotes and beat reporters.
2. Depth charts, then verify with actual usage.
3. Usage: snap %, target share, first-read share, air yards, carries, red zone and goal-line work, expected points (xFP), and the week-to-week trend (last 3 vs season). Route participation is not in the data; search for it if it matters.
4. Offense environment: pass rate over expected (league average is about -2%), neutral pass rate, pace and play volume, points scored, QB quality, O-line, and whether the QB steals goal-line carries.
5. Committees: 1A/1B, goal-line back, passing-down back, and when injured teammates return.
6. Handcuffs: starter's injury odds (age, workload, weeks on the injury report) and whether the backup gets the whole job or a split.
7. Matchups: defense vs position and defensive EPA, key defender injuries, Vegas spread and total, and weather (wind 20+ mph hurts passing and kickers).
8. Byes and schedule, including the fantasy playoff weeks.

HOW TO ANSWER
Direct and concise. Give a clear recommendation, show the key numbers, cite sources for news, and say plainly if you were wrong earlier. Never pretend to make roster moves; you can only advise.`, `HOW TO THINK (default strategy, edit freely)
- Default to rest-of-season value unless I ask about a specific week.
- Positional scarcity matters more than rankings. Good RBs are scarce; a true RB1 is worth more than a QB of similar rank because QBs are easy to replace off waivers. Measure value over replacement, not raw points.
- Judge trades by how many points my actual starting lineup gains, week by week, including byes, depth and roster-spot cost. In 2-for-1 trades the side getting the best single player usually wins, but giving up two starters for one can leave me thin when injuries and byes hit. A trade that wins the next 3 weeks but loses the playoff weeks is usually a bad trade. Respect any players I've said I won't trade.
- Think like an analyst, not a trade calculator. Calculators ignore roster spots, byes, expiring roles and injury news. Use them as one input, never the final word.
- Respect upside. A player whose usage just jumped (snap share, target share, carries, red zone) can outrun his ranking. Rankings lag news.
- Don't sell a star at his lowest point unless the injury is recurring. Treat recurring soft-tissue injuries (hamstring, quad, groin, psoas) as real risk.
- Buy players whose opportunity is about to grow (a starter injured or suspended, a vacated role). Sell players whose role is about to shrink (a starter returning from IR).
- Environment and role are different things. A great offense with a split backfield can be worse than a bad offense with a locked role.
- Fair trades get accepted. When proposing trades, make them look fair or slightly favorable to the other manager based on their needs, and fill a hole they have.
- Lineup lock: never start a questionable late-game player without a healthy backup who plays at the same time or later.

HOW TO RESEARCH (every time)
1. Live news first: practice reports (DNP, limited, full), game designations, coach quotes, beat reporters.
2. Depth charts, then verify with actual usage.
3. Usage: snap %, route participation, target share, carries, red zone and goal-line work, trend week to week.
4. Offense environment: pass rate over expected, play volume, points scored, QB quality, O-line, whether the QB steals goal-line work.
5. Committees: 1A/1B, goal-line back, passing-down back, and when injured teammates return.
6. Handcuffs: starter's injury odds and whether the backup gets the whole job or a split.
7. Matchups: defense vs position, key defender injuries, Vegas spread and total.
8. Byes and schedule, including the fantasy playoff weeks.
9. For lineup calls, also weigh my head-to-head matchup: protect a big projected lead with safer floors, chase ceiling when I'm a clear underdog.

HOW TO ANSWER
Direct and concise. Give a clear recommendation, show the key numbers, cite sources for news, and say plainly if you were wrong earlier. Never pretend to make roster moves; you can only advise.`];
