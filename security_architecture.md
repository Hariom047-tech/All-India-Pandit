# PanditConnect — Complete Security Architecture (original proposal)

> **Basic → Advanced level security — every attack vector covered.**
>
> **Status: partially implemented, by design.** This is a generic, infrastructure-agnostic security
> checklist — most of it assumes things this project doesn't have (Redis, a Cloudflare account, a
> provisioned Linux server with a domain and TLS cert, a file-upload feature, an OAuth app, a mail/
> Slack alerting service) or would replace something already built and tested with a rough equivalent
> for no real gain (JWT access+refresh rotation vs. the DB-backed opaque bearer sessions already in
> `backend/src/db/01-schema.sql`'s `user_sessions` table, which already support revocation). See
> `docs/SECURITY.md` for exactly what was implemented, what was deliberately skipped, and why — that
> document is the current source of truth; this one is the original ask.

---

## Security Overview

```mermaid
graph TD
    INTERNET["Internet / Attacker"] --> CDN["Layer 1: CDN + DDoS Protection<br/>Cloudflare"]
    CDN --> WAF["Layer 2: Web Application Firewall<br/>WAF Rules"]
    WAF --> LB["Layer 3: Load Balancer<br/>SSL Termination"]
    LB --> RATELIMIT["Layer 4: Rate Limiter<br/>Redis-based"]
    RATELIMIT --> AUTH["Layer 5: Authentication<br/>JWT + MFA"]
    AUTH --> AUTHZ["Layer 6: Authorization<br/>RBAC + RLS"]
    AUTHZ --> VALIDATE["Layer 7: Input Validation<br/>Sanitization"]
    VALIDATE --> APP["Layer 8: Application Logic<br/>Secure Code"]
    APP --> DB["Layer 9: Database<br/>Encrypted + RLS"]
    DB --> BACKUP["Layer 10: Backup<br/>Encrypted Offsite"]

    style INTERNET fill:#ff4444,color:#fff
    style CDN fill:#4CAF50,color:#fff
    style WAF fill:#4CAF50,color:#fff
    style LB fill:#4CAF50,color:#fff
    style RATELIMIT fill:#FF9800,color:#fff
    style AUTH fill:#2196F3,color:#fff
    style AUTHZ fill:#2196F3,color:#fff
    style VALIDATE fill:#9C27B0,color:#fff
    style APP fill:#607D8B,color:#fff
    style DB fill:#795548,color:#fff
    style BACKUP fill:#795548,color:#fff
```

---

## Layer 1: Authentication Security

### 1.1 Password Security

```javascript
// ============================================================
// PASSWORD HASHING — bcrypt with high cost factor
// ============================================================
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = 12;  // High cost = slower brute force

// Hash password before storing
async function hashPassword(plainPassword) {
    // Validate password strength FIRST
    if (!isStrongPassword(plainPassword)) {
        throw new Error('Password does not meet security requirements');
    }
    return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

// Verify password during login
async function verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

// ============================================================
// PASSWORD POLICY — Enforce strong passwords
// ============================================================
function isStrongPassword(password) {
    const rules = {
        minLength: password.length >= 8,
        maxLength: password.length <= 128,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"|,.<>\/?]/.test(password),
        noCommonPasswords: !COMMON_PASSWORDS.includes(password.toLowerCase()),
        noSequential: !/(.)\1{2,}/.test(password),  // No "aaa", "111"
    };

    return Object.values(rules).every(r => r === true);
}

// Block common passwords list (top 10,000)
const COMMON_PASSWORDS = [
    'password', '123456', 'qwerty', 'admin',
    'letmein', 'welcome', 'pandit123', /* ... */
];
```

### 1.2 JWT Token Security

```javascript
// ============================================================
// JWT TOKEN — Short-lived access + Long-lived refresh
// ============================================================
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_CONFIG = {
    accessToken: {
        secret: process.env.JWT_ACCESS_SECRET,   // 256-bit random key
        expiresIn: '15m',                         // SHORT — 15 minutes only
        algorithm: 'HS256',
    },
    refreshToken: {
        secret: process.env.JWT_REFRESH_SECRET,   // DIFFERENT secret
        expiresIn: '7d',                          // 7 days
        algorithm: 'HS256',
    },
};

// Generate access token
function generateAccessToken(user) {
    return jwt.sign(
        {
            sub: user.id,           // User ID
            role: user.role,        // Role for authorization
            email: user.email,
            jti: crypto.randomUUID(), // Unique token ID (for revocation)
            iat: Math.floor(Date.now() / 1000),
        },
        JWT_CONFIG.accessToken.secret,
        {
            expiresIn: JWT_CONFIG.accessToken.expiresIn,
            algorithm: JWT_CONFIG.accessToken.algorithm,
            issuer: 'panditconnect.com',
            audience: 'panditconnect-api',
        }
    );
}

// Generate refresh token (stored in httpOnly cookie)
function generateRefreshToken(user) {
    const token = jwt.sign(
        {
            sub: user.id,
            jti: crypto.randomUUID(),
            type: 'refresh',
        },
        JWT_CONFIG.refreshToken.secret,
        {
            expiresIn: JWT_CONFIG.refreshToken.expiresIn,
            algorithm: JWT_CONFIG.refreshToken.algorithm,
        }
    );

    // Store refresh token hash in DB (for revocation)
    storeRefreshTokenHash(user.id, hashToken(token));

    return token;
}

// ============================================================
// TOKEN ROTATION — New refresh token on every refresh
// ============================================================
async function refreshAccessToken(req, res) {
    const oldRefreshToken = req.cookies.refreshToken;

    // 1. Verify old refresh token
    const decoded = jwt.verify(oldRefreshToken, JWT_CONFIG.refreshToken.secret);

    // 2. Check if token is in DB (not revoked)
    const isValid = await isRefreshTokenValid(decoded.sub, hashToken(oldRefreshToken));
    if (!isValid) {
        // POSSIBLE TOKEN THEFT — Revoke ALL tokens for this user
        await revokeAllUserTokens(decoded.sub);
        throw new SecurityError('Token reuse detected — all sessions revoked');
    }

    // 3. Revoke old refresh token
    await revokeRefreshToken(hashToken(oldRefreshToken));

    // 4. Issue new pair (rotation)
    const user = await getUserById(decoded.sub);
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // 5. Set new refresh token in httpOnly cookie
    setSecureCookie(res, 'refreshToken', newRefreshToken);

    return { accessToken: newAccessToken };
}
```

### 1.3 Multi-Factor Authentication (MFA)

```javascript
// ============================================================
// OTP-BASED MFA — Phone/Email verification
// ============================================================
const speakeasy = require('speakeasy');

const OTP_CONFIG = {
    length: 6,
    encoding: 'base32',
    step: 300,          // 5 minutes validity
    window: 1,          // Allow 1 step before/after
    maxAttempts: 5,     // Max wrong attempts
    cooldown: 60,       // 60 sec between OTP requests
};

// Generate OTP
function generateOTP() {
    return speakeasy.totp({
        secret: process.env.OTP_SECRET,
        encoding: OTP_CONFIG.encoding,
        step: OTP_CONFIG.step,
        digits: OTP_CONFIG.length,
    });
}

// Verify OTP with attempt tracking
async function verifyOTP(userId, inputOTP) {
    const otpRecord = await getLatestOTP(userId);

    // Check max attempts
    if (otpRecord.attempts >= OTP_CONFIG.maxAttempts) {
        await lockAccount(userId, '30 minutes', 'Too many OTP attempts');
        throw new SecurityError('Account temporarily locked — too many attempts');
    }

    // Increment attempt counter
    await incrementOTPAttempt(otpRecord.id);

    // Check expiry
    if (new Date() > otpRecord.expires_at) {
        throw new SecurityError('OTP expired');
    }

    // Verify
    const isValid = await bcrypt.compare(inputOTP, otpRecord.otp_hash);
    if (!isValid) {
        throw new SecurityError(`Invalid OTP. ${OTP_CONFIG.maxAttempts - otpRecord.attempts - 1} attempts remaining`);
    }

    // Mark as verified
    await markOTPVerified(otpRecord.id);
    return true;
}

// ============================================================
// TOTP-BASED MFA — For Admin accounts (Google Authenticator)
// ============================================================
function setupTOTP(userId) {
    const secret = speakeasy.generateSecret({
        name: `PanditConnect:${userId}`,
        issuer: 'PanditConnect',
        length: 32,
    });

    // Store encrypted secret in DB
    storeEncryptedTOTPSecret(userId, encrypt(secret.base32));

    return {
        secret: secret.base32,
        qrCodeUrl: secret.otpauth_url,
    };
}
```

### 1.4 OAuth 2.0 Security (Google/Facebook Login)

```javascript
// ============================================================
// OAUTH — Secure social login flow
// ============================================================
const OAUTH_CONFIG = {
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUrl: 'https://panditconnect.com/auth/google/callback',
        scope: ['profile', 'email'],
    },
};

// Verify Google ID token server-side (NEVER trust client-side)
async function verifyGoogleToken(idToken) {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(OAUTH_CONFIG.google.clientId);

    const ticket = await client.verifyIdToken({
        idToken,
        audience: OAUTH_CONFIG.google.clientId,
    });

    const payload = ticket.getPayload();

    // Verify email is verified by Google
    if (!payload.email_verified) {
        throw new SecurityError('Email not verified by Google');
    }

    return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatar: payload.picture,
    };
}

// STATE PARAMETER — Prevent CSRF in OAuth flow
function generateOAuthState() {
    const state = crypto.randomBytes(32).toString('hex');
    // Store in session with expiry
    storeOAuthState(state, Date.now() + 600000); // 10 min
    return state;
}
```

### 1.5 Brute Force Protection

```javascript
// ============================================================
// LOGIN ATTEMPT LIMITING — Prevent brute force
// ============================================================
const LOGIN_LIMITS = {
    maxAttempts: 5,           // Per account
    lockDuration: 30 * 60,    // 30 minutes lock
    ipMaxAttempts: 20,        // Per IP across all accounts
    ipLockDuration: 60 * 60,  // 1 hour IP lock
    progressiveDelay: true,   // Increasing delay between attempts
};

async function handleLoginAttempt(email, ip) {
    const key = `login:${email}`;
    const ipKey = `login_ip:${ip}`;

    // Check account lock
    const accountAttempts = await redis.get(key);
    if (accountAttempts >= LOGIN_LIMITS.maxAttempts) {
        const ttl = await redis.ttl(key);
        throw new SecurityError(
            `Account locked. Try again in ${Math.ceil(ttl / 60)} minutes`
        );
    }

    // Check IP lock (distributed brute force)
    const ipAttempts = await redis.get(ipKey);
    if (ipAttempts >= LOGIN_LIMITS.ipMaxAttempts) {
        // Log suspicious activity
        await logSecurityEvent('DISTRIBUTED_BRUTE_FORCE', { ip, email });
        throw new SecurityError('Too many login attempts from this IP');
    }

    // Progressive delay: 0s, 1s, 2s, 4s, 8s...
    if (LOGIN_LIMITS.progressiveDelay && accountAttempts > 0) {
        const delay = Math.pow(2, accountAttempts - 1) * 1000;
        await sleep(Math.min(delay, 30000)); // Max 30s delay
    }
}

async function recordFailedLogin(email, ip) {
    await redis.incr(`login:${email}`);
    await redis.expire(`login:${email}`, LOGIN_LIMITS.lockDuration);

    await redis.incr(`login_ip:${ip}`);
    await redis.expire(`login_ip:${ip}`, LOGIN_LIMITS.ipLockDuration);
}

async function clearLoginAttempts(email) {
    await redis.del(`login:${email}`);
}
```

---

## Layer 2: Authorization (RBAC + Permissions)

```javascript
// ============================================================
// ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================
const PERMISSIONS = {
    // Devotee (regular user)
    devotee: [
        'temple:read', 'pandit:read', 'service:read',
        'review:create', 'review:read',
        'inquiry:create', 'inquiry:read:own',
        'profile:read:own', 'profile:update:own',
        'saved:manage:own',
        'community:read', 'community:create', 'community:comment',
        'blog:read', 'panchang:read',
    ],

    // Pandit
    pandit: [
        // All devotee permissions +
        'pandit_profile:read:own', 'pandit_profile:update:own',
        'pandit_services:manage:own',
        'pandit_temples:manage:own',
        'pandit_availability:manage:own',
        'pandit_media:manage:own',
        'inquiry:read:own', 'inquiry:reply:own',
        'review:respond:own',
        'analytics:read:own',
        'subscription:manage:own',
    ],

    // Temple Admin
    temple_admin: [
        // All devotee permissions +
        'temple:update:own', 'temple:manage:own',
        'temple_media:manage:own',
        'temple_services:manage:own',
        'temple_pandits:manage:own',
    ],

    // Platform Admin
    admin: [
        'temple:*', 'pandit:*', 'service:*',
        'review:*', 'inquiry:*', 'user:read', 'user:update',
        'blog:*', 'community:moderate',
        'analytics:read:all', 'subscription:*',
        'reports:*',
    ],

    // Super Admin
    super_admin: ['*'],  // Everything
};

// ============================================================
// AUTHORIZATION MIDDLEWARE
// ============================================================
function authorize(...requiredPermissions) {
    return (req, res, next) => {
        const userRole = req.user.role;
        const userPermissions = PERMISSIONS[userRole] || [];

        // Super admin bypass
        if (userPermissions.includes('*')) return next();

        const hasPermission = requiredPermissions.every(perm => {
            return userPermissions.some(userPerm => {
                if (userPerm === perm) return true;
                // Wildcard matching: 'temple:*' matches 'temple:read'
                const [resource, action] = perm.split(':');
                return userPerm === `${resource}:*`;
            });
        });

        if (!hasPermission) {
            logSecurityEvent('UNAUTHORIZED_ACCESS', {
                userId: req.user.id,
                attempted: requiredPermissions,
                role: userRole,
                path: req.path,
            });
            return res.status(403).json({ error: 'Forbidden — insufficient permissions' });
        }

        next();
    };
}

// ============================================================
// RESOURCE OWNERSHIP CHECK — Users can only modify their own data
// ============================================================
function authorizeOwner(resourceField = 'user_id') {
    return async (req, res, next) => {
        const resource = req.resource; // Set by previous middleware

        if (!resource) return res.status(404).json({ error: 'Not found' });

        // Admin bypass
        if (['admin', 'super_admin'].includes(req.user.role)) return next();

        // Check ownership
        if (resource[resourceField] !== req.user.id) {
            logSecurityEvent('OWNERSHIP_VIOLATION', {
                userId: req.user.id,
                resourceId: resource.id,
                path: req.path,
            });
            return res.status(403).json({ error: 'You do not own this resource' });
        }

        next();
    };
}

// Usage:
// router.put('/pandits/:id', authenticate, authorize('pandit_profile:update:own'), authorizeOwner('user_id'), updatePandit);
```

---

## Layer 3: Input Validation & Injection Prevention

### 3.1 SQL Injection Prevention

```javascript
// ============================================================
// PARAMETERIZED QUERIES — NEVER concatenate user input into SQL
// ============================================================

// WRONG — SQL Injection vulnerable
const NEVER_DO_THIS = `SELECT * FROM users WHERE email = '${userInput}'`;

// CORRECT — Parameterized query
const { Pool } = require('pg');
const pool = new Pool();

async function getUserByEmail(email) {
    const result = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]  // Parameterized — auto-escaped
    );
    return result.rows[0];
}

// CORRECT — Using ORM (Prisma/Knex) with built-in protection
// Prisma
const user = await prisma.user.findUnique({
    where: { email: sanitizedEmail },
});

// Knex
const user = await knex('users')
    .where('email', sanitizedEmail)
    .whereNull('deleted_at')
    .first();
```

### 3.2 XSS Prevention

```javascript
// ============================================================
// XSS PROTECTION — Sanitize ALL user-generated content
// ============================================================
const DOMPurify = require('isomorphic-dompurify');
const validator = require('validator');

// Sanitize HTML content (for rich text like reviews, blog)
function sanitizeHTML(dirty) {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
        ALLOWED_ATTR: [],  // No attributes allowed
        ALLOW_DATA_ATTR: false,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
        FORBID_ATTR: ['onclick', 'onerror', 'onload', 'style', 'href'],
    });
}

// Escape plain text output
function escapeOutput(text) {
    return validator.escape(text); // Converts <, >, &, ", ' to HTML entities
}

// Sanitize for JSON responses
function sanitizeObject(obj) {
    if (typeof obj === 'string') return escapeOutput(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [k, sanitizeObject(v)])
        );
    }
    return obj;
}
```

### 3.3 Input Validation Schema

```javascript
// ============================================================
// REQUEST VALIDATION — Using Joi/Zod for strict schemas
// ============================================================
const Joi = require('joi');

// User registration schema
const registerSchema = Joi.object({
    full_name: Joi.string()
        .trim()
        .min(2).max(150)
        .pattern(/^[a-zA-Z\sऀ-ॿ]+$/) // English + Hindi chars only
        .required(),

    email: Joi.string()
        .email({ tlds: { allow: true } })
        .lowercase()
        .max(255)
        .required(),

    phone: Joi.string()
        .pattern(/^[6-9]\d{9}$/)  // Valid Indian mobile number
        .required(),

    password: Joi.string()
        .min(8).max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
        .required()
        .messages({
            'string.pattern.base': 'Password must contain uppercase, lowercase, number, and special character',
        }),

    city: Joi.string().trim().max(100).optional(),
    state: Joi.string().trim().max(100).optional(),
}).options({ stripUnknown: true }); // Remove extra fields

// Inquiry schema
const inquirySchema = Joi.object({
    pandit_id: Joi.string().uuid().required(),
    temple_id: Joi.string().uuid().optional(),
    service_id: Joi.string().uuid().optional(),
    full_name: Joi.string().trim().min(2).max(150).required(),
    phone: Joi.string().pattern(/^[6-9]\d{9}$/).required(),
    email: Joi.string().email().optional(),
    message: Joi.string().trim().max(1000).optional(),
    preferred_date: Joi.date().min('now').max(Joi.ref('$maxDate')).optional(),
}).options({ stripUnknown: true });

// Review schema
const reviewSchema = Joi.object({
    reviewable_type: Joi.string().valid('pandit', 'temple').required(),
    reviewable_id: Joi.string().uuid().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    title: Joi.string().trim().max(200).optional(),
    body: Joi.string().trim().max(2000).optional(),
    service_id: Joi.string().uuid().optional(),
}).options({ stripUnknown: true });

// ============================================================
// VALIDATION MIDDLEWARE
// ============================================================
function validate(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            context: { maxDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
        });

        if (error) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.details.map(d => ({
                    field: d.path.join('.'),
                    message: d.message,
                })),
            });
        }

        req.body = value; // Use sanitized values
        next();
    };
}

// Usage:
// router.post('/register', validate(registerSchema), registerUser);
```

---

## Layer 4: API Security

### 4.1 Rate Limiting

```javascript
// ============================================================
// MULTI-TIER RATE LIMITING
// ============================================================
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

// Global API rate limit
const globalLimiter = rateLimit({
    store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 100,                    // 100 requests per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait and try again.' },
    keyGenerator: (req) => req.ip,
});

// Strict limit for auth endpoints
const authLimiter = rateLimit({
    store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
    windowMs: 15 * 60 * 1000,
    max: 10,                     // Only 10 login attempts per 15 min
    message: { error: 'Too many login attempts. Account may be locked.' },
    keyGenerator: (req) => `${req.ip}:${req.body?.email || 'unknown'}`,
});

// OTP request limit
const otpLimiter = rateLimit({
    windowMs: 60 * 1000,         // 1 minute
    max: 1,                      // 1 OTP per minute
    message: { error: 'Please wait 60 seconds before requesting another OTP.' },
});

// Search endpoint limit
const searchLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,     // 1 minute
    max: 30,                     // 30 searches per minute
});

// File upload limit
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,    // 1 hour
    max: 20,                     // 20 uploads per hour
});

// Apply
app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/otp', otpLimiter);
app.use('/api/search', searchLimiter);
app.use('/api/upload', uploadLimiter);
```

### 4.2 Security Headers

```javascript
// ============================================================
// SECURITY HEADERS — Using Helmet.js
// ============================================================
const helmet = require('helmet');

app.use(helmet({
    // Content Security Policy — Block XSS, injection
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'nonce-{RANDOM}'"],  // Nonce-based
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://api.panditconnect.com"],
            frameSrc: ["'none'"],           // No iframes
            objectSrc: ["'none'"],          // No Flash/plugins
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],     // Force HTTPS
        },
    },

    // Prevent MIME sniffing
    noSniff: true,

    // XSS Filter
    xssFilter: true,

    // Prevent clickjacking
    frameguard: { action: 'deny' },

    // Hide X-Powered-By
    hidePoweredBy: true,

    // HSTS — Force HTTPS for 1 year
    strictTransportSecurity: {
        maxAge: 31536000,       // 1 year
        includeSubDomains: true,
        preload: true,
    },

    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // Permissions Policy
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

// Additional custom headers
app.use((req, res, next) => {
    // Prevent caching of sensitive responses
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/user')) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }

    // Permissions Policy
    res.set('Permissions-Policy',
        'camera=(), microphone=(), geolocation=(self), payment=(self)'
    );

    next();
});
```

### 4.3 CORS Configuration

```javascript
// ============================================================
// CORS — Strict origin control
// ============================================================
const cors = require('cors');

const ALLOWED_ORIGINS = [
    'https://panditconnect.com',
    'https://www.panditconnect.com',
    'https://admin.panditconnect.com',
    // Development (remove in production)
    ...(process.env.NODE_ENV === 'development'
        ? ['http://localhost:3000', 'http://localhost:5173']
        : []),
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman in dev)
        if (!origin && process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }

        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            logSecurityEvent('CORS_VIOLATION', { origin });
            callback(new Error('CORS policy violation'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,      // Allow cookies
    maxAge: 86400,           // Cache preflight for 24h
    exposedHeaders: ['X-RateLimit-Remaining'],
}));
```

### 4.4 CSRF Protection

```javascript
// ============================================================
// CSRF PROTECTION — Double Submit Cookie pattern
// ============================================================
const csrf = require('csurf');

// For server-rendered forms
const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    },
});

// For SPA/API — Custom CSRF token validation
function csrfMiddleware(req, res, next) {
    // Skip for GET, HEAD, OPTIONS (safe methods)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

    const csrfToken = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies['csrf-token'];

    if (!csrfToken || !csrfCookie || csrfToken !== csrfCookie) {
        logSecurityEvent('CSRF_ATTEMPT', {
            ip: req.ip,
            path: req.path,
            method: req.method,
        });
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}
```

---

## Layer 5: Data Encryption

### 5.1 Encryption at Rest

```javascript
// ============================================================
// FIELD-LEVEL ENCRYPTION — Sensitive data in database
// ============================================================
const crypto = require('crypto');

const ENCRYPTION_CONFIG = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,          // 256 bits
    ivLength: 16,           // 128 bits
    tagLength: 16,          // 128 bits auth tag
    key: Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),  // 256-bit key
};

// Encrypt sensitive data before storing in DB
function encrypt(plainText) {
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
    const cipher = crypto.createCipheriv(
        ENCRYPTION_CONFIG.algorithm,
        ENCRYPTION_CONFIG.key,
        iv
    );

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return IV:AuthTag:EncryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// Decrypt data when reading from DB
function decrypt(encryptedData) {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(
        ENCRYPTION_CONFIG.algorithm,
        ENCRYPTION_CONFIG.key,
        iv
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

// ============================================================
// WHAT TO ENCRYPT in database:
// ============================================================
// - Aadhaar/PAN numbers (id_proof_number_hash)
// - TOTP secrets
// - Payment gateway tokens
// - API keys stored in DB
// - User personal phone (in certain contexts)
//
// Don't encrypt: emails (need for lookup), names, public data
```

### 5.2 Encryption in Transit

```nginx
# ============================================================
# NGINX — TLS 1.3 Configuration
# ============================================================
server {
    listen 443 ssl http2;
    server_name panditconnect.com www.panditconnect.com;

    # SSL Certificates (Let's Encrypt / Cloudflare)
    ssl_certificate     /etc/letsencrypt/live/panditconnect.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panditconnect.com/privkey.pem;

    # TLS Configuration
    ssl_protocols TLSv1.2 TLSv1.3;  # Only TLS 1.2+
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;

    # Session settings
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Force HTTPS redirect
    if ($scheme = http) {
        return 301 https://$server_name$request_uri;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name panditconnect.com www.panditconnect.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Layer 6: File Upload Security

```javascript
// ============================================================
// SECURE FILE UPLOADS
// ============================================================
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const fileType = require('file-type');

const UPLOAD_CONFIG = {
    maxFileSize: 10 * 1024 * 1024,  // 10MB max
    maxFiles: 10,

    allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedVideoTypes: ['video/mp4', 'video/webm'],
    allowedDocTypes: ['application/pdf'],

    // BLOCKED extensions (double check)
    blockedExtensions: [
        '.exe', '.bat', '.cmd', '.sh', '.php', '.py', '.rb', '.js',
        '.jsp', '.asp', '.aspx', '.cgi', '.pl', '.com', '.scr',
        '.ps1', '.vbs', '.wsf', '.msi', '.dll', '.sys', '.svg',
        '.html', '.htm', '.xml', '.xhtml',
    ],

    uploadDir: '/secure-uploads/',  // Outside web root!
};

// ============================================================
// MULTER CONFIG with security checks
// ============================================================
const upload = multer({
    storage: multer.memoryStorage(), // Process in memory first

    limits: {
        fileSize: UPLOAD_CONFIG.maxFileSize,
        files: UPLOAD_CONFIG.maxFiles,
        fields: 10,
        fieldSize: 1024 * 1024, // 1MB field size
    },

    fileFilter: (req, file, cb) => {
        // 1. Check extension
        const ext = path.extname(file.originalname).toLowerCase();
        if (UPLOAD_CONFIG.blockedExtensions.includes(ext)) {
            return cb(new Error(`File type ${ext} is not allowed`), false);
        }

        // 2. Check MIME type (from header — can be spoofed)
        const allowedTypes = [
            ...UPLOAD_CONFIG.allowedImageTypes,
            ...UPLOAD_CONFIG.allowedVideoTypes,
            ...UPLOAD_CONFIG.allowedDocTypes,
        ];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error(`MIME type ${file.mimetype} is not allowed`), false);
        }

        cb(null, true);
    },
});

