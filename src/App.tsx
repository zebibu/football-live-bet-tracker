import { useEffect, useState } from 'react'
import './App.css'
import {
  fetchLiveScoreOverview,
  liveLeagueOptions,
  type LiveScoreOverview,
} from './services/football'
import { appHighlights, featuredMatches, infoCards, leaguePulse } from './data/demoData'

function App() {
  const [footballOverview, setFootballOverview] = useState<LiveScoreOverview | null>(null)
  const [footballError, setFootballError] = useState('')
  const [selectedLiveLeague, setSelectedLiveLeague] = useState(liveLeagueOptions[0].slug)
  const [selectedLeague, setSelectedLeague] = useState('All leagues')
  const [teamQuery, setTeamQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState('All dates')
  const [stake, setStake] = useState('10')
  const [customOdds, setCustomOdds] = useState('1.80')

  const leagueOptions = ['All leagues', ...new Set(featuredMatches.map((match) => match.league))]
  const dateOptions = ['All dates', ...new Set(featuredMatches.map((match) => match.matchDate))]
  const normalizedTeamQuery = teamQuery.trim().toLowerCase()
  const filteredMatches = featuredMatches.filter((match) => {
    const matchesLeague = selectedLeague === 'All leagues' || match.league === selectedLeague
    const matchesDate = selectedDate === 'All dates' || match.matchDate === selectedDate
    const matchesTeam =
      normalizedTeamQuery.length === 0 ||
      match.home.toLowerCase().includes(normalizedTeamQuery) ||
      match.away.toLowerCase().includes(normalizedTeamQuery)

    return matchesLeague && matchesDate && matchesTeam
  })
  const parsedStake = Number(stake)
  const parsedOdds = Number(customOdds)
  const estimatedReturn = Number.isFinite(parsedStake) && Number.isFinite(parsedOdds)
    ? (parsedStake * parsedOdds).toFixed(2)
    : '0.00'
  const estimatedProfit = Number.isFinite(parsedStake) && Number.isFinite(parsedOdds)
    ? (parsedStake * parsedOdds - parsedStake).toFixed(2)
    : '0.00'

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setInterval> | undefined

    async function loadOverview() {
      try {
        const data = await fetchLiveScoreOverview(selectedLiveLeague)

        if (active) {
          setFootballOverview(data)
          setFootballError('')
        }
      } catch {
        if (active) {
          setFootballError('Live football info is unavailable right now. Showing the rest of the app normally.')
        }
      }
    }

    void loadOverview()
    timer = setInterval(() => {
      void loadOverview()
    }, 30000)

    return () => {
      active = false
      if (timer) {
        clearInterval(timer)
      }
    }
  }, [selectedLiveLeague])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Friendly football companion</span>
          <h1>Betting keeps the matches, trends, and quick picks in one calm place.</h1>
          <p className="hero-text">
            This version is designed for tracking your own betting ideas, entering your
            own prices, and following live football results without depending on a
            bookmaker app.
          </p>

          <div className="hero-actions">
            <span className="status-pill">Live scores refresh every 30 seconds</span>
            <span className="status-pill">Use your own stake and odds below</span>
          </div>

          <dl className="pulse-grid">
            {leaguePulse.map((item) => (
              <div key={item.label} className="pulse-card">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <aside className="bet-slip-card" aria-label="Preview bet slip">
          <div className="card-topline">
            <span>Quick calculator</span>
            <strong>Custom bet</strong>
          </div>

          <div className="calculator-grid">
            <label className="calculator-field">
              <span>Stake</span>
              <input type="number" min="0" step="0.01" value={stake} onChange={(event) => setStake(event.target.value)} />
            </label>

            <label className="calculator-field">
              <span>Odds</span>
              <input type="number" min="1" step="0.01" value={customOdds} onChange={(event) => setCustomOdds(event.target.value)} />
            </label>
          </div>

          <div className="slip-footer">
            <div>
              <span>Estimated return</span>
              <strong>{estimatedReturn}</strong>
            </div>
            <div>
              <span>Estimated profit</span>
              <strong>{estimatedProfit}</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Featured matches</span>
              <h2>Football picks with simple context</h2>
            </div>
            <p>Each card shows one market, one reason, and one thing to watch.</p>
          </div>

          <div className="filters-bar" aria-label="Match filters">
            <label className="filter-field">
              <span>League</span>
              <select value={selectedLeague} onChange={(event) => setSelectedLeague(event.target.value)}>
                {leagueOptions.map((league) => (
                  <option key={league} value={league}>
                    {league}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field">
              <span>Team</span>
              <input
                type="search"
                value={teamQuery}
                onChange={(event) => setTeamQuery(event.target.value)}
                placeholder="Search Arsenal, Inter..."
              />
            </label>

            <label className="filter-field">
              <span>Date</span>
              <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
                {dateOptions.map((date) => (
                  <option key={date} value={date}>
                    {date}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="matches-grid">
            {filteredMatches.map((match) => (
              <article key={match.id} className="match-card">
                <div className="match-card-head">
                  <span>{match.league}</span>
                  <span>{match.matchDate} • {match.kickoff}</span>
                </div>

                <h3>{match.home} vs {match.away}</h3>
                <p className="match-market">{match.market}</p>

                <div className="odds-row">
                  <strong>{match.odds}</strong>
                  <span>{match.confidence}</span>
                </div>

                <p className="match-note">{match.reason}</p>

                <ul className="bullet-strip" aria-label="Match details">
                  {match.tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {filteredMatches.length === 0 ? (
            <p className="empty-state">No matches fit those filters right now. Try another league, team, or date.</p>
          ) : null}
        </div>

        <div className="sidebar-stack">
          <section className="panel live-panel">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Live football feed</span>
                <h2>Real-time style results</h2>
              </div>
            </div>

            <label className="filter-field live-league-field">
              <span>Live league</span>
              <select value={selectedLiveLeague} onChange={(event) => setSelectedLiveLeague(event.target.value)}>
                {liveLeagueOptions.map((league) => (
                  <option key={league.slug} value={league.slug}>
                    {league.label}
                  </option>
                ))}
              </select>
            </label>

            {footballOverview ? (
              <>
                <article className="live-result-card">
                  <p className="live-label">{footballOverview.leagueLabel}</p>
                  <h3>{footballOverview.matches.length} matches loaded</h3>
                  <p>Last refresh at {footballOverview.updatedAt}</p>
                </article>

                <div className="table-list" aria-label="Live score list">
                  {footballOverview.matches.map((match) => (
                    <article key={match.id} className="table-row live-match-row">
                      <div>
                        <strong>{match.homeTeam} {match.homeScore} - {match.awayScore} {match.awayTeam}</strong>
                        <p>{match.kickoff} • {match.venue}</p>
                      </div>
                      <div className="live-match-meta">
                        <span>{match.status}</span>
                        {match.detailsUrl ? (
                          <a href={match.detailsUrl} target="_blank" rel="noreferrer">
                            Details
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p>{footballError || 'Loading recent football info...'}</p>
            )}
          </section>

          <section className="panel info-panel">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Today at a glance</span>
                <h2>Useful football info</h2>
              </div>
            </div>

            <div className="info-card-list">
              {infoCards.map((card) => (
                <article key={card.title} className="info-card">
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel highlights-panel">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Highlights</span>
                <h2>Before you place anything</h2>
              </div>
            </div>

            <ul className="highlights-list">
              {appHighlights.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
