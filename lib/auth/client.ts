"use client";

/**
 * Client-side auth helper functions
 * 
 * These functions proxy Supabase auth calls through Next.js API routes
 * to hide the Supabase URL from the network tab.
 */

export interface AuthUser {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  created_at?: string;
  updated_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type: string;
  user: AuthUser;
}

export interface AuthResponse {
  user: AuthUser;
  session?: AuthSession;
}

/**
 * Get the current authenticated user
 * Replaces: supabase.auth.getUser()
 */
export async function getUser(): Promise<{ data: { user: AuthUser | null }; error: Error | null }> {
  try {
    const response = await fetch('/api/auth/user', {
      method: 'GET',
      credentials: 'include', // Include cookies for session
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { data: { user: null }, error: null };
      }
      const errorData = await response.json().catch(() => ({ error: 'Failed to get user' }));
      return { 
        data: { user: null }, 
        error: new Error(errorData.error || 'Failed to get user') 
      };
    }

    const data = await response.json();
    return { data: { user: data.user || null }, error: null };
  } catch (error) {
    return { 
      data: { user: null }, 
      error: error instanceof Error ? error : new Error('Failed to get user') 
    };
  }
}

/**
 * Get the current session
 * Replaces: supabase.auth.getSession()
 */
export async function getSession(): Promise<{ data: { session: AuthSession | null }; error: Error | null }> {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include', // Include cookies for session
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { data: { session: null }, error: null };
      }
      const errorData = await response.json().catch(() => ({ error: 'Failed to get session' }));
      return { 
        data: { session: null }, 
        error: new Error(errorData.error || 'Failed to get session') 
      };
    }

    const data = await response.json();
    return { data: { session: data.session || null }, error: null };
  } catch (error) {
    return { 
      data: { session: null }, 
      error: error instanceof Error ? error : new Error('Failed to get session') 
    };
  }
}

/**
 * Sign in with email and password
 * Replaces: supabase.auth.signInWithPassword({ email, password })
 */
export async function signIn(email: string, password: string): Promise<{ 
  data: AuthResponse | null; 
  error: Error | null 
}> {
  try {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for session
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Sign in failed' }));
      return { 
        data: null, 
        error: new Error(errorData.error || 'Sign in failed') 
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return { 
      data: null, 
      error: error instanceof Error ? error : new Error('Sign in failed') 
    };
  }
}

/**
 * Sign out the current user
 * Replaces: supabase.auth.signOut()
 */
export async function signOut(): Promise<{ error: Error | null }> {
  try {
    const response = await fetch('/api/auth/signout', {
      method: 'POST',
      credentials: 'include', // Include cookies for session
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Sign out failed' }));
      return { 
        error: new Error(errorData.error || 'Sign out failed') 
      };
    }

    return { error: null };
  } catch (error) {
    return { 
      error: error instanceof Error ? error : new Error('Sign out failed') 
    };
  }
}

