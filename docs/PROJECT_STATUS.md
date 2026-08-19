# PanditSuggest — kya ban gaya, kya baaki hai

Status as of 13 August 2026. Har cheez ke saath: **kis problem ke liye banaya**,
aur **isse kya hota hai**.

---

## Ek line mein

**AI Pooja Guide live hai.** **Lead Distribution engine ab app se JUD gaya hai**
— naye endpoints bane, `geoMiddleware` mount ho gaya, exposure record hone laga,
aur frontend ki dono listing ab fair order use karti hain.

**172 automated tests, sab pass** — bina database, bina network.

Migration 18 tak sab apply, saare checks pass. **Ab 19 pending hai** — seat cap
enforcement — `npm run db:migrate`.

---

## 1. AI Pooja Guide — LIVE ✅

### Problem kya thi

`/ai-recommender` page par **koi AI tha hi nahi**. Wo hardcoded keyword matching
thi (`recommendRules`) — na model, na knowledge base, na asli pandit data.
Aur `knowledge.service.js` ka "search" sirf substring match tha, isliye "vyapar
mein rukawat" kabhi "business" record tak pahunch hi nahi sakta tha, aur
Devanagari kuch bhi match nahi karta tha.

### Kya banaya

| Cheez | Kis liye | Isse kya hota hai |
|---|---|---|
| **598-chunk knowledge index** (migration 12) | Aapki 7 JSON files ko searchable banane ke liye | "business me rukawat", "व्यापार में रुकावट", "buisness groth" — teeno ek hi jagah pahunchte hain |
| **Hybrid search** (vector + keyword) | Sirf vector se "Nalkheda" aur "Baglamukhi" jaise naam kho jaate hain | Proper noun bhi milta hai, matlab bhi milta hai |
| **3 alag engines** | Knowledge alag, marketplace alag, ranking alag | AI kabhi pandit invent nahi kar sakta — wo sirf samjhata hai, chunta nahi |
| **Offer-then-show** | Pehle cards thopna "bina suni bech diya" jaisa lagta hai | Pehle samjhata hai, phir poochta hai "suggest karun?", aap "haan" bolo to cards |
| **Ask once, then commit** | Aapke transcript mein 4 baar sawal pooche gaye the | Ab **0 sawal** usi conversation par |
| **Crisis short-circuit** | Koi likhe "jeene ka mann nahi" | Puja recommend hi nahi hoti — Tele-MANAS 14416 |
| **Admin AI Knowledge Base** | Aap khud article likh/publish/re-index kar sako | Unpublish karte hi wo article turant jawab dena band |
| **Admin AI Analytics** | Demand gaps | "187 logon ne Ujjain mein Pitru Dosh maanga, humare paas koi nahi" |

### Sabse bada catch

Aapki `problems-solutions.json` mein har record par `connectToPandit.serviceId`
hai. **30 mein se 29 aapke asli service slugs se match hi nahi karte** —
`navagraha_shanti` vs `navgrah-shanti`, `saraswati_puja` to hai hi nahi.

Agar main seedha join karta to **har problem ke liye zero service** aata, aur
koi error bhi nahi. Isliye mapping table alag banayi jo sirf asli services par
join karti hai — 22 mapping resolve hui, baaki 13 **demand gap** ban gaye.
Matlab aapki supply report pehle din se bhari hui hai.

### Chalane ke liye
```bash
npm run test:ai          # 106 tests
npm run ai:search -- --suite
```

---

## 2. Lead Distribution Engine — BANA AUR JUD GAYA ✅

### Problem kya thi

Purana engine (`leadDistribution.repository.js`) mein teen gaps the:

1. **Market ka concept hi nahi** — Dubai ka visitor ₹5k Bharat pandit dekh leta
2. **Fairness pool global tha** — Nalkheda ka pandit Kashi ke pandit se
   "fair share" ke liye lad raha tha. Ye bemaani hai, dono alag devotees serve
   karte hain.
3. **Sirf leads count hote the** — jis pandit ko 500 baar dikhaya gaya aur ek
   bhi lead nahi mili, wo "under-served" dikhta tha aur hamesha boost hota
   rehta tha. Jabki usko har mauka mil chuka tha.