// ============================================================
// DEEP FILE VALIDATION (after upload, before saving)
// ============================================================
async function validateAndProcessUpload(buffer, originalName) {
    // 1. Verify actual file type by reading magic bytes (NOT extension)
    const type = await fileType.fromBuffer(buffer);
    if (!type) throw new SecurityError('Cannot determine file type');

    const allowedMimes = [
        ...UPLOAD_CONFIG.allowedImageTypes,
        ...UPLOAD_CONFIG.allowedVideoTypes,
        ...UPLOAD_CONFIG.allowedDocTypes,
    ];
    if (!allowedMimes.includes(type.mime)) {
        throw new SecurityError(`File type ${type.mime} not allowed (magic bytes check)`);
    }

    // 2. For images: Re-encode to strip EXIF data & embedded malware
    if (UPLOAD_CONFIG.allowedImageTypes.includes(type.mime)) {
        const cleanImage = await sharp(buffer)
            .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
            .removeAlpha()
            .jpeg({ quality: 85 })  // Re-encode strips any hidden data
            .toBuffer();

        // 3. Generate safe filename (UUID, no user input)
        const safeFilename = `${uuidv4()}.jpg`;

        return { buffer: cleanImage, filename: safeFilename, mime: 'image/jpeg' };
    }

    // 4. For PDFs: Scan for JavaScript/embedded objects
    if (type.mime === 'application/pdf') {
        const pdfContent = buffer.toString('latin1');
        const dangerousPatterns = ['/JavaScript', '/JS', '/Launch', '/OpenAction', '/AA'];

        for (const pattern of dangerousPatterns) {
            if (pdfContent.includes(pattern)) {
                throw new SecurityError('PDF contains potentially dangerous content');
            }
        }

        const safeFilename = `${uuidv4()}.pdf`;
        return { buffer, filename: safeFilename, mime: 'application/pdf' };
    }

    throw new SecurityError('Unsupported file type');
}

