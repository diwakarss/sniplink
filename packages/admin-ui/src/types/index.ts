export interface User {
  id: string;
  email: string;
  isAdmin: boolean;
}

export interface LoginResponse {
  token: string;
  expiresIn: string;
  user: User;
}

export interface ApiError {
  error: string;
}