### Kya banaya

| File | Kis liye | Isse kya hota hai |
|---|---|---|
| `fairness.js` | Deficit-based scoring, **do counters** | Lead aur exposure dono dekhta hai |
| `rotation.js` | Session-stable hash rotation | Refresh par order same, agle visitor ko alag pandit |
| `market.js` | Bina signup/GPS country pata karna | CDN header se, client par bharosa kiye bina |
| `15-lead-distribution-v2.sql` | Markets, entitlements, weighted exposure | Pool = **temple × market × plan** |
| `seed-nalkheda-500.js` | 500 test pandits | 200/150/150, purge bhi ho sakte hain |
| `simulate-distribution.js` | Deploy se pehle proof | 120k visitors, Gini measure |

### Do counters — sabse important design decision

```
qualifiedLeads     kitne verified devotees ne sach mein contact kiya
weightedExposure   kitni visibility mili, position ke hisaab se
```

Sirf leads dekhne se: 500 baar dikhaya, koi lead nahi → engine sochta hai
"bechara starve ho raha hai" → hamesha upar karta rehta hai. Sirf exposure
dekhne se: pandit jiske liye paisa de raha hai wahi nazar nahi aata.

Position weight bhi zaroori: **slot 1 slot 20 se ~7× zyada valuable hai.** Raw
impression count dono ko barabar maanta hai, isliye jo #1 par baitha hai wo
chupke se fayda uthata rehta hai.

### Ab kya juda hai (ye session)

| Cheez | Kis liye | Isse kya hota hai |
|---|---|---|
| `GET /pandits/distribution-order` | Listing pages client-side filter karti hain | Poora fair order milta hai, page nahi — saare filters waise ke waise chalte rahe |
| `GET /pandits/distributed` | Server-paged fair listing | Market → plan bucket → fairness → rotation, ek call mein |
| `POST /pandits/exposure` | Client batata hai kya **sach mein** dikha | Filter ke baad jo cards hate, unki exposure charge nahi hoti |
| `geoMiddleware` mount | Market detect hi nahi ho raha tha | Ab har request par `req.geo` |
| **Migration 16** | Naye leads par `market` NULL aa raha tha | Iske bina fairness ka lead-counter **chup-chaap mar jata** |
| Frontend `useFairRanking` | Purana endpoint global aur lead-only tha | Home aur /pandits dono ab market-aware fair order par |

### Migration 16 — sabse zaroori catch

Migration 15 ne `qualified_leads.market` column banaya. Par
`record_qualified_lead()` usme kuch likhta hi nahi tha.

Engine leads aise ginta hai:

```sql
WHERE ql.market = $2::lead_market
```

`NULL` na `'INDIA'` se match karta hai na `'INTERNATIONAL'` se. Matlab **migration
15 ke baad bani har lead engine ko dikhti hi nahi**. Har pandit ka lead-deficit
hamesha poora dikhta, do-counter design ka aadha hissa chup-chaap band ho jata —
aur kahin koi error nahi aata.

Migration 16 market ko function ke **andar** derive karta hai, devotee ke
**verified phone** se. Parameter se nahi — kyunki browsing market IP se aata hai,
aur IP se billing karna wahi galti hai jo design mana karta hai.

### Migration 17 — grants

Migration 15 grants dena bhool gaya tha, isliye app role config tables padh hi
nahi sakta tha. Wo fix ho gaya, par usme do problem thi:

1. **Guard nahi tha.** Baaki har migration `IF EXISTS (... pg_roles ...)` se
   wrap karti hai, kyunki `panditconnect_app` alag provisioning step banata hai.
   Fresh dev ya CI database par bare GRANT `role does not exist` deta, aur
   transaction ke andar hone se **poori migration 15 rollback** ho jati.

2. **Zaroorat se zyada permission.** App ko `plan_market_entitlements` aur
   `distribution_config` par INSERT/UPDATE/DELETE mila tha, jabki code sirf
   SELECT karta hai. Ye do tables poore plan system ke rules hain — kahin bhi
   SQL injection mila to DELETE se plan system chup-chaap khatam.