// ============================================================
// VIRUS SCANNING (ClamAV integration)
// ============================================================
const NodeClam = require('clamscan');

async function scanForVirus(buffer) {
    const clam = await new NodeClam().init({
        clamdscan: { socket: '/var/run/clamav/clamd.ctl' },
    });

    const { isInfected, viruses } = await clam.scanStream(
        require('stream').Readable.from(buffer)
    );

    if (isInfected) {
        logSecurityEvent('MALWARE_DETECTED', { viruses });
        throw new SecurityError('File contains malware');
    }
}
```

---

## Layer 7: Cookie & Session Security

```javascript
// ============================================================
// SECURE COOKIE CONFIGURATION
// ============================================================
function setSecureCookie(res, name, value, options = {}) {
    res.cookie(name, value, {
        httpOnly: true,          // Cannot be accessed by JavaScript
        secure: true,            // HTTPS only
        sameSite: 'strict',      // Prevent CSRF
        maxAge: options.maxAge || 7 * 24 * 60 * 60 * 1000, // 7 days
        path: options.path || '/',
        domain: '.panditconnect.com',
        signed: true,            // Tamper detection
        ...options,
    });
}

// Cookie signing secret
app.use(require('cookie-parser')(process.env.COOKIE_SECRET));

// ============================================================
// SESSION CONFIGURATION (if using server-side sessions)
// ============================================================
const session = require('express-session');
const RedisStore = require('connect-redis').default;

