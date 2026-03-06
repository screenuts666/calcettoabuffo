export enum MatchState {
  LIVE = 'LIVE',
  TO_VOTE = 'TO_VOTE',
  ARCHIVED = 'ARCHIVED',
}

export function deriveMatchState(m: any): MatchState {
  if (!m) return MatchState.LIVE;
  if (m.pagelleInserite) return MatchState.ARCHIVED;
  if (m.matchConcluso) return MatchState.TO_VOTE;
  return MatchState.LIVE;
}