Aur ye galti dikhti bhi nahi: `getConfig()` aur `getEntitlements()` error nigal
kar `{}` return karte hain, isliye grant missing hone par engine hardcoded
defaults par chalta rehta aur aapki tuning **chup-chaap ignore** hoti.
`verify:wiring` mein ab explicit permission check hai.

### Local par test karte waqt — ye jaan lena zaroori hai

Localhost par **koi CDN nahi**, isliye koi country header nahi, isliye market
hamesha `UNKNOWN`. Aur `POST /pandits/exposure` jaan-boojh kar UNKNOWN market
par record karne se mana kar deta hai — jis market ka pata hi nahi, uska counter
likhna wahi data kharab karta hai jo agli ranking decide karta hai.

Matlab local par `pandit_exposure` **khaali rahega**, aur lagega engine toota
hua hai. Wo toota nahi hai — CDN ke peeche sahi chalega.

Local par test karne ke liye:

```bash
ALLOW_DEV_GEO_HEADER=1 npm run dev
curl -H 'X-Dev-Country: IN' localhost:4000/api/pandits/distribution-order
curl -H 'X-Dev-Country: US' localhost:4000/api/pandits/distribution-order
```

Dono me alag pandits aane chahiye. Ye override `NODE_ENV=production` mein
bilkul kaam nahi karta, aur env var set kiye bina bhi nahi — dono conditions
zaroori hain, kyunki ye header tay karta hai ki visitor kaun se pandit dekhega.

### Chalane ke liye
```bash
npm run db:migrate         # 17 naya hai
npm run verify:wiring      # asli database par — schema, pools, rotation, exposure
npm run test:distribution  # 66 tests
npm run sim:distribution -- --visitors 120000 --compare
```

---

## 2b. Admin Distribution Controls — NAYA ✅

`/admin/distribution` par ab **har setting admin ke haath mein hai**.

### Design ka ek hi rule

**Koi setting bina apna anjaam dikhaye save nahi hoti.**

Plan ladder ek baar pehle hi ulta ho chuka hai — ₹9,000 wale ko ₹5,000 wale se
kam leads. Wo laparwahi se nahi hua. Wo isliye hua kyunki **percentage seat
count chhupa deta hai**:

```
India traffic ka 70% ÷ 200 Bharat seats = 35.0 leads per seat
India traffic ka 30% ÷ 150 Global seats = 20.0 leads per seat
```

Dono number slider par bilkul theek lagte hain. Ulta-pan tabhi dikhta hai jab
seats se divide karo — jo koi dimaag mein nahi karta. Isliye panel har keystroke
par ye calculate karke **save se pehle** dikhata hai.

### Kya-kya set kar sakte ho

| Setting | Kya karta hai |
|---|---|
| **Pool mode** | `Weighted` (har plan ko % share) ya `Priority` (upar wala plan sab le jaata hai) |
| **Share %** | Har plan ko kitna traffic, per market |
| **Priority order** | Priority mode mein kaun pehle — chhota number pehle |
| **Seat cap** | Kitne pandit ye plan le sakte hain |
| **Daily cap** | Ek pandit ko din mein max kitni leads |
| **Price ₹** | Taaki panel ₹/lead nikal sake |
| **8 fairness knobs** | Window, strength, quality weight, rotation depth, etc. |

### Teen faisle jo maine liye

**1. Bounds database mein hain, UI mein nahi.** Admin ne `fairness_strength`
mein 5 daal diya (0-1 ka value) to error nahi aata — engine chup-chaap quality
par rank karna band kar deta hai. Sirf React mein validate karna matlab API,
script ya koi bhi future tool usse bypass kar dega. Ab har key ke saath
`min_value`/`max_value` hai aur setter usko enforce karta hai. UI wahi numbers
padhta hai, to slider ki limit aur asli limit kabhi alag nahi ho sakti.

**2. Tables app role ke liye ab bhi read-only hain.** Migration 17 ne
jaan-boojh kar write hataya tha. Admin panel ke liye grants wapas dena usko
undo kar deta — ek SQL injection poore plan system ko rewrite kar sakti. Isliye
writes `SECURITY DEFINER` functions se jaati hain jo validate karti hain, audit
likhti hain, aur ek hi row chhuti hain.

