# PanditSuggest — S3 + CloudFront Production Migration Plan

## 0. Implementation status (as of 2026-08-20)

The plan below is the original design doc. Everything in this section has
since been implemented in the codebase; see the code for authoritative
detail — this is a map of where, not a duplicate of the plan.

**AWS infrastructure is live** (confirmed manually by the operator, not from
this codebase): bucket `panditsuggest-media-prod` (`ap-south-1`), CloudFront
at `https://media.panditsuggest.com` via OAC, direct S3 access blocked, ACM
SSL working, EC2 IAM role attached. The app code already reads exactly the
three production env vars this needs
(`AWS_REGION=ap-south-1`, `AWS_S3_MEDIA_BUCKET=panditsuggest-media-prod`,
`MEDIA_CDN_BASE_URL=https://media.panditsuggest.com`) with no code change
required to point at it — see `mediaStorage.js`'s `s3Client()`, which never
takes explicit credentials, so the EC2 role is picked up automatically by
the SDK's default credential chain. Run `npm run media:verify-iam` **on the
EC2 instance itself** (not from a dev machine — there is nothing to verify
without the real role) to confirm the role can actually
PutObject/HeadObject/GetObject/DeleteObject on the bucket; it writes and
immediately deletes one throwaway object under `_healthcheck/` and never
touches real media.

**S3 CORS** (plan §12) — only needed once the admin UI is wired to the
presigned-upload endpoints (still backend-only, see below). Required policy
when that happens:
```json
[
  {
    "AllowedOrigins": ["https://panditsuggest.com", "https://www.panditsuggest.com", "https://admin.panditsuggest.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 300
  }
]
```
No wildcard origin, no methods beyond `PUT` (this is an upload URL, not a
general API), narrow `AllowedHeaders` since the presigned URL only ever sets
`Content-Type`. Verify with `curl -X OPTIONS -H "Origin: https://panditsuggest.com" -H "Access-Control-Request-Method: PUT" <presigned-url>` once configured.

**Done, in code, working today (S3 or local-disk, auto-selected by env):**
- `backend/src/services/media/mediaStorage.js` — the storage backend. S3 when
  `AWS_S3_MEDIA_BUCKET` + `MEDIA_CDN_BASE_URL` are set, local disk otherwise
  (zero-config default, so local dev is unaffected). One place decides which.
- `backend/src/middleware/mediaUpload.js` (pandits/temples/services/home hero)
  and `middleware/upload.js` (reviews) — all proxy-upload paths route through
  the storage backend. `diskStorage` is gone; multer buffers in memory.
- `backend/src/services/media/imageOptimizer.js` — every uploaded image
  (never video) is re-encoded to WebP, capped at 1600px, before storage.
  Falls back to the original bytes on any failure — optimization is a bonus,
  never a reason an upload fails.
- `backend/src/db/26-media-storage-keys.sql` — additive `media_key` /
  `image_key` columns on `pandit_media`, `temple_media`, `services`,
  `service_categories`, `home_hero_images`. `media_url`/`image_url` remain
  the single resolved, browser-ready source of truth every existing query
  already reads — nothing about how they're read changed. The key columns
  are populated going forward and used by the migration/cleanup scripts.
- `backend/src/services/media/mediaService.js` + `POST .../media/presign` and
  `.../media/confirm` (pandits and temples) — the direct-to-S3 presigned
  upload flow for large videos, bypassing this server's bandwidth. 501s
  until S3 is configured; the existing multipart endpoints keep working
  either way. Not yet wired into the admin frontend UI (still uses the
  multipart endpoints) — see "Deliberately not done" below.
- `backend/src/middleware/originVerify.js` (`ORIGIN_SHARED_SECRET` env var) —
  defense-in-depth check that a request actually came through CloudFront,
  on top of (not instead of) locking the origin's security group to
  CloudFront's IP range. No-op until configured.