app.use(session({
    store: new RedisStore({ client: redis }),

    secret: process.env.SESSION_SECRET,
    name: '__pc_sid',              // Custom name (not default 'connect.sid')

    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,  // 24 hours
        domain: '.panditconnect.com',
    },

    // Regenerate session ID on login (prevent session fixation)
    genid: () => crypto.randomUUID(),

    rolling: true,  // Reset expiry on each request
}));

// ============================================================
// SESSION FIXATION PROTECTION
// ============================================================
async function loginUser(req, user) {
    // 1. Destroy old session
    req.session.destroy();

    // 2. Regenerate new session ID
    req.session.regenerate((err) => {
        if (err) throw err;

        // 3. Set user data in new session
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.loginAt = Date.now();
        req.session.ip = req.ip;
        req.session.userAgent = req.get('User-Agent');
    });
}
```

---

## Layer 8: Payment Security (PCI DSS Compliance)

```javascript
// ============================================================
// PAYMENT SECURITY — Razorpay Integration
// ============================================================

// RULE #1: NEVER handle raw card data on our servers
// Use Razorpay Checkout (client-side tokenization)

const Razorpay = require('razorpay');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Create order (server-side)
async function createPaymentOrder(panditId, planId, amount) {
    const order = await razorpay.orders.create({
        amount: amount * 100,   // Razorpay uses paise
        currency: 'INR',
        receipt: `pc_${crypto.randomUUID()}`,
        notes: {
            pandit_id: panditId,
            plan_id: planId,
        },
    });

    // Store order in DB
    await db.query(`
        INSERT INTO payment_transactions
        (pandit_id, plan_id, amount, currency, gateway, gateway_order_id, status)
        VALUES ($1, $2, $3, 'INR', 'razorpay', $4, 'pending')
    `, [panditId, planId, amount, order.id]);

    return order;
}

