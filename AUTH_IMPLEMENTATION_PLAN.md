# Authentication Implementation Plan

**Dink Derby - Auth Strategy**

This document outlines the implementation plan for adding secure authentication to Dink Derby, supporting both Google OAuth and traditional username/password login while maintaining the app's local-first architecture.

---

## 1. Overview & Goals

### Current State
- Anonymous device-based identity (`Device.id`)
- Optional display name
- No persistent user accounts
- No way to access your data from multiple devices

### Target State
- **Google OAuth** for easy social login
- **Username/Password** for those who prefer it
- Secure session management
- Ability to link anonymous devices to authenticated accounts
- Multi-device support for the same user
- Backward compatible with existing anonymous users

### Security Priorities
1. Password storage: bcrypt hashing (cost factor 12+)
2. Token security: HTTP-only cookies for refresh tokens, short-lived JWTs for access
3. OAuth security: state parameter validation, PKCE where applicable
4. Rate limiting on auth endpoints
5. No sensitive data in logs or client responses
6. Secure password reset flow

---

## 2. Data Model Changes

### 2.1 Update `User` Table

```ts
User {
  id: string;              // existing
  displayName: string;     // existing
  avatarUrl?: string;      // existing

  // New fields
  email?: string;          // unique, nullable (for password auth)
  emailVerified: boolean;  // default false
  passwordHash?: string;   // bcrypt hash, nullable

  // OAuth fields
  googleId?: string;       // unique, nullable
  googleEmail?: string;    // their Google email

  // Security
  accountStatus: 'active' | 'suspended' | 'deleted';
  failedLoginAttempts: number;
  lastFailedLoginAt?: string;
  lastLoginAt?: string;

  createdAt: string;       // existing
  updatedAt: string;       // existing
}
```

**Indexes:**
- Unique on `email` (where not null)
- Unique on `googleId` (where not null)
- Index on `accountStatus`

### 2.2 New `RefreshToken` Table

Store refresh tokens for session management.

```ts
RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;       // hashed token (don't store plain)
  deviceId?: string;       // link to Device table
  deviceName?: string;     // "iPhone 13", "Chrome on MacBook"
  ipAddress?: string;      // for security auditing
  userAgent?: string;      // for device identification
  expiresAt: string;       // 30 days default
  revokedAt?: string;      // for logout
  createdAt: string;
}
```

**Indexes:**
- Index on `userId`
- Index on `tokenHash`
- Index on `expiresAt` (for cleanup jobs)

### 2.3 New `PasswordResetToken` Table

Temporary tokens for password reset flow.

```ts
PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;       // hashed token
  expiresAt: string;       // 1 hour lifespan
  usedAt?: string;         // single use
  createdAt: string;
}
```

### 2.4 Update `Device` Table

Link devices to authenticated users.

```ts
Device {
  id: string;              // existing
  userId?: string;         // existing - now properly linked after auth

  // New fields
  linkedAt?: string;       // when device was linked to user account
  lastSeenAt: string;      // for stale device cleanup

  createdAt: string;       // existing
}
```

---

## 3. Authentication Flows

### 3.1 Username/Password Registration

**Endpoint:** `POST /auth/register`

**Request:**
```ts
{
  email: string;           // valid email format
  password: string;        // min 8 chars, complexity rules
  displayName: string;
  deviceId?: string;       // optional: link existing device
}
```

**Process:**
1. Validate input (Zod schema)
   - Email format
   - Password: min 8 chars, 1 uppercase, 1 lowercase, 1 number
   - Display name: 2-50 chars
2. Check email not already registered
3. Hash password with bcrypt (cost factor 12)
4. Create User record
5. Send verification email (with signed token)
6. Generate access token (JWT) + refresh token
7. Return tokens + user info

**Response:**
```ts
{
  user: User;              // without passwordHash
  accessToken: string;     // JWT, 15min expiry
  refreshToken: string;    // set as HTTP-only cookie
}
```

