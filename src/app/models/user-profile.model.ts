export type UserRole = 'guest' | 'user' | 'superuser' | 'presidente';

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
   * - Opzionale per `superuser` ("Mister") e `presidente` ("Presidente")
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
  label: 'Tifoso' | 'Atleta' | 'Mister' | 'Presidente';
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
    description: 'Sola lettura di classifiche, partite e commenti.',
  },
  user: {
    role: 'user',
    label: 'Atleta',
    emoji: '⚽',
    badgeText: '⚽ Atleta',
    description: 'Giocatore in rosa con convocazioni e scheda.',
  },
  superuser: {
    role: 'superuser',
    label: 'Mister',
    emoji: '👔',
    badgeText: '👔 Mister',
    description: 'Gestione gare, convocazioni e pagelle.',
  },
  presidente: {
    role: 'presidente',
    label: 'Presidente',
    emoji: '🎩',
    badgeText: '🎩 Presidente',
    description: 'Fondatore e gestione ruoli del club.',
  },
};

/**
 * Email del Presidente & Sviluppatore ufficiale (ruolo supremo protetto da lockout).
 */
export const PRESIDENTE_EMAIL = 'giradischi666@gmail.com';

export function isPresidenteEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === PRESIDENTE_EMAIL;
}

/**
 * Email degli account Admin/Mister ufficiali protetti da lockout.
 */
export const LEGACY_SUPERUSER_EMAILS: readonly string[] = [
  'giradischi666@gmail.com',
  'lucais1991@gmail.com',
];

export interface AuthorizedRoleDoc {
  id?: string;
  email: string;
  role: UserRole;
  addedAt: string;
  addedBy?: string;
}

export function isLegacySuperUserEmail(email?: string | null): boolean {
  if (!email) return false;
  return LEGACY_SUPERUSER_EMAILS.includes(email.trim().toLowerCase());
}