// ============================================================
// WEBHOOK SIGNATURE VERIFICATION — Prevent fake payment confirmations
// ============================================================
function verifyRazorpayWebhook(req) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    // Timing-safe comparison (prevent timing attacks)
    if (!crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    )) {
        logSecurityEvent('FAKE_PAYMENT_WEBHOOK', {
            ip: req.ip,
            signature,
        });
        throw new SecurityError('Invalid webhook signature');
    }

    return true;
}

// ============================================================
// PAYMENT VERIFICATION — Server-side double check
// ============================================================
async function verifyPayment(orderId, paymentId, signature) {
    // 1. Verify signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

    if (!crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    )) {
        throw new SecurityError('Payment signature verification failed');
    }

    // 2. Fetch payment from Razorpay API (double verify)
    const payment = await razorpay.payments.fetch(paymentId);

    if (payment.status !== 'captured') {
        throw new SecurityError('Payment not captured');
    }

    // 3. Verify amount matches our order
    const order = await getOrderByGatewayId(orderId);
    if (payment.amount !== order.amount * 100) {
        logSecurityEvent('PAYMENT_AMOUNT_MISMATCH', {
            expected: order.amount,
            received: payment.amount / 100,
        });
        throw new SecurityError('Payment amount mismatch');
    }

    return true;
}
```

---

## Layer 9: Security Monitoring & Logging

```javascript
// ============================================================
// SECURITY EVENT LOGGING — Track ALL suspicious activity
// ============================================================
const winston = require('winston');

const securityLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'panditconnect-security' },
    transports: [
        // Security events log file
        new winston.transports.File({
            filename: 'logs/security.log',
            maxsize: 50 * 1024 * 1024,  // 50MB
            maxFiles: 30,               // 30 days retention
        }),
        // Critical alerts — separate file
        new winston.transports.File({
            filename: 'logs/security-critical.log',
            level: 'error',
        }),
    ],
});

// ============================================================
// EVENTS TO TRACK
// ============================================================
const SECURITY_EVENTS = {
    // Authentication
    LOGIN_SUCCESS:          'info',
    LOGIN_FAILED:           'warn',
    LOGIN_LOCKED:           'warn',
    BRUTE_FORCE_DETECTED:   'error',
    PASSWORD_CHANGED:       'info',
    PASSWORD_RESET:         'info',
    MFA_ENABLED:            'info',
    MFA_FAILED:             'warn',
    SESSION_HIJACK_SUSPECT: 'error',
    TOKEN_REUSE_DETECTED:   'error',

    // Authorization
    UNAUTHORIZED_ACCESS:    'warn',
    PRIVILEGE_ESCALATION:   'error',
    OWNERSHIP_VIOLATION:    'warn',

    // Input/Injection
    SQL_INJECTION_ATTEMPT:  'error',
    XSS_ATTEMPT:            'error',
    CSRF_ATTEMPT:           'error',

    // File
    MALWARE_DETECTED:       'error',
    BLOCKED_FILE_UPLOAD:    'warn',

    // Payment
    FAKE_PAYMENT_WEBHOOK:   'error',
    PAYMENT_AMOUNT_MISMATCH:'error',

    // Rate Limiting
    RATE_LIMIT_EXCEEDED:    'warn',
    DDOS_SUSPECTED:         'error',

    // Data
    SENSITIVE_DATA_ACCESS:  'info',
    BULK_DATA_EXPORT:       'warn',
    DATA_DELETION:          'info',

    // CORS
    CORS_VIOLATION:         'warn',
};

async function logSecurityEvent(eventType, details = {}) {
    const level = SECURITY_EVENTS[eventType] || 'info';

    securityLogger.log(level, {
        event: eventType,
        ...details,
        timestamp: new Date().toISOString(),
    });

    // Critical events — send real-time alert
    if (level === 'error') {
        await sendSecurityAlert(eventType, details);
    }
}

// ============================================================
// REAL-TIME ALERTS — For critical security events
// ============================================================
async function sendSecurityAlert(eventType, details) {
    // 1. Email to security team
    await sendEmail({
        to: process.env.SECURITY_ALERT_EMAIL,
        subject: `SECURITY ALERT: ${eventType}`,
        body: `Event: ${eventType}\nDetails: ${JSON.stringify(details, null, 2)}\nTime: ${new Date().toISOString()}`,
    });

    // 2. Slack/Discord webhook
    await fetch(process.env.SECURITY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            text: `**SECURITY ALERT**: ${eventType}\n\`\`\`${JSON.stringify(details, null, 2)}\`\`\``,
        }),
    });

    // 3. Store in DB for audit trail
    await db.query(`
        INSERT INTO security_audit_log (event_type, severity, details, created_at)
        VALUES ($1, $2, $3, NOW())
    `, [eventType, 'critical', JSON.stringify(details)]);
}
```

### Security Audit Log Table

```sql
-- ============================================================
-- SECURITY AUDIT LOG — Immutable audit trail
-- ============================================================
CREATE TABLE security_audit_log (
    id              BIGSERIAL PRIMARY KEY,  -- Sequential for ordering

    event_type      VARCHAR(100) NOT NULL,
    severity        VARCHAR(20) NOT NULL,   -- info, warn, error, critical

    user_id         UUID,
    ip_address      INET,
    user_agent      TEXT,
    request_path    VARCHAR(500),
    request_method  VARCHAR(10),

    details         JSONB NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

    -- NO updated_at, NO deleted_at — Immutable!
);

-- Partition by month for performance
CREATE INDEX idx_audit_event ON security_audit_log(event_type);
CREATE INDEX idx_audit_severity ON security_audit_log(severity);
CREATE INDEX idx_audit_user ON security_audit_log(user_id);
CREATE INDEX idx_audit_ip ON security_audit_log(ip_address);
CREATE INDEX idx_audit_created ON security_audit_log(created_at DESC);

-- Prevent deletion/modification (even by admins)
REVOKE DELETE, UPDATE ON security_audit_log FROM PUBLIC;
REVOKE DELETE, UPDATE ON security_audit_log FROM app_user;
-- Only super_admin can read, nobody can modify
```

---

## Layer 10: Infrastructure Security

### 10.1 DDoS Protection (Cloudflare)

```
+----------------------------------------------------------------+
|                     CLOUDFLARE (CDN + WAF)                     |
|                                                                |
|  - DDoS Protection (L3/L4/L7)                                  |
|  - Bot Management — Block scrapers, bots                       |
|  - WAF Rules — OWASP Core Rule Set                             |
|  - Rate Limiting at edge                                       |
|  - IP Reputation Database                                      |
|  - Geo-blocking (block suspicious countries)                   |
|  - SSL/TLS termination                                         |
|  - Page caching (reduce server load)                           |
|  - Under Attack Mode (5-second challenge)                      |
|  - Challenge page for suspicious IPs                           |
|                                                                |
|  Cloudflare -> Origin Server (IP hidden)                        |
+----------------------------------------------------------------+
```

### 10.2 Server Hardening

```bash
# ============================================================
# LINUX SERVER HARDENING CHECKLIST
# ============================================================

# 1. Firewall (UFW)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH (change to custom port)
sudo ufw allow 80/tcp    # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# 2. Change SSH port & disable root login
# /etc/ssh/sshd_config
Port 2222                    # Custom port (not 22)
PermitRootLogin no           # No root SSH
PasswordAuthentication no    # Key-based only
MaxAuthTries 3               # Lock after 3 failures
AllowUsers deploy            # Only specific user

# 3. Fail2Ban — Auto-ban brute force IPs
sudo apt install fail2ban
# /etc/fail2ban/jail.local
# [sshd]
# maxretry = 3
# bantime = 3600
# findtime = 600

# 4. Auto security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 5. Remove unnecessary services
sudo systemctl disable bluetooth
sudo systemctl disable cups
sudo systemctl disable avahi-daemon