**Security:**
- Rate limit: 5 attempts per IP per hour
- CAPTCHA consideration for public launch
- Password validation enforced server-side

### 3.2 Username/Password Login

**Endpoint:** `POST /auth/login`

**Request:**
```ts
{
  email: string;
  password: string;
  deviceId?: string;
}
```

**Process:**
1. Find user by email
2. Check account status (not suspended/deleted)
3. Check failed login attempts (lock after 5 failed attempts in 15min)
4. Compare password with bcrypt
5. On success:
   - Reset failed login attempts
   - Update lastLoginAt
   - Generate access + refresh tokens
   - Link deviceId if provided
6. On failure:
   - Increment failed login attempts
   - Return generic error ("Invalid credentials")

**Response:**
```ts
{
  user: User;
  accessToken: string;
  refreshToken: string;    // HTTP-only cookie
}
```

**Security:**
- Rate limit: 10 attempts per IP per 15min
- Account lockout: 5 failed attempts → 15min lockout
- Generic error messages (don't reveal if email exists)
- Log failed attempts with IP for monitoring

### 3.3 Google OAuth Flow

**Endpoints:**
- `GET /auth/google` - Initiate OAuth
- `GET /auth/google/callback` - Handle callback

**Libraries:**
- `passport` + `passport-google-oauth20` OR
- `@fastify/oauth2` (lighter weight)

**Flow:**

1. **Initiate (`GET /auth/google`):**
   - Generate state parameter (random, store in session/cookie)
   - Redirect to Google OAuth consent screen
   - Request scopes: `profile`, `email`

2. **Callback (`GET /auth/google/callback`):**
   - Validate state parameter (CSRF protection)
   - Exchange code for tokens
   - Fetch user profile from Google
   - Check if `googleId` exists in DB:
     - **Yes:** Login existing user
     - **No:** Check if `googleEmail` matches existing user:
       - **Yes:** Link Google to existing account
       - **No:** Create new user
   - Generate access + refresh tokens
   - Redirect to client with tokens (or set cookies)

**Environment Variables:**
```env
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

**Security:**
- State parameter validation (prevent CSRF)
- Verify token signature from Google
- Only accept tokens for our client ID
- Store Google tokens securely if needed for future API calls

### 3.4 Token Refresh

**Endpoint:** `POST /auth/refresh`

**Request:**
```ts
{
  refreshToken: string;    // from HTTP-only cookie
}
```

**Process:**
1. Extract refresh token from cookie
2. Hash and lookup in RefreshToken table
3. Validate:
   - Not expired
   - Not revoked
   - User account still active
4. Generate new access token
5. Optionally rotate refresh token

**Response:**
```ts
{
  accessToken: string;
}
```

**Security:**
- Refresh tokens stored as hashes
- Long expiry (30 days) but revocable
- Rotate on use (optional, adds complexity)

### 3.5 Logout

**Endpoint:** `POST /auth/logout`

**Process:**
1. Extract refresh token from cookie
2. Mark as revoked in DB
3. Clear cookies
4. Return success

**Security:**
- Revoke specific token (not all user tokens)
- Client should also clear local access token

### 3.6 Logout All Devices

**Endpoint:** `POST /auth/logout-all`

**Process:**
1. Authenticate user (verify access token)
2. Revoke all RefreshTokens for userId
3. Return success

**Use case:** User suspects account compromise

### 3.7 Password Reset

**Endpoints:**
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`

**Request Reset:**
```ts
{
  email: string;
}
```

**Process:**
1. Find user by email
2. Generate random token (crypto.randomBytes)
3. Hash and store in PasswordResetToken table
4. Send email with reset link: `https://app.com/reset?token=xxx`
5. Return success (even if email not found - don't leak user existence)

**Confirm Reset:**
```ts
{
  token: string;
  newPassword: string;
}
```

**Process:**
1. Hash token and lookup in DB
2. Validate:
   - Not expired (1 hour)
   - Not used
   - User exists and active
3. Hash new password
4. Update user passwordHash
5. Mark token as used
6. Revoke all refresh tokens (force re-login everywhere)
7. Send confirmation email

**Security:**
- Tokens expire in 1 hour
- Single use only
- Rate limit reset requests (3 per email per hour)
- Always return success to prevent email enumeration

### 3.8 Email Verification

**Endpoint:** `POST /auth/verify-email`

**Request:**
```ts
{
  token: string;
}
```

**Process:**
1. Decode/verify signed token (JWT)
2. Extract userId
3. Update user.emailVerified = true
4. Return success

**Email sent on:**
- Registration
- Email change

---

## 4. JWT Strategy

### 4.1 Access Token (JWT)

**Payload:**
```ts
{
  sub: string;             // userId
  email?: string;
  displayName: string;
  iat: number;             // issued at
  exp: number;             // expiry (15 minutes)
}
```

**Storage:** Client localStorage or memory (if using cookies)

**Algorithm:** HS256 (HMAC with SHA-256)

**Secret:** Strong random secret in environment variable

### 4.2 Refresh Token

**Format:** Random bytes (256 bits), base64 encoded

**Storage:**
- Server: Hashed in RefreshToken table
- Client: HTTP-only, Secure, SameSite=Strict cookie

**Expiry:** 30 days

**Rotation:** Optional - rotate on each refresh for extra security

### 4.3 Token Middleware

**Fastify hook:** `onRequest` hook for protected routes

```ts
async function authenticateJWT(request, reply) {
  try {
    // Extract token from Authorization header
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) {
      return reply.code(401).send({ error: 'No token provided' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request
    request.user = {
      userId: decoded.sub,
      email: decoded.email,
      displayName: decoded.displayName
    };
  } catch (err) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}
```

---

## 5. Security Implementation Details

### 5.1 Password Security

**Hashing:**
- Library: `bcrypt`
- Cost factor: 12 (adjustable for future-proofing)
- Example:
  ```ts
  const passwordHash = await bcrypt.hash(password, 12);
  const isValid = await bcrypt.compare(password, passwordHash);
  ```

**Validation Rules:**
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- Optional: 1 special character
- No common passwords (check against list or use library like `zxcvbn`)

### 5.2 Rate Limiting

**Endpoints to protect:**
- `POST /auth/register` - 5/hour per IP
- `POST /auth/login` - 10/15min per IP
- `POST /auth/password-reset/request` - 3/hour per IP
- All auth endpoints - 100/15min per IP (general)

**Implementation:**
- Use `@fastify/rate-limit`
- Redis-backed for distributed systems (future)
- Return 429 with Retry-After header

### 5.3 Cookie Security

**Refresh token cookie settings:**
```ts
{
  httpOnly: true,          // No JS access
  secure: true,            // HTTPS only (except localhost dev)
  sameSite: 'strict',      // CSRF protection
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/auth/refresh'    // Only sent to refresh endpoint
}
```

### 5.4 OAuth Security

**Google OAuth checklist:**
- ✅ Use state parameter (CSRF protection)
- ✅ Validate state on callback
- ✅ Verify token signature
- ✅ Check token audience (client ID)
- ✅ Use HTTPS in production
- ✅ Whitelist redirect URIs in Google Console

### 5.5 Token Storage

**Client-side:**
- Access token: Memory or localStorage (trade-off: convenience vs XSS risk)
- Refresh token: HTTP-only cookie (never accessible to JS)

**Server-side:**
- Refresh tokens: Hashed with SHA-256 before storage
- Never log tokens
- Redact tokens in error messages

### 5.6 Account Lockout

**After 5 failed login attempts:**
- Lock account for 15 minutes
- OR require CAPTCHA
- Send email notification
- Log event for security monitoring

**Unlock:**
- Automatic after 15 min
- Manual password reset
- Admin intervention (future)

### 5.7 Input Validation

**All auth inputs validated with Zod:**

```ts
const RegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase')
    .regex(/[a-z]/, 'Password must contain lowercase')
    .regex(/[0-9]/, 'Password must contain number'),
  displayName: z.string().min(2).max(50).trim()
});
```

**Sanitization:**
- Email: trim, lowercase
- Display name: trim, sanitize (no HTML)
- All inputs: max length checks

---

## 6. Database Migrations

### Migration 001: Add Auth Fields to Users

```sql
ALTER TABLE users
  ADD COLUMN email VARCHAR(255) UNIQUE,
  ADD COLUMN email_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN password_hash VARCHAR(255),
  ADD COLUMN google_id VARCHAR(255) UNIQUE,
  ADD COLUMN google_email VARCHAR(255),
  ADD COLUMN account_status VARCHAR(20) DEFAULT 'active',
  ADD COLUMN failed_login_attempts INTEGER DEFAULT 0,
  ADD COLUMN last_failed_login_at TIMESTAMP,
  ADD COLUMN last_login_at TIMESTAMP;

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_account_status ON users(account_status);
```

### Migration 002: Create RefreshToken Table

```sql
CREATE TABLE refresh_tokens (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  device_id VARCHAR(255) REFERENCES devices(id) ON DELETE SET NULL,
  device_name VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
```

### Migration 003: Create PasswordResetToken Table

```sql
CREATE TABLE password_reset_tokens (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
```

### Migration 004: Update Device Table

```sql
ALTER TABLE devices
  ADD COLUMN linked_at TIMESTAMP,
  ADD COLUMN last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX idx_devices_user_id ON devices(user_id);
```

---

## 7. API Changes & Endpoints

### 7.1 New Auth Routes

```text
POST   /auth/register              - Create account with email/password
POST   /auth/login                 - Login with email/password
POST   /auth/logout                - Logout current session
POST   /auth/logout-all            - Logout all sessions
POST   /auth/refresh               - Refresh access token
GET    /auth/google                - Initiate Google OAuth
GET    /auth/google/callback       - Google OAuth callback
POST   /auth/password-reset/request - Request password reset
POST   /auth/password-reset/confirm - Confirm password reset
POST   /auth/verify-email          - Verify email address
GET    /auth/me                    - Get current user info
PATCH  /auth/me                    - Update profile
POST   /auth/link-device           - Link anonymous device to account
GET    /auth/sessions              - List active sessions
DELETE /auth/sessions/:id          - Revoke specific session
```

### 7.2 Protected Routes

All existing routes become protected (require valid JWT):

```text
GET    /derbies          → Requires: authentication
POST   /derbies          → Requires: authentication
GET    /derbies/:id      → Requires: authentication + membership
POST   /derbies/:id/join → Requires: authentication
POST   /sync             → Requires: authentication
```

### 7.3 Sync Endpoint Changes

**Old:**
```ts
POST /sync
{
  clientId: string;      // device ID
  lastSyncedAt?: string;
  outbox: SyncOutboxItem[];
}
```

**New:**
```ts
POST /sync
Headers: Authorization: Bearer <access-token>
{
  deviceId: string;      // still tracked
  lastSyncedAt?: string;
  outbox: SyncOutboxItem[];
}
```

**Changes:**
- Extract `userId` from JWT
- Link operations to authenticated user
- Validate user has access to derby before syncing catches
- Return only data user has permission to see

---

## 8. Client-Side Changes

### 8.1 Auth State Management

**Option 1: React Context**
```tsx
interface AuthContext {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}
```

**Option 2: State management lib (Zustand, Jotai)**

### 8.2 Token Management

**Access Token Storage:**
- Store in memory (most secure, lost on refresh)
- OR localStorage (persistent, XSS risk)

**Auto-refresh Strategy:**
- Intercept 401 responses
- Call `/auth/refresh` automatically
- Retry original request with new token
- Logout if refresh fails

**Example with fetch wrapper:**
```ts
async function authenticatedFetch(url, options) {
  const token = getAccessToken();

  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    },
    credentials: 'include' // Include cookies for refresh token
  });

  if (response.status === 401) {
    // Try to refresh
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${getAccessToken()}`
        }
      });
    } else {
      // Refresh failed, logout
      logout();
    }
  }

  return response;
}
```

### 8.3 Protected Routes

**Using TanStack Router:**
```tsx
const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/derbies',
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  }
});
```

### 8.4 Anonymous to Authenticated Migration

**Flow:**
1. User has been using app anonymously (has `deviceId`, catches, etc.)
2. User decides to create account or login
3. On successful auth:
   - Call `POST /auth/link-device` with `deviceId`
   - Server links `deviceId` to `userId`
   - All catches/data now associated with authenticated user
   - User can access from other devices

**Endpoint:**
```ts
POST /auth/link-device
{
  deviceId: string;
}
```

**Server logic:**
```ts
async function linkDevice(userId, deviceId) {
  // Update device
  await db.update(devices)
    .set({ userId, linkedAt: new Date().toISOString() })
    .where(eq(devices.id, deviceId));

  // Update all catches, derby participations, etc.
  await db.update(catches)
    .set({ userId })
    .where(eq(catches.deviceId, deviceId));
}
```

---

## 9. Email Service

### 9.1 Required Emails

1. **Email verification** (on signup)
2. **Password reset** (with link)
3. **Password changed** (confirmation)
4. **Account locked** (too many failed logins)
5. **New device login** (security notification)

### 9.2 Implementation Options

**Option 1: SendGrid**
- Reliable, good free tier
- Template support
- Good API

**Option 2: AWS SES**
- Cheap, scales well
- More setup required

**Option 3: Resend**
- Developer-friendly
- Modern API
- Great for startups

**Recommendation:** Start with **Resend** for simplicity

### 9.3 Email Templates

Store as HTML templates or use service's template system.

**Example verification email:**
```html
Subject: Verify your Dink Derby email