- `backend/scripts/migrate-media-to-s3.js` — historical migration, dry-run by
  default, idempotent/resumable (`--execute`, `--table=`, `--limit=`, `--id=`).
- `backend/scripts/cleanup-legacy-media.js` — separate, explicit local-file
  cleanup for already-confirmed-migrated rows only. Never run automatically.
- `backend/scripts/verify-s3-access.js` (`npm run media:verify-iam`) — runtime
  IAM check, meant to be run on the real EC2 instance after this section's
  three env vars are set there.
- Verified, NOT modified: `backend/src/services/distribution/engine.js`
  already implements market → eligibility → bucket → fairness → rotation in
  that exact order, and `services/distribution/market.js` already maps
  CloudFront-Viewer-Country → INDIA/INTERNATIONAL/UNKNOWN. Both predate this
  work and needed no change — see engine.js's own header comment.
- Tests: `backend/tests/media-storage.test.js`, `media-service.test.js`,
  `origin-verify.test.js`, `image-optimizer.test.js` (`npm run test:media`).

**Deliberately not done, and why:**
- Multi-variant responsive images (320/640/1280 srcset). One optimized WebP
  per upload was chosen instead — see imageOptimizer.js's own comment for
  the reasoning (three objects per upload touches the schema, every repo,
  and every `<img>` call site for a further optimization on top of what
  matters most: getting off multi-megabyte originals).
- Frontend "centralized media URL helper" (plan §28/§31): not added, because
  there is nothing for it to do — the backend already returns a fully
  resolved, browser-ready URL in `media_url`/`image_url`, and no frontend
  code manually composes one (verified by search). Adding a wrapper that
  just returns its input would be a no-op.
