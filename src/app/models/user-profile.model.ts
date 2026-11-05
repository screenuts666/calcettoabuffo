export type UserRole = 'guest' | 'user' | 'superuser';

export type AuthProviderType = 'password' | 'google.com';

export interface AppUserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: UserRole;
  /**
   * ID del documento in `giocatori/{playerId}`.
   * - Obbligatorio per `user` ("Atleta")
   * - Opzionale per `superuser` ("Mister", che può essere anche un giocatore in campo)
   * - Null per `guest` ("Tifoso")
   */
  playerId?: string | null;
  authProvider: AuthProviderType;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface RoleMeta {
  role: UserRole;
  label: 'Tifoso' | 'Atleta' | 'Mister';
  emoji: string;
  badgeText: string;
  description: string;
}

export const ROLE_METADATA: Record<UserRole, RoleMeta> = {
  guest: {
    role: 'guest',
    label: 'Tifoso',
    emoji: '🧢',
    badgeText: '🧢 Tifoso',
    description: 'Sola lettura di classifiche, partite e schede giocatori.',
  },
  user: {
    role: 'user',
    label: 'Atleta',
    emoji: '⚽',
    badgeText: '⚽ Atleta',
    description:
      'Profilo giocatore associato: modifica la tua scheda e gestisci le tue convocazioni RSVP.',
  },
  superuser: {
    role: 'superuser',
    label: 'Mister',
    emoji: '👑',
    badgeText: '👑 Mister',
    description:
      'Controllo completo su partite, pagelle, Area Segreta e gestione ruoli (può anche essere associato a un giocatore).',
  },
};

/**
 * Email dei 2 account Admin/Mister ufficiali protetti da lockout (riconosciuti come `superuser` di default).
 */
export const LEGACY_SUPERUSER_EMAILS: readonly string[] = [
  'giradischi666@gmail.com',
  'lucais1991@gmail.com',
];

export function isLegacySuperUserEmail(email?: string | null): boolean {
  if (!email) return false;
  return LEGACY_SUPERUSER_EMAILS.includes(email.trim().toLowerCase());
}