Hey {{ displayName }},

Welcome to Dink Derby! Click below to verify your email:

{{ verificationLink }}

This link expires in 24 hours.

If you didn't create this account, ignore this email.

— The Dink Derby Team
```

### 9.4 Email Service Abstraction

**Create email service module:**
```ts
interface EmailService {
  sendVerificationEmail(email: string, displayName: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, displayName: string, token: string): Promise<void>;
  sendPasswordChangedEmail(email: string, displayName: string): Promise<void>;
  sendAccountLockedEmail(email: string, displayName: string): Promise<void>;
}
```

**Benefits:**
- Easy to swap providers
- Testable (mock in tests)
- Consistent error handling

---

## 10. Testing Strategy

### 10.1 Unit Tests

**Auth service functions:**
- `hashPassword()` - produces different hashes for same password
- `comparePassword()` - validates correctly
- `generateAccessToken()` - creates valid JWT
- `generateRefreshToken()` - creates unique tokens
- `validatePasswordStrength()` - enforces rules

**Email service:**
- Mock email sending
- Verify correct templates used
- Verify token inclusion

### 10.2 Integration Tests

**Registration flow:**
1. POST /auth/register with valid data → 201 + tokens
2. POST /auth/register with existing email → 409
3. POST /auth/register with weak password → 400
4. POST /auth/register with invalid email → 400

**Login flow:**
1. POST /auth/login with valid creds → 200 + tokens
2. POST /auth/login with wrong password → 401
3. POST /auth/login 6 times with wrong password → account locked
4. POST /auth/login with inactive account → 403

**Token refresh:**
1. POST /auth/refresh with valid token → new access token
2. POST /auth/refresh with expired token → 401
3. POST /auth/refresh with revoked token → 401

**OAuth flow:**
1. Mock Google OAuth responses
2. Test new user creation
3. Test existing user login
4. Test email linking

**Protected routes:**
1. GET /derbies without token → 401
2. GET /derbies with valid token → 200
3. GET /derbies with expired token → 401

### 10.3 E2E Tests (Playwright)

**Full registration + login:**
```ts
test('user can register and login', async ({ page }) => {
  // Register
  await page.goto('/register');
  await page.fill('[name=email]', 'test@example.com');
  await page.fill('[name=password]', 'SecurePass123');
  await page.fill('[name=displayName]', 'Test User');
  await page.click('button[type=submit]');

  // Should be logged in and redirected
  await expect(page).toHaveURL('/derbies');
  await expect(page.locator('text=Test User')).toBeVisible();

  // Logout
  await page.click('[data-testid=logout]');

  // Login again
  await page.goto('/login');
  await page.fill('[name=email]', 'test@example.com');
  await page.fill('[name=password]', 'SecurePass123');
  await page.click('button[type=submit]');

  await expect(page).toHaveURL('/derbies');
});
```

**Anonymous to authenticated:**
```ts
test('anonymous user can convert to authenticated', async ({ page }) => {
  // Use app anonymously
  await page.goto('/');
  await createDerby(page);
  await addCatch(page);

  // Register
  await page.goto('/register');
  await register(page, 'test@example.com', 'Pass123', 'Angler');

  // Should see previous derby and catch
  await expect(page.locator('[data-testid=derby-list]')).toContainText('Test Derby');
});
```

---

## 11. Implementation Phases

### Phase 1: Backend Foundation (Week 1)
- [ ] Database migrations (users, refresh_tokens, password_reset_tokens)
- [ ] Drizzle schema updates
- [ ] Password hashing utilities (bcrypt)
- [ ] JWT service (generate, verify, refresh)
- [ ] Email service abstraction + Resend integration
- [ ] Unit tests for auth utilities

### Phase 2: Username/Password Auth (Week 1-2)
- [ ] POST /auth/register endpoint + validation
- [ ] POST /auth/login endpoint + rate limiting
- [ ] POST /auth/logout endpoint
- [ ] POST /auth/refresh endpoint
- [ ] JWT middleware for protected routes
- [ ] Password reset flow (request + confirm)
- [ ] Email verification flow
- [ ] Integration tests

### Phase 3: Google OAuth (Week 2)
- [ ] Google OAuth setup (credentials, callback URL)
- [ ] GET /auth/google endpoint
- [ ] GET /auth/google/callback endpoint
- [ ] Link Google account to existing user
- [ ] Test OAuth flow (with mock provider in tests)

### Phase 4: Session Management (Week 2-3)
- [ ] GET /auth/sessions (list active sessions)
- [ ] DELETE /auth/sessions/:id (revoke session)
- [ ] POST /auth/logout-all (revoke all sessions)
- [ ] Device linking (POST /auth/link-device)
- [ ] Anonymous user migration

### Phase 5: Client Integration (Week 3-4)
- [ ] Auth context/state management
- [ ] Login/register UI components
- [ ] Token storage + auto-refresh logic
- [ ] Protected route guards
- [ ] Anonymous to authenticated flow UI
- [ ] Profile settings page
- [ ] Session management UI

### Phase 6: Security Hardening (Week 4)
- [ ] Rate limiting on all auth endpoints
- [ ] Account lockout after failed attempts
- [ ] Security headers (Helmet.js)
- [ ] CORS configuration
- [ ] Audit logging for auth events
- [ ] Token cleanup job (expired/revoked tokens)
- [ ] Security testing (OWASP checklist)

### Phase 7: Polish & Docs (Week 4-5)
- [ ] Error messages user-friendly
- [ ] Loading states in UI
- [ ] Email templates finalized
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Update README with auth setup
- [ ] E2E tests for all flows

---

## 12. Environment Variables

```env
# JWT
JWT_SECRET=<strong-random-secret-min-32-chars>
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=30d

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Email (Resend)
RESEND_API_KEY=re_xxx
FROM_EMAIL=noreply@dinkderby.com
APP_URL=https://dinkderby.com