**3. Seat cap ek SALES limit hai, distribution filter nahi.** Agar 201 pandit
200-seat plan par hain, to pandit #201 ne **paise diye hain**. Usko chup-chaap
kisi ko na dikhana sabse kharab behaviour hota — aur invisible bhi. Cap tab
lagta hai jab plan **becha** jaa raha ho; panel `203/200 — oversold` dikhata
hai. Engine sabko serve karta rehta hai.

### Migration 19 — meri hi galat claim ka fix

Migration 18 mein maine likha tha *"the cap is enforced when a plan is SOLD"*.
**Wo sach nahi tha.** Cap sirf panel mein dikhta tha; enforce kahin nahi hota
tha. Ye no-cap se bhi bura hai — admin "200 seats" set karke maan leta ki system
usko 200 par rok dega, aur nahi rokta.

Migration 19 usko sach banata hai. **Trigger se, controller check se nahi** —
kyunki `current_tier` char alag jagah se likha jaata hai:

```
repositories/payments.repository.js          (pandit khud plan khareede)
repositories/admin/subscriptions.repository  (admin subscription activate kare)
repositories/admin/pandits.repository.js     (×2 — admin pandit edit kare)
```

Char jagah same guard lagane ka matlab hai ki **paanchvi jagah jo agle mahine
likhi jayegi usme nahi hoga** — aur failure silent hai, cap phir se bemaani ho
jayega. Trigger har raasta cover karta hai, psql se manually chalayi UPDATE bhi.

Kya block **nahi** hota: renewal, downgrade, uncapped tier, aur wo admin jo
jaan-boojh kar oversell karna chahta hai (`app.allow_seat_overflow`). Seeder
bhi yahi override use karta hai — 500 test pandits ka maqsad hi caps bharna hai.

Aur error ab 409 `seat_cap_reached` aata hai saaf message ke saath, na ki
"Kuch galat ho gaya" — warna kaam karta hua safety rail toota hua app lagta hai
aur log usko band kar dete hain.

### Priority mode ke baare mein saaf baat

Priority mode **neeche wale plans ko bhookha rakhta hai**. Ye bug nahi, yahi
uska kaam hai. Agar ₹15,000 plan par ek bhi eligible pandit hai, to us market ka
har visitor wahi pool dekhega aur ₹5,000 wale 200 pandits ko kuch nahi milega.

Panel save se pehle ye dikhata hai:

```
Bharat        ₹5,000    200 seats     0 leads/pandit    no leads
[error] 200 pandit(s) on the ₹5,000 plan would receive NO leads at all
```

---

## 3. ⚠️ Plan ladder ulta hai — engine isko theek nahi kar sakta

Aapke apne §13 numbers ke saath:

| Plan | Seats | India | Intl | Total | **₹/lead** |
|---|---:|---:|---:|---:|---:|
| ₹5,000 Bharat | 200 | 35.0 | — | **35.0** | **₹143** |
| ₹9,000 Global | 150 | 20.0 | 6.0 | **26.0** | **₹346** |
| ₹15,000 Intl | 150 | — | 14.0 | **14.0** | **₹1,071** |

**₹9,000 dene wale ko ₹5,000 dene wale se KAM leads milti hain.**

Ye arithmetic hai, bug nahi: 70% India traffic **200** seats par batne se, 30%
**150** seats par batne se zyada per-seat hota hai. Percentage seat count chhupa
deta hai.

Teen raaste `LEAD_DISTRIBUTION_V2.md` §2 mein hain. Sabse saaf: **premium plans
mein kam seats** — ₹9k par ~61, ₹15k par ~20. Scarcity hi wo cheez hai jo premium
tier asal mein bechta hai.

Ek achhi baat: aapka allocation **already delivered value barabar kar deta hai**
— aapke hi 2.5× credits idea se teeno plans ko 35 credits milte hain.

---

## 4. Pehle kya chal raha tha — aur ab kya chal raha hai

Pehle `/api/pandits` sirf ye chalata tha:

```sql
ORDER BY p.rank_score DESC, p.avg_rating DESC
```