# 6. File permissions
chmod 600 /etc/ssh/sshd_config
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# 7. Kernel hardening (/etc/sysctl.conf)
net.ipv4.tcp_syncookies = 1              # SYN flood protection
net.ipv4.conf.all.rp_filter = 1          # IP spoofing protection
net.ipv4.conf.all.accept_redirects = 0   # Disable ICMP redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1 # Smurf attack protection
kernel.randomize_va_space = 2            # ASLR
```

### 10.3 Database Security

```sql
-- ============================================================
-- POSTGRESQL SECURITY HARDENING
-- ============================================================

-- 1. Create separate roles (Principle of Least Privilege)
CREATE ROLE app_readonly;
CREATE ROLE app_readwrite;
CREATE ROLE app_admin;

-- Read-only for public-facing queries
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;

-- Read-write for application operations
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_readwrite;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_readwrite;

-- No DELETE permission for app (use soft deletes)
-- REVOKE DELETE on all tables from app_readwrite

-- Admin for migrations only
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_admin;

-- 2. Application connects as app_readwrite (NOT postgres superuser!)
-- Connection string: postgresql://app_readwrite:password@host:5432/panditconnect

-- 3. Enable SSL for database connections
-- postgresql.conf:
-- ssl = on
-- ssl_cert_file = '/path/to/server.crt'
-- ssl_key_file = '/path/to/server.key'

-- 4. Restrict connections by IP (pg_hba.conf)
-- Only allow connections from application servers
-- hostssl panditconnect app_readwrite 10.0.1.0/24 scram-sha-256

-- 5. Enable query logging for audit
-- postgresql.conf:
-- log_statement = 'mod'        -- Log INSERT/UPDATE/DELETE
-- log_min_duration_statement = 1000  -- Log slow queries (>1s)

-- 6. Prevent mass data extraction
CREATE OR REPLACE FUNCTION limit_result_set()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'SELECT' AND current_setting('app.is_admin', true) != 'true') THEN
        -- Non-admins limited to 1000 rows per query
        PERFORM set_config('statement_timeout', '5000', false); -- 5 sec timeout
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Layer 11: Environment & Secrets Management

```javascript
// ============================================================
// ENVIRONMENT VARIABLES — NEVER hardcode secrets
// ============================================================

// .env file (NEVER commit to Git!)
// WRONG:
// const API_KEY = 'sk_live_abc123';

// CORRECT:
// const API_KEY = process.env.RAZORPAY_KEY_SECRET;

// ============================================================
// REQUIRED ENVIRONMENT VARIABLES
// ============================================================
const REQUIRED_ENV_VARS = [
    'NODE_ENV',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'ENCRYPTION_KEY',
    'COOKIE_SECRET',
    'SESSION_SECRET',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'CLOUDINARY_URL',
    'OTP_SECRET',
    'SECURITY_ALERT_EMAIL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
];

// Validate all secrets exist at startup
function validateEnvironment() {
    const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);

    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing);
        process.exit(1);  // CRASH — Don't start without secrets
    }

    // Validate secret strength
    if (process.env.JWT_ACCESS_SECRET.length < 32) {
        console.error('JWT_ACCESS_SECRET too short (min 32 chars)');
        process.exit(1);
    }

    if (process.env.ENCRYPTION_KEY.length !== 64) { // 32 bytes = 64 hex chars
        console.error('ENCRYPTION_KEY must be 256 bits (64 hex chars)');
        process.exit(1);
    }
}

// .gitignore — MUST include:
// .env
// .env.local
// .env.production
// *.pem
// *.key
// logs/
// uploads/
```

---

## Layer 12: OWASP Top 10 Coverage

| # | OWASP Threat | Our Protection | Status |
|---|-------------|----------------|--------|
| 1 | **Broken Access Control** | RBAC, RLS, ownership checks, JWT validation | Covered |
| 2 | **Cryptographic Failures** | AES-256-GCM encryption, bcrypt hashing, TLS 1.3 | Covered |
| 3 | **Injection** | Parameterized queries, input validation, Joi schemas | Covered |
| 4 | **Insecure Design** | Security by design, threat modeling, least privilege | Covered |
| 5 | **Security Misconfiguration** | Helmet.js, security headers, hardened configs | Covered |
| 6 | **Vulnerable Components** | npm audit, Snyk scanning, dependency updates | Covered |
| 7 | **Auth Failures** | MFA, token rotation, brute force protection, session fixation | Covered |
| 8 | **Data Integrity Failures** | Webhook signature verification, code signing | Covered |
| 9 | **Security Logging** | Comprehensive audit logs, real-time alerts | Covered |
| 10 | **SSRF** | URL validation, allowlisting, no user-controlled URLs | Covered |

---

## Layer 13: Backup & Disaster Recovery

```bash
# ============================================================
# AUTOMATED BACKUP STRATEGY
# ============================================================

# 1. Database Backups
# - Full backup: Daily at 2 AM IST
# - Incremental: Every 6 hours
# - Transaction logs: Continuous (WAL archiving)

# Daily full backup (encrypted)
0 2 * * * pg_dump panditconnect | \
    gzip | \
    openssl enc -aes-256-cbc -salt -pass env:BACKUP_PASSWORD | \
    aws s3 cp - s3://panditconnect-backups/db/full/$(date +\%Y\%m\%d).sql.gz.enc

# 2. Backup Retention Policy
# - Daily backups: Keep 30 days
# - Weekly backups: Keep 12 weeks
# - Monthly backups: Keep 12 months
# - Yearly backups: Keep forever

# 3. Backup Testing
# - Restore test: Weekly (automated)
# - Full DR drill: Monthly

# 4. Multi-Region Backup
# - Primary: Mumbai (ap-south-1)
# - Secondary: Singapore (ap-southeast-1)
# - Tertiary: Local encrypted external drive

# 5. Recovery Time Objectives
# - RTO (Recovery Time): < 1 hour
# - RPO (Recovery Point): < 6 hours (max data loss)
```

---

## Layer 14: Client-Side Security

```javascript
// ============================================================
// FRONTEND SECURITY BEST PRACTICES
// ============================================================

// 1. Never store tokens in localStorage (XSS vulnerable)
// WRONG: localStorage.setItem('token', jwt);
// CORRECT: Store in httpOnly cookie (set by server)

// 2. Access token in memory only
class AuthManager {
    #accessToken = null;  // Private — not accessible from console

    setToken(token) { this.#accessToken = token; }
    getToken() { return this.#accessToken; }
    clearToken() { this.#accessToken = null; }
}

// 3. Auto-logout on suspicious activity
function detectSessionAnomaly() {
    // Detect if multiple tabs have different sessions
    window.addEventListener('storage', (e) => {
        if (e.key === 'logout-event') {
            // Another tab logged out — logout here too
            authManager.clearToken();
            window.location.href = '/login';
        }
    });
}

// 4. Sanitize all rendered user content
function renderUserContent(content) {
    const div = document.createElement('div');
    div.textContent = content;  // textContent auto-escapes HTML
    return div.innerHTML;
}

// 5. Disable browser developer tools detection (optional)
// 6. Integrity checking for static assets (SRI)
// <script src="app.js"
//   integrity="sha384-HASH"
//   crossorigin="anonymous"></script>
```

