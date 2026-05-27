type EspnScoreboardResponse = {
  leagues?: Array<{
    slug?: string
    name?: string
  }>
  events?: Array<{
    id: string
    date: string
    competitions?: Array<{
      status?: {
        type?: {
          description?: string
          detail?: string
          state?: string
        }
      }
      venue?: {
        fullName?: string
      }
      competitors?: Array<{
        homeAway?: 'home' | 'away'
        score?: string
        team?: {
          displayName?: string
          logo?: string
        }
      }>
    }>
    links?: Array<{
      text?: string
      href?: string
    }>
  }>
}

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

const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer'

function formatKickoff(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export async function fetchLiveScoreOverview(leagueSlug: string): Promise<LiveScoreOverview> {
  const response = await fetch(`${API_BASE}/${leagueSlug}/scoreboard`)

  if (!response.ok) {
    throw new Error('Live score request failed')
  }

  const data = (await response.json()) as EspnScoreboardResponse
  const leagueLabel =
    liveLeagueOptions.find((league) => league.slug === leagueSlug)?.label ||
    data.leagues?.[0]?.name ||
    'Live scores'

  const matches =
    data.events?.slice(0, 8).map((event) => {
      const competition = event.competitions?.[0]
      const home = competition?.competitors?.find((team) => team.homeAway === 'home')
      const away = competition?.competitors?.find((team) => team.homeAway === 'away')
      const summaryLink = event.links?.find((link) => link.text === 'Summary')?.href || ''

      return {
        id: event.id,
        homeTeam: home?.team?.displayName || 'Home team',
        awayTeam: away?.team?.displayName || 'Away team',
        homeScore: home?.score || '-',
        awayScore: away?.score || '-',
        status: competition?.status?.type?.detail || competition?.status?.type?.description || 'Scheduled',
        kickoff: formatKickoff(event.date),
        venue: competition?.venue?.fullName || 'Venue pending',
        detailsUrl: summaryLink,
        homeLogo: home?.team?.logo || '',
        awayLogo: away?.team?.logo || '',
      }
    }) || []

  return {
    leagueLabel,
    updatedAt: new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date()),
    matches,
  }
}