# Security
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 min
RATE_LIMIT_MAX=100

# Database
DATABASE_URL=postgresql://...
```

---

## 13. Security Checklist

Before launch:

- [ ] Passwords hashed with bcrypt (cost 12+)
- [ ] JWTs signed with strong secret (32+ chars random)
- [ ] Refresh tokens stored as hashes
- [ ] HTTP-only cookies for refresh tokens
- [ ] Secure cookies in production (HTTPS)
- [ ] SameSite=Strict on cookies
- [ ] Rate limiting on auth endpoints
- [ ] Account lockout after failed logins
- [ ] Email verification required (optional but recommended)
- [ ] Password reset tokens single-use + expire
- [ ] No sensitive data in logs
- [ ] No tokens in error messages
- [ ] Input validation on all endpoints (Zod)
- [ ] SQL injection prevention (parameterized queries via Drizzle)
- [ ] XSS prevention (sanitize display names, etc.)
- [ ] CORS configured correctly
- [ ] Security headers (Helmet.js)
- [ ] HTTPS in production
- [ ] OAuth state parameter validated
- [ ] Dependency audit (npm audit)
- [ ] Secrets in env vars, not code
- [ ] Token cleanup job scheduled

---

## 14. Monitoring & Logging

**Log these auth events:**
- Successful registration (userId, email)
- Successful login (userId, IP, userAgent)
- Failed login (email, IP, reason)
- Account lockout (userId, IP)
- Password reset request (email)
- Password changed (userId)
- Token refresh (userId)
- Logout (userId)
- OAuth success/failure (provider, userId)

**Metrics to track:**
- Registration rate
- Login success/failure rate
- Active sessions count
- Token refresh rate
- Password reset requests
- Account lockouts
- OAuth provider usage

**Alerts:**
- Spike in failed logins (potential attack)
- Account lockouts
- Failed token verifications
- Email sending failures

---

## 15. Migration from Anonymous Users

**Strategy for existing users:**

1. **Keep anonymous mode available** (no forced signup)
2. **Prompt to create account** after first catch or derby
3. **Seamless linking:** When user registers/logs in, automatically link their `deviceId` to the new account
4. **Data ownership:** All catches, derbies, etc. created by `deviceId` are transferred to authenticated `userId`

**UI Flow:**
```
[Anonymous user catches first fish]
  ↓
