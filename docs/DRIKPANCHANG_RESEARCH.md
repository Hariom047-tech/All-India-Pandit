# DrikPanchang — feature audit and data-source analysis

Researched from the live site, August 2026, for PanditSuggest.

**The headline answer to your question: DrikPanchang uses no third-party
panchang API. It computes everything itself from astronomical ephemeris.** There
is nobody to buy the data from — they are the source. Details in §3.

---

## 1. What the site actually is

| | |
|---|---|
| Owner | Adarsh Mobile Applications LLP, Bengaluru (founded 2010, Sharad Upadhyay) |
| Coverage | Their own claim: **100,000+ cities worldwide**, DST handled per city |
| Platforms | Web, Android, iOS |
| Business model | Advertising, with a paid "Remove Ads" subscription. No API product. |
| Trademark | "DrikPanchang" and the Panditji logo are registered |

Stated limitation, in their own words: it cannot generate panchang for high
latitudes "where sun is always visible during some part of the year" — because
the whole system is anchored to sunrise, and at those latitudes sunrise does not
happen daily.

---

## 2. Feature inventory

### 2.1 Daily Panchang — the core

Every field below appears on a single day page. This is the completeness bar:

**The five limbs (panchanga = "five limbs")**
Tithi · Nakshatra (with **Pada**) · Yoga · Karana · Vara

**Solar and lunar events**
Sunrise · Sunset · Moonrise · Moonset · Dinamana (day length) · Ratrimana
(night length) · Madhyahna (midday)

**Calendar systems, in parallel**
Vikram Samvat · Shaka Samvat · Chandramasa (lunar month) · Paksha ·
Amanta **and** Purnimanta month names · Vedic Ritu · Vedic Ayana

**Inauspicious periods**
Rahu Kaal · Yamaganda · Gulikai Kalam · Dur Muhurat · Varjyam · Bhadra ·
Panchaka · Ganda Moola

**Auspicious periods**
Abhijit Muhurta · Amrit Kaal · Brahma Muhurta · Vijaya Muhurta ·
Godhuli Muhurta · Sayahna Sandhya · Nishita Muhurta

**Supplementary**
Anandadi Yoga · Homahuti · Disha Shool · Agnivasa · Shivavasa · Chandra Vasa ·
Surya Nakshatra · Surya Pada · Moon sign · Sun sign

### 2.2 Beyond the day page

- **Muhurat finders** — marriage, griha pravesh, naamkaran, mundan, annaprashan,
  vehicle purchase, property, business opening, each as its own tool returning
  date ranges rather than a single day
- **Choghadiya** — 8 day + 8 night slots
- **Hora** — 24 planetary hours
- **Festival and Vrat calendars** — computed per location, not a fixed list
- **Kundali / Lagna chart**
- **Rashifal** (horoscope)
- **Regional panchangam** — Tamil, Bengali Panjika, Telugu, Gujarati, Malayalam,
  Kannada, Marathi, Odia, and more
- **Vedic clock** — Ghati / Pal / Vipal instead of hours and minutes

### 2.3 The settings that reveal the engineering

This is the most technically informative page on the site. Each option is a real
calculation parameter:

| Setting | Options | Why it matters |
|---|---|---|
| **Lunar month type** | Purnimanta / Amanta | Changes the month *name* for the same day. North India uses Purnimanta, South uses Amanta |
| **Panchang arithmetic** | Thiru Ganita / Vakyam (Tamil), Bisuddha / Surya Siddhanta (Bengali) | Two different mathematical traditions, giving different timings |
| **Sunrise type** | **Edges** (upper limb) / Middle limb | The instant the sun's top edge clears the horizon vs its centre. Shifts every downstream timing by ~2 minutes |
| **Elevation** | Enabled / Disabled | Altitude of the location. Their own note: "may make the difference of a couple of minutes" |
| **Time system** | Modern clock / Vedic (Ghati–Pal–Vipal) | |

That "Sunrise type" toggle is the tell. You only expose that setting if you are
computing sunrise from an ephemeris yourself. Nobody offers it as an API
parameter.

---

## 3. Where the data comes from — the answer

### 3.1 No third-party API. They calculate it.

From their own About text:

> "All calculations are based on **Drik Ganita** i.e. on precise calculations of
> planetary positions. This site doesn't support panchang based on Surya
> Siddhanta, except Tamil Panchangam and Bengali Panjika, as calculations based
> on Surya Siddhanta don't give precise planetary positions which results in
> erroneous moments."

**"Drik Ganita" is not a product or a vendor.** It is the name of a *method* —
"drik" means observed/visible, "ganita" means computation. It means computing
planetary positions from modern astronomical ephemeris rather than from
medieval arithmetic tables.