Simulation ne isi approach ko measure kiya:

| Approach | mean | min | max | Gini | zero leads |
|---|---:|---:|---:|---:|---:|
| **Fairness engine** | 32.0 | 18 | 44 | **0.118** | **0** |
| `ORDER BY RANDOM()` | 34.3 | 10 | 112 | 0.269 | 0 |
| **`ORDER BY rating DESC`** ← abhi yahi | 47.2 | 0 | **1,265** | **0.924** | **154 of 174** |

**Ek pandit ko 1,265 leads, 174 mein se 154 ko zero.** Ye winner-takes-all tha.

Ab listing pages `distribution-order` use karti hain, isliye order fairness
engine se aata hai. Purana `/api/pandits` (rating sort) waise ka waisa hai —
search aur filters uspar chalte hain — par "kaun upar dikhega" ab wo tay nahi
karta.

**Note:** `/pandits/ranked-order` abhi bhi kaam karta hai, sirf deprecated hai.
Purana behaviour chahiye to wo maujood hai.

---

## 5. Kya baaki hai

### Zaroori — pehle ye

| # | Kaam | Kyun |
|---|---|---|
| 1 | `npm run db:migrate` — **19 pending** | Seat cap abhi sirf dikhta hai, lagta nahi |
| 2 | **Plan ladder ka faisla** (§3) | Pandits ko plan bechne se pehle. Ye engine theek nahi kar sakta — arithmetic hai |
| 3 | CDN par origin lock karna | `geoMiddleware` CDN headers par bharosa karta hai. Agar origin public reachable hai to koi bhi header forge karke international pool dekh lega |
| 4 | `visitor_geo_log` — decide karo | Table bana hai par **koi usme likhta hi nahi**. Ya to geo logging jodo, ya table hata do |

### Uske baad

| Kaam | Kyun |
|---|---|
| Admin panel mein distribution controls + **₹/lead preview** | Slider hilane se pehle ladder ka asar dikhe |
| Guest AI conversations ke liye retention policy | Log depression/divorce likhte hain, abhi hamesha ke liye stored |
| `ai:calibrate` poora (60 nahi, 151 phrases) | Threshold confirm karna |
| Panchang — abhi 364 din khaali hai | `panchang_data` mein sirf 1 row seeded hai |
| Lead credits (intl = 2.5×) | Conversion data aane ke baad |

---

## 6. Test coverage

```bash
npm run test:ai            # 106
npm run test:distribution  #  66
```

**172 tests, sab pass, bina database ke.** Ye jaan-boojh kar hai — engine pure
functions se bana hai, isliye 500 pandits par 120,000 visitors simulate karke
fairness sach mein naapi ja sakti hai, deploy karne se pehle.

Is session mein 9 naye tests jude: paging (page 2 par wahi pandit dobara na aaye,
poora pool exactly ek baar cover ho), aur market gating (forged header se koi
INTERNATIONAL pool mein na ghus paye).

Jo automated tests se verify **nahi** hua, aur `verify:wiring` isiliye banaya:
retrieval quality (`ai:calibrate` se manually — recall@1 73.3%), aur saara SQL
asli pandit rows par. **Ye tests database ko chhoote hi nahi** — isliye ye kabhi
nahi keh sakte ki aapke server par sach mein chal raha hai.

---

## 7. Rules jo kabhi nahi tootne chahiye

Ye har layer mein enforce hain aur tests inhe pakadte hain:

1. **AI recommendation ≠ qualified lead.** Impression, card click, profile view —
   sab zero leads. `record_qualified_lead()` bilkul waisa hi hai.
2. **AI kabhi pandit/service/temple invent nahi kar sakta.** Jo id candidate set
   mein nahi thi, wo answer reject ho jata hai.
3. **Kabhi outcome ka vaada nahi.** "Yeh havan case jita dega" → reject.
4. **Plan sirf pool decide karta hai, ranking nahi.** Pool ke andar sab fairness
   aur quality par ladte hain — warna same-plan fairness jhooth hai.
5. **IP se billing nahi.** Dikhane ke liye theek, charge karne ke liye nahi.
