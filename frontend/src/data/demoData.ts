export type MatchCard = {
  id: string
  league: string
  matchDate: string
  kickoff: string
  home: string
  away: string
  market: string
  odds: string
  confidence: string
  reason: string
  tags: string[]
}

export const featuredMatches: MatchCard[] = [
  {
    id: 'int-ars-new',
    league: 'Premier League',
    matchDate: '2026-05-28',
    kickoff: '19:45',
    home: 'Arsenal',
    away: 'Newcastle',
    market: 'Arsenal to win',
    odds: '1.68',
    confidence: 'Stable',
    reason: 'Arsenal have the stronger home form and more consistent chance creation.',
    tags: ['Home form', 'Possession edge', 'Top-four race'],
  },
  {
    id: 'ita-int-fio',
    league: 'Serie A',
    matchDate: '2026-05-28',
    kickoff: '20:00',
    home: 'Inter',
    away: 'Fiorentina',
    market: 'Over 2.5 goals',
    odds: '1.84',
    confidence: 'Medium-high',
    reason: 'Both sides are creating good xG recently and Inter matches are opening up late.',
    tags: ['Goals trend', 'Late scoring', 'Strong attack'],
  },
  {
    id: 'esp-rma-bet',
    league: 'La Liga',
    matchDate: '2026-05-29',
    kickoff: '21:00',
    home: 'Real Madrid',
    away: 'Real Betis',
    market: 'Both teams to score',
    odds: '1.77',
    confidence: 'Medium',
    reason: 'Madrid usually score, but Betis have enough transition quality to create chances too.',
    tags: ['BTTS', 'Transition threat', 'Open game'],
  },
  {
    id: 'fra-psg-lil',
    league: 'Ligue 1',
    matchDate: '2026-05-30',
    kickoff: '18:30',
    home: 'PSG',
    away: 'Lille',
    market: 'PSG or draw + over 1.5',
    odds: '1.54',
    confidence: 'Safer',
    reason: 'This keeps the pick simple while still leaning on PSG attacking output.',
    tags: ['Double chance', 'Safer play', 'Attack form'],
  },
]

export const leaguePulse = [
  { label: 'Matches today', value: '14' },
  { label: 'Best home price', value: '1.68' },
  { label: 'Goal-heavy games', value: '5' },
  { label: 'Leagues tracked', value: '4' },
]

export const infoCards = [
  {
    title: 'Form check',
    body: 'Look at the last five matches before trusting a short price. Good form matters more than badge size.',
  },
  {
    title: 'Squad news',
    body: 'A missing striker or two defenders out can change goal and result markets very quickly.',
  },
  {
    title: 'Style clues',
    body: 'Teams that press high often create corners, shots, and late goals even when the match starts slowly.',
  },
]

export const appHighlights = [
  {
    title: 'Keep the view simple',
    body: 'One match card equals one market idea, so your friend can scan without opening ten tabs.',
  },
  {
    title: 'Track your own prices',
    body: 'This version is for your own bet ideas, stake notes, and odds planning without depending on an external bookmaker app.',
  },
  {
    title: 'Swap the data layer later',
    body: 'The live results panel is connected to a real scoreboard feed and can still be replaced later without changing the main layout.',
  },
]