The contrast they draw is with **Surya Siddhanta**, a ~1,500-year-old text whose
mean-motion constants were calibrated for roughly 1100 CE. Using it today puts
planetary positions out by enough to move a tithi's end time by **hours**, which
moves festival dates by a whole day. Drik Ganita error is arcseconds.

So the pipeline is:

```
astronomical ephemeris  (planetary positions over time)
        ↓
   ayanamsa correction  (tropical → sidereal, the Vedic zodiac)
        ↓
sun & moon longitudes for a given instant + latitude/longitude/elevation
        ↓
  tithi   = f(moon_longitude − sun_longitude)      each 12° = 1 tithi
  nakshatra = f(moon_longitude)                    each 13°20' = 1 nakshatra
  yoga    = f(moon_longitude + sun_longitude)      each 13°20' = 1 yoga
  karana  = half a tithi
  vara    = weekday, from sunrise to sunrise
        ↓
sunrise/sunset → all muhurat windows are fractions of the day/night length
```

Rahu Kaal, for example, is simply the day length divided into 8 parts, with the
part index fixed per weekday. Abhijit is the 8th of 15 muhurtas of the day. None
of that needs an API — it needs an accurate sunrise.

### 3.2 What the ephemeris almost certainly is

They do not publish this. The standard for anyone doing Drik Ganita is the
**Swiss Ephemeris** (astro.com), a compressed derivative of NASA JPL's DE431,
accurate to ~0.001 arcseconds and covering 13000 BCE – 17000 CE.

Treat "Swiss Ephemeris" as a **strong inference, not a confirmed fact** — it is
what every serious drik-ganita implementation uses, and their feature set
(elevation, sunrise limb selection, 100k cities) matches its capabilities
exactly. But they have not said so.

⚠️ **Swiss Ephemeris licensing:** dual-licensed AGPL **or** paid commercial. If
you use it in a closed-source commercial product, you need the commercial
licence. Budget for this before building.

### 3.3 Can you use DrikPanchang's data?

**No.** They have no API, and their footer states: *"All Images and data —
Copyrights © www.drikpanchang.com"*. Scraping would be both a licence breach and
technically fragile. This is not a route.

---

## 4. What this means for PanditSuggest

### 4.1 Your Panchang page is empty 364 days a year

I checked while researching this. `backend/src/repositories/misc.repository.js`:

```sql
SELECT ... FROM panchang_data WHERE date = CURRENT_DATE
```

`02-seed.sql` contains **exactly one** `INSERT INTO panchang_data`. Nothing in
the codebase computes panchang. So on every date except that one seeded day, the
query returns no row and the page has nothing to show.

This is a live gap today, independent of anything on this page.

### 4.2 Three options, honestly compared

| | Effort | Cost | Accuracy | Ongoing |
|---|---|---|---|---|
| **A · Third-party API** | Low | ₹0–2,500/mo | Vendor's | Vendor dependency, rate limits |
| **B · Compute in-house** | High | Licence only | Yours to own | Ephemeris files (~90 MB), you own correctness |
| **C · Admin enters manually** | Lowest | Free | Human | Someone fills a form every day, forever |

