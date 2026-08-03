export interface PortalUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export type PortalTier = 'free' | 'paid' | 'admin';

export interface PortalAuthContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: PortalUser | null;
  tier: PortalTier;
  getToken: () => Promise<string | null>;
  signIn: (tier?: PortalTier) => Promise<void>;
  signOut: () => Promise<void>;
}