[Banner: "Create an account to save your catches across devices"]
  ↓
[User taps "Sign Up"]
  ↓
[Registration form with deviceId in hidden field]
  ↓
[On success, server links device to user]
  ↓
[User now sees same data, but can login from other devices]
```

---

## 16. Future Enhancements

**Beyond initial launch:**

- **Social login:** Apple, Facebook, GitHub
- **Two-factor authentication (2FA):** TOTP, SMS
- **Passkeys / WebAuthn:** Passwordless auth
- **Account deletion:** GDPR compliance
- **Data export:** Let users export their data
- **OAuth scopes:** Fine-grained permissions
- **API keys:** For third-party integrations
- **Team/Organization accounts:** Share derbies across groups

---

## 17. Resources & Libraries

**Backend:**
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT generation/validation
- `@fastify/rate-limit` - Rate limiting
- `@fastify/cookie` - Cookie handling
- `@fastify/oauth2` or `passport-google-oauth20` - Google OAuth
- `zod` - Input validation
- `resend` - Email sending

**Client:**
- `react-hook-form` + `zod` - Form handling + validation
- `@tanstack/react-query` - Data fetching + caching
- `@tanstack/react-router` - Routing + protected routes

**Security:**
- `helmet` - Security headers
- `@fastify/cors` - CORS configuration
- `crypto` (Node.js built-in) - Token generation

---

## Conclusion

This plan provides a comprehensive, secure authentication system for Dink Derby that:

✅ Supports both Google OAuth and username/password
✅ Follows security best practices
✅ Maintains local-first architecture
✅ Allows seamless migration from anonymous usage
✅ Scales to multi-device access
✅ Can be implemented incrementally

**Next steps:**
1. Review and approve this plan
2. Set up environment (Google OAuth credentials, email service)
3. Begin Phase 1 implementation
4. Test thoroughly at each phase
5. Deploy with feature flags for gradual rollout

Questions? Security concerns? Let's discuss before implementation begins.
