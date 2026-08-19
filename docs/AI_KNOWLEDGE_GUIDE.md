# Writing knowledge for PanditSuggest AI

For whoever writes articles in **Admin → AI Knowledge Base**.

The assistant can only say what you have written. It cannot look anything up, it
cannot reason its way to a ritual you never described, and when it has nothing
it is built to say so rather than improvise. Everything the devotee reads
traces back to an article somebody approved.

---

## 1. The rule that matters most

**Never promise an outcome.**

| Never write | Write instead |
|---|---|
| "Yeh havan aapka court case jita dega" | "Paramparagat roop se devotees is havan mein nyaay aur satya ki vijay ki prarthana karte hain" |
| "This puja will cure the disease" | "Swasthya ke liye Mahamrityunjaya jaap paramparagat roop se kiya jata hai, doctor ke ilaaj ke saath" |
| "100% problem solve ho jayega" | "Devotees is anushthan mein baadhaon ke nivaran ki kaamna karte hain" |
| "Shaadi pakki ho jayegi" | "Vivah mein aa rahi baadhaon ke liye yeh puja paramparagat roop se ki jati hai" |

Safe framings: *"Paramparagat roop se…"*, *"Devotees … ki prarthana karte hain"*,
*"… ke liye vichar kiya ja sakta hai"*, *"Aadhyatmik sahaara ke roop mein…"*.

This is not legal throat-clearing. A devotee in distress will believe a
confident sentence, and a promise you cannot keep is a harm you caused.

---

## 2. Health, legal, money

Any article touching these must state that the ritual accompanies professional
help and never replaces it.

> "Yeh puja aadhyatmik sahaara ke roop mein ki jati hai. Medical treatment ka
> vikalp nahi hai — doctor ki salah zaroor lein."

Same for a court case (no guaranteed verdict) and business (no guaranteed
profit).

---

## 3. What a good article looks like

Fill every field. Blank metadata is the single most common reason an article
never gets retrieved.

**Title** — what a devotee would call it. "Business mein rukawat ke liye havan",
not "Vyaparik Baadha Nivaran Anushthan Vidhi".

**Problem categories** — pick from the taxonomy. This is how the article reaches
the right person. An unassigned article is nearly invisible.

**Example phrases (`example_phrases`) — the highest-leverage field you can fill.**
Write the sentences devotees actually type, in their own spelling, in all three
registers:

```
Ghar mein hamesha ladai hoti hai
Pati patni mein banti nahi
घर में हमेशा कलेश रहता है
there is always fighting at home
```

Include the misspellings — "buisness", "groth", "shadi". These are embedded
verbatim, and they are what lets a badly typed query still find the right
article. Six good phrases beat six hundred words of prose.

**Body** — one topic per article. Sections under clear headings. A heading is
kept attached to its text when the article is chunked, so headings do real work.

**Service / temple links** — link only when it genuinely applies. A wrong link
sends a devotee to a ritual that does not fit.

**Language** — tag it honestly: `hi`, `en` or `hinglish`. Most of this corpus is
Hinglish, and that is fine.

---

## 4. Length

400–800 words per article. One topic.

Too short (a two-line article) carries no signal and never surfaces. Too long
(one article covering nine rituals) gets split, and the split pieces each look
like a partial answer. If you are covering nine rituals, write nine articles.

---

## 5. Draft → Published

Retrieval reads **only** `status = published` **and** `verified = true`.

Draft work is invisible to devotees, so you can write freely. Publishing is the
approval step — treat it as one. Unpublishing removes the article from live
answers immediately, in the same transaction, so if something is wrong,
unpublish first and fix afterwards.

After any edit, re-index. The panel shows indexing status; an article edited but
not re-indexed is still being retrieved with its **old** text.

---

## 6. Real experiences

`real-experiences.json` testimonials are what make an answer feel like it
understands. They are also the easiest place to overclaim.

Rules: keep the disclaimer, keep timelines vague and honest ("kuch mahinon
baad", not "exactly 45 days"), never present one person's experience as what
will happen to the reader, and never invent a testimonial. If it did not happen,
it does not go in.

---

## 7. When you find a gap

**Admin → AI Analytics → Demand Gaps** shows what devotees asked for and we
could not answer, split three ways:

- **`no_knowledge`** — nothing written. *Write an article.*
- **`no_service`** — remedy known, not in the catalogue. *Add the service.*
- **`no_pandit`** — offered, nobody eligible there. *Recruit in that city.*

This report is already populated. The knowledge base recommends 13 rituals the
platform does not sell — Saraswati Puja, Lakshmi Kubera Puja, Shani Shanti,
Santan Gopal Havan, Vastu Shanti and others. Those are seeded as `no_service`
gaps rather than quietly dropped, so the first thing you see is a real list of
services worth adding.

---

## 8. Checklist

- [ ] No guaranteed outcome anywhere
- [ ] Health/legal/financial disclaimer present if relevant
- [ ] Problem categories assigned
- [ ] 4+ example phrases, including Devanagari and a misspelling
- [ ] One topic, 400–800 words, real headings
- [ ] Service/temple links correct, or absent
- [ ] Language tagged
- [ ] Published **and** verified
- [ ] Re-indexed after editing
