/**
 * User entity representing a registered user account
 */
export interface User {
  id: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Shortened URL entity
 */
export interface Url {
  id: string;
  short_code: string;
  original_url: string;
  user_id: string | null;
  stats_token: string;
  expires_at: string | null;
  is_disabled: boolean;
  created_at: string;
}

/**
 * Click tracking entity for analytics
 */
export interface Click {
  id: string;
  url_id: string;
  clicked_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Authentication request payload for login and registration
 */
export interface AuthRequest {
  email: string;
  password: string;
}

/**
 * JWT payload structure for decoded tokens
 */
export interface JwtPayload {
  userId: string;
  email: string;
  isAdmin?: boolean;
  iat?: number;
  exp?: number;
}
