/**
 * Cloudflare Worker Entry Point for Lesson Booking System
 * Handles Google OAuth authentication and integrates with MoonBit/Luna UI
 */
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { configure_app } from '../target/js/release/build/__gen__/server/server.js';

type Env = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;
};

type Variables = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    avatar_url: string;
  } | null;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Security headers
app.use('*', secureHeaders());

// =============================================================================
// Session Management Helpers
// =============================================================================

async function createSession(db: D1Database, userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt).run();
  return sessionId;
}

async function getSessionUser(db: D1Database, sessionId: string): Promise<Variables['user']> {
  const result = await db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.avatar_url
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')
  `).bind(sessionId).first();

  if (!result) return null;
  return {
    id: result.id as string,
    email: result.email as string,
    name: result.name as string,
    role: result.role as string,
    avatar_url: result.avatar_url as string,
  };
}

// =============================================================================
// Auth Middleware - Set user context for all routes
// =============================================================================

app.use('*', async (c, next) => {
  const sessionId = getCookie(c, 'session_id');
  if (sessionId) {
    const user = await getSessionUser(c.env.DB, sessionId);
    c.set('user', user);
    // Make user available to MoonBit via globalThis
    (globalThis as any).__CURRENT_USER = user;
  } else {
    c.set('user', null);
    (globalThis as any).__CURRENT_USER = null;
  }
  await next();
});

// =============================================================================
// Google OAuth Endpoints
// =============================================================================

// Initiate Google OAuth flow
app.get('/auth/google', (c) => {
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email https://www.googleapis.com/auth/calendar.events',
    state: state,
    access_type: 'offline',
    prompt: 'consent',
  });

  // Store state in cookie for CSRF protection
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Google OAuth callback
app.get('/auth/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const storedState = getCookie(c, 'oauth_state');

  // Clear oauth_state cookie
  deleteCookie(c, 'oauth_state');

  // Verify state
  if (!state || state !== storedState) {
    return c.text('Invalid state parameter', 400);
  }

  if (!code) {
    return c.text('Missing authorization code', 400);
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange error:', error);
      return c.text('Failed to exchange authorization code', 500);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token: string;
    };

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return c.text('Failed to get user info', 500);
    }

    const userInfo = await userInfoResponse.json() as {
      id: string;
      email: string;
      name: string;
      picture: string;
    };

    // Check if user exists
    const existingUser = await c.env.DB.prepare(
      'SELECT * FROM users WHERE google_id = ?'
    ).bind(userInfo.id).first();

    let userId: string;
    let userRole: string;

    if (existingUser) {
      // Update existing user tokens
      userId = existingUser.id as string;
      userRole = existingUser.role as string;
      await c.env.DB.prepare(`
        UPDATE users SET
          email = ?,
          name = ?,
          avatar_url = ?,
          google_access_token = ?,
          google_refresh_token = COALESCE(?, google_refresh_token),
          google_token_expires_at = ?
        WHERE id = ?
      `).bind(
        userInfo.email,
        userInfo.name,
        userInfo.picture,
        tokens.access_token,
        tokens.refresh_token || null,
        Math.floor(Date.now() / 1000) + tokens.expires_in,
        userId
      ).run();
    } else {
      // Create new user (default to student role)
      userId = crypto.randomUUID();
      userRole = 'student';
      await c.env.DB.prepare(`
        INSERT INTO users (id, google_id, email, name, avatar_url, role, google_access_token, google_refresh_token, google_token_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userId,
        userInfo.id,
        userInfo.email,
        userInfo.name,
        userInfo.picture,
        userRole,
        tokens.access_token,
        tokens.refresh_token || null,
        Math.floor(Date.now() / 1000) + tokens.expires_in
      ).run();
    }

    // Create session
    const sessionId = await createSession(c.env.DB, userId);

    // Set session cookie
    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Redirect based on role
    const redirectUrl = userRole === 'instructor' ? '/instructor' : '/student';
    return c.redirect(redirectUrl);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.text('Authentication failed', 500);
  }
});

// Logout
app.get('/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id');
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  deleteCookie(c, 'session_id');
  return c.redirect('/');
});

// =============================================================================
// Google Calendar API Endpoints (for Server Actions to call)
// =============================================================================

app.post('/api/calendar/create-event', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json() as {
      studentId: string;
      title: string;
      description: string;
      startTime: string;
      endTime: string;
    };

    // Get student's access token
    const student = await c.env.DB.prepare(
      'SELECT google_access_token, google_token_expires_at FROM users WHERE id = ?'
    ).bind(body.studentId).first();

    if (!student || !student.google_access_token) {
      return c.json({ error: 'Student not found or no calendar access' }, 400);
    }

    // Check if token expired (and refresh if needed - simplified for now)
    const accessToken = student.google_access_token as string;

    // Create calendar event
    const eventResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: body.title,
          description: body.description,
          start: {
            dateTime: body.startTime,
            timeZone: 'Asia/Tokyo',
          },
          end: {
            dateTime: body.endTime,
            timeZone: 'Asia/Tokyo',
          },
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 },
              { method: 'popup', minutes: 30 },
            ],
          },
        }),
      }
    );

    if (!eventResponse.ok) {
      const error = await eventResponse.text();
      console.error('Calendar API error:', error);
      return c.json({ error: 'Failed to create calendar event' }, 500);
    }

    const event = await eventResponse.json() as { id: string };
    return c.json({ eventId: event.id });

  } catch (error) {
    console.error('Calendar create event error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete calendar event
app.post('/api/calendar/delete-event', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.json() as {
      studentId: string;
      eventId: string;
    };

    const student = await c.env.DB.prepare(
      'SELECT google_access_token FROM users WHERE id = ?'
    ).bind(body.studentId).first();

    if (!student || !student.google_access_token) {
      return c.json({ error: 'Student not found' }, 400);
    }

    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${body.eventId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${student.google_access_token}`,
        },
      }
    );

    return c.json({ success: true });

  } catch (error) {
    console.error('Calendar delete event error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// =============================================================================
// API: Get current user (for client-side hydration)
// =============================================================================

app.get('/api/me', (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ user: null });
  }
  return c.json({ user });
});

// =============================================================================
// Protected Route Middleware
// =============================================================================

// Protect instructor routes
app.use('/instructor/*', async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.redirect('/');
  }
  if (user.role !== 'instructor') {
    return c.redirect('/student');
  }
  await next();
});

// Protect student routes
app.use('/student/*', async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.redirect('/');
  }
  // Allow both students and instructors to access student routes
  await next();
});

// =============================================================================
// MoonBit/Luna Routes
// =============================================================================

// Configure MoonBit/Luna routes (all business logic here)
configure_app(app);

// =============================================================================
// Export Worker
// =============================================================================

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    // Set D1 binding for MoonBit database access
    (globalThis as any).__D1_DB = env.DB;
    return app.fetch(request, env, ctx);
  }
};