**Option A — API.** Real providers with panchang endpoints:
[Prokerala](https://api.prokerala.com/pricing) (since 2006, free tier ~5,000
credits/month, paid from ~₹999/mo), [VedicRishi](https://vedicrishi.in/web-astro-api),
[DivineAPI](https://divineapi.com/indian-astrology/panchang-api),
[AstrologyAPI](https://astrologyapi.com/docs/api-ref/19/advanced_panchang).
Typical response covers tithi, nakshatra, yoga, karana, sunrise/sunset,
Rahu Kaal, Gulika, Yamaganda, Abhijit, Choghadiya and Hora — most of §2.1.

**Option B — in-house.** [`swisseph`](https://www.npmjs.com/package/swisseph) or
[`swisseph-v2`](https://www.npmjs.com/package/swisseph-v2) are native Node
bindings to Swiss Ephemeris. [`@bidyashish/panchang`](https://www.npmjs.com/package/@bidyashish/panchang)
is a TypeScript library that already wraps it for panchanga specifically.
[drik-panchanga](https://github.com/webresh/drik-panchanga) is a readable Python
reference implementation if you want to understand the maths.

**Option C** is what you have now, minus the daily data entry.

### 4.3 My recommendation

**Start with A, structured so B is a swap later.**

Your business is connecting devotees to pandits. Panchang is supporting content —
it earns trust and search traffic, it is not the product. Owning an ephemeris
pipeline means owning ayanamsa selection, DST edge cases, high-latitude
failures, and a class of bug where a festival lands on the wrong day and the
error is invisible until a devotee tells you.

Concretely:

1. Keep `panchang_data` as the table the app reads. Nothing in the frontend
   changes.
2. Add a nightly job that fills the next ~30 days from a provider.
3. Put the provider behind one interface — `PanchangProvider` with
   `fetchDay(date, lat, lng, tz)`. Today it calls an API; if you later want to
   own it, the Swiss Ephemeris version implements the same interface.
4. Cache aggressively. Panchang for a given date and location **never changes**,
   so it is cacheable forever — one API call per city per day, permanently.
   Most providers' free tiers are enough at your volume because of this.

### 4.4 If you do build it yourself, the traps

- **Ayanamsa** — Lahiri is the Indian government standard and what most Indian
  panchangs use. Choosing differently shifts every nakshatra boundary.
- **Sunrise definition** — upper limb vs centre. ~2 minutes, which is enough to
  move a tithi across a sunrise boundary and change the day's tithi name.
- **The day starts at sunrise, not midnight.** A Hindu date runs sunrise to
  sunrise. Getting this wrong is the single most common panchang bug.
- **Amanta vs Purnimanta** — the same day has two different month names. You
  need to know which your audience uses. For Madhya Pradesh: Purnimanta.
- **Tithi at sunrise governs the date**, even if that tithi ends minutes later.
- **DST and historical timezones** — a birth chart for 1975 India needs the
  rules that applied then.
- **Elevation** — matters for mountain locations.

---

## 5. What is worth copying, and what is not

**Worth taking:**

- One dense day page with everything on it, rather than data spread thin across
  many pages
- Auspicious and inauspicious periods **visually separated** — that is the
  distinction a devotee is actually scanning for
- Muhurat finders as *task-oriented* tools ("marriage muhurat") rather than a
  raw data dump. This is the part that maps directly onto your services — a
  griha pravesh muhurat finder that ends in "book a pandit for this date" is a
  genuinely better product than DrikPanchang's, because they cannot complete
  that journey and you can.
- Location-aware everything

**Not worth copying:**

- 100,000 cities. Your marketplace is Madhya Pradesh–centred; a few hundred
  cities covers your users and cuts the problem enormously.
- Every regional panchangam variant. Purnimanta plus one or two regional
  calendars is plenty at your stage.
- The advertising-led layout.

---

## 6. Sources

- [DrikPanchang home page](https://www.drikpanchang.com/) — the "Drik Ganita" statement, city coverage, ownership
- [DrikPanchang settings](https://www.drikpanchang.com/settings/drikpanchang-settings.html) — calculation options, sunrise type, elevation, lunar month type
- [DrikPanchang day panchang](https://www.drikpanchang.com/panchang/day-panchang.html) — the full published field list in §2.1
- [Thiru Ganita vs Vakyam Panchangam](https://www.drikpanchang.com/tamil/info/thiruganita-versus-vakyam-panchangam.html) — their own explanation of the two arithmetics
- [Surya Siddhanta vs Drik Ganita accuracy](https://www.myzodiaq.in/en/online-library/panchang/panchang-calculation-methods/surya-siddhanta-vs-drik-ganita-which-is-more-accurate) — the ~1100 CE calibration epoch and error magnitude
- [Swiss Ephemeris documentation](https://www.astro.com/swisseph/swisseph.htm) — precision, coverage, licensing
- [swisseph (npm)](https://www.npmjs.com/package/swisseph) · [swisseph-v2 (npm)](https://www.npmjs.com/package/swisseph-v2) · [@bidyashish/panchang (npm)](https://www.npmjs.com/package/@bidyashish/panchang)
- [drik-panchanga reference implementation](https://github.com/webresh/drik-panchanga)
- [Prokerala API pricing](https://api.prokerala.com/pricing) · [VedicRishi](https://vedicrishi.in/web-astro-api) · [DivineAPI Panchang](https://divineapi.com/indian-astrology/panchang-api) · [AstrologyAPI advanced panchang](https://astrologyapi.com/docs/api-ref/19/advanced_panchang)

---

## 7. Confidence

**Verified from the site itself:** ownership, Drik Ganita statement, the field
list in §2.1, every setting in §2.3, the absence of a public API, the copyright
notice.

**Inferred, not confirmed:** that the ephemeris is specifically Swiss Ephemeris.
Strongly indicated by their feature set and universal practice, but unstated.

**Not checked:** exact provider pricing was read from search results, not from
their billing pages — confirm current rates before committing.