- Entity-ID-nested S3 keys (`pandits/{id}/profile/...` per the original
  plan's §5). Keys stay flat by content-type folder
  (`pandits/<uuid>.webp`) — equally secure (unguessable random names), and
  nesting by ID would have required moving multer's upload step to run
  after pandit/temple slug→ID resolution, touching route/middleware
  ordering for an organizational win only.
- Actual AWS resource creation (bucket, CloudFront distribution, OAC, ACM,
  DNS, WAF/security-group lock, IAM role) — no AWS account access from this
  environment. See §38-39 below for the exact manual steps.
- Wiring the presigned-upload endpoints into the admin frontend UI — the
  backend capability is real and tested, but a presigned-URL flow is the
  kind of thing that silently breaks against real infrastructure (CORS,
  clock skew) in ways a local review can't catch; better done once there's
  a real bucket to test against.

## 1. Migration ka main objective

PanditSuggest me abhi Pandit Ji ke:

* profile images
* profile videos
* temple images
* temple videos
* service images
* puja/havan media
* thumbnails
* gallery images/videos

EC2 server/local filesystem se serve ho rahe hain.

Target architecture:

```text
CURRENT

User
 ↓
PanditSuggest
 ↓
EC2
 ├── Backend API
 ├── Database communication
 ├── Images
 └── Videos

Problem:
EC2 = API + application + media delivery
```

Isko change karke:

```text
TARGET

                    ┌── CloudFront ── S3 Media
User ── CloudFront ─┤
                    └── EC2/API ── PostgreSQL
```

Meaning:

```text
Images/Videos
      ↓
Amazon S3
      ↓
CloudFront CDN
      ↓
Nearest edge location
      ↓
User
```

Aur:

```text
Dynamic Requests
       ↓
CloudFront
       ↓
PanditSuggest API / EC2
       ↓
PostgreSQL
```

Isse EC2 ka kaam primarily application/backend processing hoga.

EC2 ko images/videos transfer karne ki responsibility nahi rahegi.

---

# 2. PanditSuggest ke liye recommended AWS architecture

```text
                        Internet User
                     India / US / UK / etc.
                              │
                              ▼
                         Route 53 / DNS
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
      media.panditsuggest.com          api.panditsuggest.com
              │                               │
              ▼                               ▼
         CloudFront                      CloudFront
              │                               │
              ▼                               ▼
        Private S3 Bucket                    EC2
                                              │
                                              ▼
                                          Backend API
                                              │
                                              ▼
                                         PostgreSQL
```

Frontend URLs ideally:

```text
https://www.panditsuggest.com
https://media.panditsuggest.com
https://api.panditsuggest.com
```

Example media:

```text
https://media.panditsuggest.com/pandits/125/profile.webp

https://media.panditsuggest.com/pandits/125/gallery/havan-01.webp

https://media.panditsuggest.com/pandits/125/videos/intro.mp4
```

Database me actual image binary/file store nahi hoga.

Sirf object key/path:

```text
pandits/125/profile.webp
```

ya CloudFront URL store/reconstruct kiya jayega.

---

# 3. S3 bucket

Recommended bucket:

```text
panditsuggest-production-media
```

Region preferably application infrastructure ke same primary AWS region me rakho.

Folder/object structure:

```text
panditsuggest-production-media/

├── pandits/
│   ├── {panditId}/
│   │   ├── profile/
│   │   │   ├── original.jpg
│   │   │   ├── profile-320.webp
│   │   │   ├── profile-640.webp
│   │   │   └── profile-1280.webp
│   │   │
│   │   ├── gallery/
│   │   │   └── ...
│   │   │
│   │   └── videos/
│   │       ├── intro.mp4
│   │       └── thumbnail.webp
│
├── temples/
│   ├── {templeId}/
│   │   ├── cover/
│   │   ├── gallery/
│   │   └── videos/
│
├── services/
│   └── {serviceId}/
│
└── static/
    ├── logo/
    └── other-assets/
```

Random/UUID based file name use karna better hoga:

```text
pandits/125/gallery/8a72f28d.webp
```

instead of:

```text
image1.jpg
```

---

# 4. S3 bucket PUBLIC nahi hona chahiye

Very important.

Settings:

```text
Block Public Access = ON
```

All four public access settings enabled rahenge.

User ko ye URL direct access nahi karna chahiye:

```text
https://panditsuggest-production-media.s3.amazonaws.com/...
```

Media ideally sirf:

```text
https://media.panditsuggest.com/...
```

se serve hogi.

CloudFront ke liye **Origin Access Control — OAC** configure karna hai.

CloudFront authenticated requests ke through private S3 origin access kar sakta hai, while direct public S3 access blocked rehta hai.

Use:

```text
Origin Access Control
Signing behavior: Sign requests / always
Origin type: S3
```

AWS ke documentation ke according `always` standard/common signing configuration hai.

---

# 5. CloudFront media distribution

Create:

```text
Distribution:
panditsuggest-media-production
```

Origin:

```text
panditsuggest-production-media.s3.<region>.amazonaws.com
```

Use normal S3 REST origin.

Do NOT use public S3 website hosting.

Attach:

```text
Origin Access Control:
panditsuggest-media-oac
```

Viewer protocol:

```text
Redirect HTTP → HTTPS
```

Allowed methods media ke liye:

```text
GET
HEAD
OPTIONS
```

Upload CloudFront ke through mat karwana.

Upload backend → S3 hona chahiye.

---

# 6. CloudFront custom domain

Use:

```text
media.panditsuggest.com
```

ACM SSL certificate configure karo.

Then DNS:

```text
media.panditsuggest.com
        ↓
CloudFront Distribution
```

Final media URL:

```text
https://media.panditsuggest.com/pandits/391/profile/profile-640.webp
```

instead of:

```text
https://13.x.x.x/uploads/pandits/391.jpg
```

---

# 7. Cache configuration

Media ke liye cache aggressively use karna hai.

CloudFront cache hit ka meaning:

```text
First user:
CloudFront → S3

Next users:
CloudFront Edge → User
```

S3 ko repeatedly request karne ki zarurat kam hogi.

AWS bhi recommend karta hai ki cache key me unnecessary headers/cookies/query parameters add na karein because fewer cache-key values generally better cache-hit ratio dete hain.

For immutable media:

```text
Cache-Control:
public, max-age=31536000, immutable
```

Use versioned/unique filenames:

```text
profile-a8c392.webp
```

Agar Pandit profile photo update hoti hai:

Old:

```text
profile-a8c392.webp
```

New:

```text
profile-f82c91.webp
```

Database key simply new object par update ho jayegi.

Isse CloudFront invalidation ki frequent requirement nahi rahegi.

---

# 8. CloudFront cache policy

Static media ke liye recommended starting point:

```text
AWS Managed:
CachingOptimized
```

AWS ki managed `CachingOptimized` policy cookies/query strings ko cache key me include nahi karti aur compressed object caching support karti hai.

Pandit image request:

```text
/pandits/125/profile/profile-640.webp
```

same URL ko worldwide users ke liye same image return karni hai.

Isliye cache key ko country-specific mat banana.

Wrong:

```text
Image cache =
URL + country + device + cookies + session
```

Better:

```text
Image cache =
URL
```

Otherwise India/US/UK ke liye unnecessary duplicate caches create honge.

---

# 9. Images optimize karo

Sirf S3 migration se complete performance optimization nahi hogi.

Images ko upload ke waqt optimize karna hoga.

For example original:

```text
DSC00291.jpg
8 MB
5000×4000
```

Frontend par directly serve nahi karna.

Generate variants:

```text
320px
640px
1280px
```

Prefer:

```text
WebP
```

and where supported/implemented:

```text
AVIF
```

Example:

```text
profile-320.webp
profile-640.webp
profile-1280.webp
```

Frontend:

```html
<img
  src="profile-640.webp"
  srcset="
    profile-320.webp 320w,
    profile-640.webp 640w,
    profile-1280.webp 1280w
  "
/>
```

Browser required size choose karega.

---

# 10. Homepage ke liye special optimization

PanditSuggest homepage par agar 20 Pandit cards show hote hain to browser ko 20 original high-resolution photos nahi download karni chahiye.

Card thumbnails:

```text
~320–480px optimized image
```

Use:

```text
loading="lazy"
```

except above-the-fold/LCP image.

Example:

First visible important image:

```text
fetchpriority="high"
```

Remaining Pandit cards:

```text
loading="lazy"
```

Expected impact:

```text
FCP ↓
LCP ↓
Bandwidth ↓
EC2 load ↓
Page load time ↓
```

---

# 11. Videos

Pandit profile ke intro/havan videos bhi EC2 se remove karne hain.

Store:

```text
S3
 ↓
CloudFront
 ↓
Browser
```

Example:

```text
pandits/{panditId}/videos/{uuid}.mp4
```

Frontend video card load hote hi complete video download nahi hona chahiye.

Use:

```html
<video preload="metadata">
```

or:

```html
<video preload="none">
```

depending UX.

Thumbnail separately serve karo:

```text
/video-thumbnail.webp
```

User play kare tab actual video fetch ho.

---

# 12. Upload architecture

Current likely pattern:

```text
Admin/Pandit
    ↓
multipart upload
    ↓
EC2
    ↓
/uploads/
```

New pattern:

```text
Admin/Pandit
      ↓
Backend validates request
      ↓
S3 upload / Presigned Upload URL
      ↓
S3
      ↓
Database object key save
```

Recommended eventual approach:

```text
Browser
   │
   │ request upload permission
   ▼
Backend
   │
   │ presigned S3 URL
   ▼
Browser
   │
   │ direct upload
   ▼
S3
```

Meaning 100 MB video:

Wrong:

```text
Browser
 ↓ 100 MB
EC2
 ↓ 100 MB
S3
```

Better:

```text
Browser
 ↓
S3
```

EC2 sirf authorization/presigned URL issue kare.

Ye EC2 bandwidth/load dramatically reduce karega.

---

# 13. File validation

Backend ko upload allow karne se pehle validate karna hai.

Images:

```text
jpeg
jpg
png
webp
```

Video:

```text
mp4
webm
```

Check:

```text
MIME type
extension
actual file type
file size
authorization
pandit ownership
```

Never trust client supplied:

```text
filename
content-type
panditId
```

alone.

---

# 14. Database architecture

Database me ye mat store karo:

```text
/uploads/pandit/profile.jpg
```

Prefer:

```text
media_key
```

Example:

```json
{
  "mediaKey": "pandits/129/profile/3f8c7221.webp"
}
```

Application URL create kare:

```text
MEDIA_CDN_BASE_URL + mediaKey
```

Environment:

```env
AWS_REGION=...
AWS_S3_MEDIA_BUCKET=panditsuggest-production-media

MEDIA_CDN_BASE_URL=https://media.panditsuggest.com
```

Result:

```text
https://media.panditsuggest.com/pandits/129/profile/3f8c7221.webp
```

Benefits:

Aaj:

```text
CloudFront
```

Future me CDN/domain change hua to database migration nahi karni padegi.

---

# 15. Existing EC2 images migrate karna

Migration directly production code change se start nahi karni.

Phases:

## Phase A — Inventory

Find all current references:

```text
/uploads/*
/images/*
/videos/*
localhost paths
EC2 absolute URLs
DB media columns
hardcoded frontend URLs
```

Prepare migration map:

```text
old_path
→
new_s3_key
```

Example:

```text
/uploads/pandit/245.jpg
→
pandits/245/profile/a1827.webp
```

---

# 16. Dual-read migration

During transition application ko temporarily support karna chahiye:

```text
if media_key exists:
    CloudFront URL

else:
    legacy EC2 URL
```

That means:

```text
New uploads → S3

Old media → EC2 temporarily
```

Then migrate historical media batch-by-batch.

This avoids production downtime.

---

# 17. Migration verification

Each migrated object verify:

```text
S3 object exists
size > 0
correct MIME
CloudFront returns 200
DB reference correct
image/video actually opens
```

Only successful verification ke baad DB reference update karo.

Do NOT:

```text
upload → delete EC2 immediately
```

---

# 18. Cleanup phase

After:

```text
100% records migrated
+
100% URL validation
+
production observation
```

then EC2 `/uploads` media remove karo.

Backup immediately delete nahi karna.

Keep temporary rollback copy.

---

# 19. India + International users

PanditSuggest ka important business rule:

Some Pandits:

```text
India only
```

Some:

```text
India + International
```

Therefore system ko user market determine karna hai:

```text
INDIA
INTERNATIONAL
UNKNOWN
```

Do not trust:

```text
browser language
timezone alone
frontend country
user supplied JS
```

Primary market detection should remain **server-side**.

---

# 20. CloudFront Geo Detection

CloudFront viewer location ke basis par headers provide kar sakta hai including:

```text
CloudFront-Viewer-Country
CloudFront-Viewer-Country-Name
CloudFront-Viewer-Country-Region
CloudFront-Viewer-Country-Region-Name
CloudFront-Viewer-City
CloudFront-Viewer-Postal-Code
CloudFront-Viewer-Latitude
CloudFront-Viewer-Longitude
CloudFront-Viewer-Time-Zone
```

Example:

Indian visitor:

```text
CloudFront-Viewer-Country: IN
```

US visitor:

```text
CloudFront-Viewer-Country: US
```

UK visitor:

```text
CloudFront-Viewer-Country: GB
```

Backend:

```text
IN
 ↓
INDIA

anything else
 ↓
INTERNATIONAL
```

But invalid/missing data:

```text
UNKNOWN
```

and existing safe UNKNOWN-market policy must continue to apply.

---

# 21. Important: media CloudFront ≠ application geo detection

Ye bahut important architecture point hai.

Suppose:

```text
media.panditsuggest.com
        ↓
CloudFront
        ↓
S3
```

Then CloudFront knows media request user country.

But your:

```text
api.panditsuggest.com
        ↓
direct EC2
```

request ko EC2 automatically `CloudFront-Viewer-Country` nahi milega.

Therefore user-market resolution ke liye:

```text
User
 ↓
CloudFront
 ↓
PanditSuggest Backend/API
 ↓
Market Resolver
```

required hai.

CloudFront's origin request policies determine which CloudFront/viewer headers get sent to an origin.

---

# 22. Recommended API CloudFront architecture

Eventually:

```text
api.panditsuggest.com
        ↓
CloudFront
        ↓
ALB / EC2 Backend
```

Selected headers forward karo:

```text
CloudFront-Viewer-Country
CloudFront-Viewer-Country-Region
```

Potentially city etc. only if genuinely needed.

AWS warns that forwarding unnecessary headers can reduce caching effectiveness, so only required headers forward karo.

Backend:

```javascript
const country =
 request.headers["cloudfront-viewer-country"];
```

Then:

```text
country === "IN"
→ INDIA

known country && country !== "IN"
→ INTERNATIONAL

missing / malformed
→ UNKNOWN
```

---

# 23. Do NOT use geo location inside Pandit-media cache key

Important distinction.

Pandit recommendation API:

```text
country matters
```

because results India/International entitlement ke basis par change ho sakte hain.

But static Pandit profile photo:

```text
country does NOT matter
```

Therefore:

```text
MEDIA DISTRIBUTION

Country header in cache key:
NO
```

But:

```text
APPLICATION/API

Country:
Server receives it
```

CloudFront cache policy and origin request policy can be separated; headers can be passed to origin without unnecessarily adding everything to the cache key.

---

# 24. Pandit distribution integration

Request:

```text
GET /api/temples/nalkheda/pandits
```

Flow:

```text
User
 ↓
CloudFront
 ↓
Country resolution
 ↓
Backend
 ↓
Market Resolver
 ↓
Plan Eligibility
 ↓
Lead Distribution Engine
 ↓
Ranking / Rotation
 ↓
Pandit Results
```

Example India:

```text
CloudFront-Viewer-Country = IN

Eligible:

India-only plan
+
India + International plan
```

Example US:

```text
CloudFront-Viewer-Country = US

Eligible:

International-enabled Pandits only
```

Example UK:

```text
GB
 ↓
International
```

This market result must be calculated before Pandit ranking/shuffling.

Correct order:

```text
Resolve Market
      ↓
Determine Eligibility
      ↓
Candidate Pool
      ↓
Fair Distribution / Ranking
      ↓
Recent Exposure Suppression
      ↓
Return Pandits
```

NOT:

```text
shuffle all 500
↓
filter later
```

---

# 25. CloudFront logs

Enable CloudFront **Standard Logging v2**.

AWS currently supports sending standard logs to:

```text
S3
CloudWatch Logs
Firehose
```

and the logs can include `c-country`, which identifies viewer country based on viewer IP.

Recommended destination:

```text
panditsuggest-cloudfront-logs
```

or separate prefix/bucket from actual media:

```text
logs/media/
logs/api/
```

Use this for:

```text
India traffic %
US traffic %
UK traffic %
top countries
top requested media
cache hit/miss analysis
response latency
404 media
403 media
```

Important distinction:

CloudFront logs are useful for analytics/operations, but they should **not** be your real-time entitlement decision engine. AWS also describes standard access logs as best-effort delivery rather than guaranteed request accounting.

Real-time Pandit eligibility must use request-time server-side market resolution.

---

# 26. Security model

Final media security:

```text
Internet
  ↓
CloudFront
  ↓
OAC
  ↓
PRIVATE S3
```

Not:

```text
Internet
 ↓
Public S3
```

Configure:

```text
S3 Block Public Access = ON

CloudFront OAC = ON

HTTPS = mandatory

IAM least privilege

No AWS access keys frontend me

No S3 write permissions frontend me

Presigned uploads short-lived

File validation backend side
```

If future me some media should only be visible to authenticated/paid users, CloudFront also supports signed URLs/signed cookies for private content.

---

# 27. IAM architecture

EC2/backend IAM role ko limited permissions do:

```text
s3:PutObject
s3:GetObject
s3:DeleteObject
s3:HeadObject
```

Only:

```text
arn:aws:s3:::panditsuggest-production-media/*
```

Avoid:

```text
AmazonS3FullAccess
```

where unnecessary.

Never put:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

inside React frontend.

Prefer EC2 IAM Role.

---

# 28. CORS

S3 upload CORS limited origins tak rakho.

Example concept:

```text
https://panditsuggest.com
https://www.panditsuggest.com
https://admin.panditsuggest.com
```

Do NOT unnecessarily use:

```text
*
```

especially authenticated upload architecture me.

---

# 29. Environment separation

Production and development media mix mat karo.

Recommended:

```text
panditsuggest-production-media
panditsuggest-staging-media
```

or strict prefixes:

```text
production/
staging/
```

But separate buckets cleaner security model provide kar sakte hain.

---

# 30. Backend media service

AWS logic poore application me spread mat karo.

Create centralized service:

```text
MediaService
```

Responsibilities:

```text
uploadImage()
uploadVideo()
deleteMedia()
generatePresignedUpload()
getPublicMediaUrl()
validateMedia()
replaceMedia()
```

Application components should not independently talk to S3.

---

# 31. Frontend media utility

Similarly frontend:

```javascript
getMediaUrl(mediaKey)
```

Concept:

```javascript
const getMediaUrl = (key) =>
  `${MEDIA_CDN_BASE_URL}/${key}`;
```

Then Pandit card:

```text
PanditProfileCard
 ↓
mediaKey
 ↓
getMediaUrl()
 ↓
CloudFront
```

Hardcoded domain avoid karo.

---

# 32. SEO impact

PanditSuggest ke SEO ke liye images bhi optimized honi chahiye.

Use:

```text
descriptive alt text
width/height attributes
responsive srcset
correct aspect ratio
WebP/AVIF
lazy loading
```

Example:

```text
alt="
Pandit Ravi Sharma performing
Maa Baglamukhi Havan at Nalkheda Temple
"
```

But alt text natural hona chahiye; keyword stuffing nahi.

---

# 33. Core Web Vitals target

Migration ke baad test:

```text
LCP
FCP
CLS
TBT
Speed Index
INP
TTFB
```

Especially test:

```text
Home
Temple page
Service page
Pandit listing
Pandit profile
Gallery
Videos
```

Devices:

```text
Mobile
Tablet
Desktop
```

Networks:

```text
Fast broadband
4G
Slow mobile
```

Locations:

```text
India
US
UK
```

---

# 34. Expected final request lifecycle

## Homepage

```text
User India
   ↓
CloudFront
   ↓
PanditSuggest frontend/API
   ↓
Market = INDIA
   ↓
Eligible Pandit list
   ↓
JSON returned
   ↓
Pandit media URLs
   ↓
media.panditsuggest.com
   ↓
nearest CloudFront edge
```

## US visitor

```text
User US
 ↓
CloudFront
 ↓
Country = US
 ↓
Market = INTERNATIONAL
 ↓
International-enabled Pandits
 ↓
Pandit cards
 ↓
Images/videos CloudFront edge
```

---

# 35. What EC2 should contain after migration

EC2:

```text
Backend application
Business logic
Authentication
Lead distribution
Pandit ranking
Market resolver
API
Database communication
```

EC2 should NOT primarily contain:

```text
❌ Pandit profile images
❌ Pandit videos
❌ Temple galleries
❌ Service images
❌ User upload directory
❌ public static media
```

---

# 36. Production migration order

Do migration exactly in controlled phases.

### Phase 1 — AWS Infrastructure

Create:

```text
S3 production media bucket
S3 staging media bucket
IAM role/policies
CloudFront media distribution
OAC
SSL
media.panditsuggest.com
Logging
```

### Phase 2 — Backend Media Layer

Implement:

```text
S3 media service
presigned uploads
validation
mediaKey model
CloudFront URL generation
delete/replace logic
```

### Phase 3 — New Uploads

Switch:

```text
new uploads
EC2 → S3
```

Do not migrate historical files yet.

### Phase 4 — Historical Migration

```text
inventory legacy files
 ↓
upload S3
 ↓
verify
 ↓
update DB
```

### Phase 5 — Frontend

Replace:

```text
/uploads/...
```

with:

```text
CloudFront mediaKey URLs
```

Implement:

```text
responsive images
lazy loading
video thumbnail loading
```

### Phase 6 — Geo/CDN

Route application API through CloudFront.

Add:

```text
CloudFront-Viewer-Country
CloudFront-Viewer-Country-Region
```

to origin request handling.

### Phase 7 — Pandit Distribution

Integrate:

```text
CloudFront Geo
      ↓
Market Resolver
      ↓
Plan Entitlement
      ↓
Distribution Engine
```

Existing controlled rotation and entitlement logic must remain intact.

### Phase 8 — Production verification

Verify:

```text
India
US
UK
UNKNOWN market

India-only Pandit
International Pandit

refresh rotation
qualified leads
media loading
404/403
cache hit
mobile performance
desktop performance
```

### Phase 9 — Cleanup

Only after successful verification:

```text
stop EC2 local uploads
remove obsolete multer disk storage
remove legacy media paths
archive/delete EC2 media
```

---

# 37. Architecture we should NOT build

Avoid:

```text
React
 ↓
AWS Access Key
 ↓
S3
```

Avoid:

```text
Public S3 bucket
```

Avoid:

```text
EC2 → store media → CloudFront
```

Avoid:

```text
Database BLOB images/videos
```

Avoid:

```text
CloudFront country header in every static-media cache key
```

Avoid:

```text
frontend JavaScript IP geolocation
→ authoritative Pandit eligibility
```

Avoid:

```text
country detected after Pandit shuffle
```

---

# 38. Final PanditSuggest architecture

```text
                           ┌─────────────────────┐
                           │       USERS         │
                           │ India / US / UK ... │
                           └──────────┬──────────┘
                                      │
                                      ▼
                              ┌──────────────┐
                              │  CloudFront  │
                              └──────┬───────┘
                                     │
                    ┌────────────────┴─────────────────┐
                    │                                  │
                    ▼                                  ▼
           STATIC MEDIA REQUEST                 APPLICATION REQUEST
                    │                                  │
                    ▼                                  ▼
          media.panditsuggest.com             api.panditsuggest.com
                    │                                  │
                    ▼                                  ▼
               CloudFront                         CloudFront
                    │                         Geo headers resolved
                    ▼                                  │
               OAC Signed                              ▼
                    │                              EC2 Backend
                    ▼                                  │
              Private S3                         Market Resolver
                                                       │
                                                       ▼
                                              Plan Eligibility
                                                       │
                                                       ▼
                                             Distribution Engine
                                                       │
                              ┌────────────────────────┼───────────────┐
                              │                        │               │
                              ▼                        ▼               ▼
                          PostgreSQL              Lead Engine      Analytics
```

---

# 39. Final result

After this migration:

```text
EC2 load                 ↓↓↓
Media response latency   ↓↓↓
EC2 bandwidth usage      ↓↓↓
Homepage loading         ↑ faster
Pandit profile loading   ↑ faster
Video delivery           ↑ faster
International delivery   ↑ much better
Scalability              ↑
Cache hit ratio          ↑
Infrastructure isolation ↑
```

And most importantly PanditSuggest architecture becomes:

```text
S3        = storage
CloudFront = global media delivery + edge layer
EC2/API    = business logic
PostgreSQL = application data
CloudFront Geo = server-side market signal
Distribution Engine = who the user is allowed to see
```

This separation is the correct foundation for PanditSuggest's India + International scale.
