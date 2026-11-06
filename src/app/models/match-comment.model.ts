export interface MatchComment {
  id: string;
  matchId: string;
  authorUid?: string;
  authorName: string;
  authorPhotoUrl?: string | null;
  authorRole: 'superuser' | 'user' | 'guest';
  playerId?: string | null;
  playerTeam?: 'A' | 'B' | null;
  playerBadge?: string | null;
  text: string;
  createdAt: string;
}

