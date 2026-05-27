export type LiveScoreLeague = {
  slug: string
  label: string
}

export type LiveScoreMatch = {
  id: string
  homeTeam: string
  awayTeam: string
  homeScore: string
  awayScore: string
  status: string
  kickoff: string
  venue: string
  detailsUrl: string
  homeLogo: string
  awayLogo: string
}

export type LiveScoreOverview = {
  leagueLabel: string
  updatedAt: string
  matches: LiveScoreMatch[]
}

export const liveLeagueOptions: LiveScoreLeague[] = [
  { slug: 'eng.1', label: 'Premier League' },
  { slug: 'esp.1', label: 'La Liga' },
  { slug: 'ita.1', label: 'Serie A' },
  { slug: 'fra.1', label: 'Ligue 1' },
]

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export async function fetchLiveScoreOverview(leagueSlug: string): Promise<LiveScoreOverview> {
  const response = await fetch(`${apiBaseUrl}/football/live?league=${encodeURIComponent(leagueSlug)}`)

  if (!response.ok) {
    throw new Error('Live score request failed')
  }

  const data = (await response.json()) as LiveScoreOverview & { message?: string }

  if (!Array.isArray(data.matches)) {
    throw new Error(data.message || 'Live score payload was invalid')
  }

  return data
}