---

## Layer 15: Legal & Privacy Compliance

### Indian IT Act 2000 + DPDP Act 2023

```
+----------------------------------------------------------------+
|              COMPLIANCE CHECKLIST                               |
+----------------------------------------------------------------+
|                                                                |
|  - Privacy Policy page (mandatory)                             |
|  - Terms of Service page                                       |
|  - Cookie consent banner                                       |
|  - User consent before data collection                         |
|  - Right to data deletion (account deletion)                   |
|  - Right to data export (download my data)                     |
|  - Data breach notification (72 hours)                         |
|  - Data Processing Agreement for third parties                 |
|  - Reasonable security practices (IT Act Sec 43A)               |
|  - Appointed Grievance Officer (IT Rules 2021)                  |
|  - Data stored in India (data localization)                    |
|  - Aadhaar data encrypted (Aadhaar Act)                        |
|  - Minor protection (no data collection <18 without            |
|     parental consent — DPDP Act)                                |
|  - Purpose limitation (collect only what's needed)              |
|                                                                |
+----------------------------------------------------------------+
```

```javascript
// ============================================================
// DATA EXPORT — User's right to download their data
// ============================================================
async function exportUserData(userId) {
    const userData = {
        profile: await getUserProfile(userId),
        reviews: await getUserReviews(userId),
        inquiries: await getUserInquiries(userId),
        savedPandits: await getSavedPandits(userId),
        savedTemples: await getSavedTemples(userId),
        // Exclude: passwords, internal IDs, audit logs
    };

    // Generate ZIP file
    return generateDataExportZip(userData);
}

// ============================================================
// ACCOUNT DELETION — Right to be forgotten
// ============================================================
async function deleteUserAccount(userId) {
    // 1. Soft delete user
    await db.query(`UPDATE users SET deleted_at = NOW(),
        email = 'deleted_' || id,
        phone = NULL,
        full_name = 'Deleted User'
        WHERE id = $1`, [userId]);

    // 2. Anonymize reviews (keep content, remove identity)
    await db.query(`UPDATE reviews SET user_id = NULL
        WHERE user_id = $1`, [userId]);

    // 3. Delete personal data
    await db.query(`DELETE FROM saved_pandits WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM saved_temples WHERE user_id = $1`, [userId]);
    await db.query(`DELETE FROM notifications WHERE user_id = $1`, [userId]);

    // 4. Revoke all sessions
    await revokeAllUserTokens(userId);

    // 5. Schedule permanent deletion after 30 days (grace period)
    await scheduleJob('permanent_delete_user', { userId }, '30 days');

    // 6. Log for compliance
    await logSecurityEvent('DATA_DELETION', { userId });
}
```

---

## Layer 16: Security Testing Strategy

| Test Type | Tool | Frequency | Coverage |
|-----------|------|-----------|----------|
| **Dependency Scan** | `npm audit` + Snyk | Every commit (CI/CD) | Known CVEs in packages |
| **SAST** | SonarQube / CodeQL | Every PR | Code vulnerabilities |
| **DAST** | OWASP ZAP | Weekly | Runtime vulnerabilities |
| **Penetration Test** | Manual + BurpSuite | Quarterly | Deep testing |
| **API Security** | Postman Security Tests | Every release | API-specific attacks |
| **Load Testing** | k6 / Artillery | Monthly | DDoS resilience |
| **Secret Scanning** | GitLeaks / TruffleHog | Every commit | Leaked credentials |
| **Container Scan** | Trivy | Every build | Docker image CVEs |
| **SSL Test** | SSL Labs | Monthly | TLS configuration |
| **Header Test** | SecurityHeaders.com | Monthly | HTTP security headers |

```bash
# CI/CD Security Pipeline
# Run on every commit:
npm audit --audit-level=high
npx snyk test
npx eslint --config security-rules .
npx gitleaks detect

# Run on every PR:
sonar-scanner
npx owasp-zap-scan --target https://staging.panditconnect.com
```

---

## Complete Security Checklist

### Authentication
- [x] Password hashing (bcrypt, 12 rounds)
- [x] Strong password policy enforced
- [x] JWT with short expiry (15 min access, 7d refresh)
- [x] Token rotation on refresh
- [x] Token revocation (blacklist in Redis)
- [x] Multi-Factor Authentication (OTP + TOTP)
- [x] OAuth 2.0 with state parameter
- [x] Brute force protection (progressive delay + lockout)
- [x] Session fixation prevention

### Authorization
- [x] Role-Based Access Control (5 roles)
- [x] Row-Level Security (PostgreSQL)
- [x] Resource ownership verification
- [x] Principle of Least Privilege

### Data Protection
- [x] AES-256-GCM encryption at rest
- [x] TLS 1.3 encryption in transit
- [x] No sensitive data in URLs/logs
- [x] Secure cookie configuration
- [x] EXIF data stripping from uploads

### Input Security
- [x] Parameterized SQL queries (no string concat)
- [x] Joi/Zod input validation schemas
- [x] HTML sanitization (DOMPurify)
- [x] File type validation (magic bytes)
- [x] File size limits

### API Security
- [x] Multi-tier rate limiting
- [x] CORS strict configuration
- [x] CSRF protection
- [x] Security headers (Helmet.js)
- [x] Content Security Policy

### Infrastructure
- [x] Cloudflare DDoS protection
- [x] WAF rules (OWASP CRS)
- [x] Server hardening (SSH, firewall, Fail2Ban)
- [x] Database role separation
- [x] Environment variable management

### Monitoring
- [x] Security event logging
- [x] Real-time alerts (email + Slack)
- [x] Immutable audit trail
- [x] Anomaly detection

### Compliance
- [x] Indian IT Act 2000 compliance
- [x] DPDP Act 2023 compliance
- [x] Data export (right to access)
- [x] Account deletion (right to forget)
- [x] Privacy policy & cookie consent

### Recovery
- [x] Encrypted daily backups
- [x] Multi-region backup storage
- [x] Tested disaster recovery plan
- [x] < 1 hour recovery time

---

> [!IMPORTANT]
> This 16-layer checklist was submitted for review and implementation. See `docs/SECURITY.md` for
> what actually shipped, what was consciously left out because it doesn't match this project's real
> infrastructure or already-built auth design, and why.
