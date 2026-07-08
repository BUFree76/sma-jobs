# StaffMyAgency — Google Ads Campaign Setup

Goal: promote every active job, but show ads **only** where those jobs exist, with
zero manual location management as inventory changes.

Architecture in one paragraph: three Search campaigns split by **role family**
(stable — never needs rebuilding), each geo-targeted by **radius circles around
cities with active jobs in that family** (volatile — synced nightly by
`geo-sync.js`), with **location-inserted ad copy** so one ad reads as local
everywhere ("Insurance Sales Jobs in Mesa" / "…in Tampa").

---

## 1. One-time account setup (owner, ~30 min)

1. Create the account at ads.google.com (Expert Mode — skip the "Smart campaign"
   wizard), add billing.
2. Link Google Analytics if available (optional but useful).
3. Account settings: Ad rotation "Optimize", auto-apply recommendations **OFF**
   (they will re-expand your targeting if left on).

## 2. Conversion tracking (dev, ~1 hr) — do this BEFORE launching

The only conversion that matters is a **submitted application**.

1. Google Ads > Goals > Conversions > New: "Application Submitted",
   category Submit lead form, count One, click-through window 30 days.
2. Install the Google tag site-wide on staffmyagency.com, then fire the
   conversion event on the application-success moment of the job detail page
   (the apply form is on-page, so this is one event snippet on the success
   handler / thank-you state).
3. Later, when the resume-database endpoint is live, add a second conversion
   "Resume Uploaded" the same way — it monetizes clicks that don't apply today.

## 3. Campaigns (owner or dev, ~2 hrs with the copy below)

Create three **Search** campaigns. Shared settings for all:

| Setting            | Value                                                        |
|--------------------|--------------------------------------------------------------|
| Networks           | Google Search only — untick Search Partners and Display      |
| Locations          | Leave EMPTY at creation — geo-sync.js populates radius targets on its first run |
| Location options   | **"Presence: people in or regularly in"** — NOT the default "presence or interest" (critical: the default shows ads to people researching those cities from anywhere) |
| Languages          | English, Spanish (many listings are bilingual)               |
| Bidding            | Start "Maximize clicks" with a CPC cap (~$4). Switch to Target CPA once a campaign has ~30 conversions. |
| Budget             | See rollout plan below                                       |

Campaign names must match `geo-sync.js` CONFIG exactly:

### Campaign: `SMA Jobs - Sales`
- Ad group **Licensed Sales** — phrase-match keywords:
  "insurance sales jobs", "licensed insurance jobs", "insurance agent jobs",
  "insurance producer jobs", "state farm agent team member",
  "state farm agency jobs", "farmers insurance agency jobs",
  "insurance sales jobs near me"
- Ad group **Entry-Level Sales** — "entry level insurance jobs",
  "insurance jobs no experience", "insurance jobs will train"
- Final URL: `https://staffmyagency.com/Main/JobSearch?q=sales`

### Campaign: `SMA Jobs - Service`
- Ad group **CSR / Account Rep** — "insurance customer service jobs",
  "insurance csr jobs", "insurance account representative jobs",
  "insurance account manager jobs", "customer service jobs insurance agency"
- Final URL: `https://staffmyagency.com/Main/JobSearch?q=customer+service`

### Campaign: `SMA Jobs - Office`
- Ad group **Reception / Admin** — "receptionist jobs insurance",
  "insurance office assistant jobs", "insurance office manager jobs",
  "office jobs insurance agency"
- Final URL: `https://staffmyagency.com/Main/JobSearch?q=office`

### Responsive search ad template (all campaigns)

Headlines (location insertion makes the ad read local automatically):
- `Insurance Jobs in {LOCATION(City):Your Area}`
- `{KeyWord:Insurance Agency Jobs}` (keyword insertion)
- `Hiring Now at Local Agencies`
- `$40k–$95k+ Agency Roles` (adjust per campaign to true inventory range)
- `Apply Online in Minutes`
- `Licensed? Agencies Want You` (Sales campaign)
- `No License? We'll Train You` (Entry-Level ad group)

Descriptions:
- `Local State Farm & Farmers agencies are hiring near you. Real salaries listed on every job. Apply in minutes.`
- `Search open agency roles by city, pay, and license. New jobs posted daily on StaffMyAgency.`

### Negative keywords (shared list, apply to all three campaigns)
"free", "adjuster", "underwriter", "claims adjuster", "corporate careers",
"internship" (unless promoting them), "attorney", "insurance quotes",
"buy insurance", "cheap insurance" — and review the search-terms report weekly
for the first month; job queries and buy-insurance queries share many words.

## 4. Job locations feed (dev, ~half day) — powers the geo targeting

`GET https://staffmyagency.com/api/job-locations.json` returning:

```json
{
  "generated": "2026-07-08T06:00:00Z",
  "locations": [
    {
      "city": "Suwanee", "state": "GA", "zip": "30024",
      "lat": 34.0515, "lng": -84.0713,
      "jobs": { "SALES": 2, "SERVICE": 1, "OFFICE": 1, "MANAGEMENT": 0 }
    }
  ]
}
```

- One entry per distinct city/ZIP with at least one **active** job.
- `lat`/`lng`: geocode each job's ZIP once at posting time and store it
  (this same column powers the job board's radius search).
- Classify each job into a role family (SALES / SERVICE / OFFICE / MANAGEMENT)
  — a title-keyword mapping is fine to start.
- Public and cacheable; no PII. Regenerate at least nightly.

## 5. Install the sync script (owner, ~15 min)

1. Google Ads > Tools & Settings > Bulk Actions > **Scripts** > "+".
2. Paste `geo-sync.js`, click **Authorize**.
3. Preview once (dry-run view shows what it would change), then **Run** once
   the feed is live, then schedule **daily, 5–6 AM**.
4. Optionally set `NOTIFY_EMAIL` in the script CONFIG for a daily change digest.

Behavior notes:
- Adds a 20-mile circle per active-job city; removes circles when the last job
  there fills; pauses a campaign whose role family has no jobs anywhere and
  re-enables it when inventory returns.
- If the feed is down or empty it makes **no changes** — a broken feed can
  never strip your targeting.

## 6. Rollout plan and budget

- **Weeks 1–2 — pilot:** enable only `SMA Jobs - Sales` at $25–30/day.
  Licensed-sales roles are the highest-value fills and the clearest keywords.
  Expected CPCs for these terms: roughly $1–4.
- **Gate:** by ~$400 of spend you should see cost per application clearly.
  Under ~$25/application for licensed roles is a good result; iterate on
  negatives and ad copy if it's way above.
- **Weeks 3–4:** enable Service and Office at $10–15/day each, switch Sales
  to Target CPA once it has ~30 conversions.
- **Monthly:** review the search-terms report, prune negatives, and check that
  circle counts in the geo-sync digest track your job counts.

## 7. Later upgrades (not needed at launch)

- **Location-aware landing:** pass `&gloc={loc_physical_ms}` as a final-URL
  suffix and resolve Google's geo ID server-side (or geolocate by IP) to
  pre-fill the board's location box — lands each click on already-local
  results and lifts conversion rate.
- **Dynamic Search Ads:** once slugged job-detail URLs and the sitemap exist,
  add a DSA campaign over `/jobs/*` pages — Google auto-builds an ad per job
  and lands clicks directly on the job page. Lowest-maintenance way to cover
  every long-tail title; keep the same geo-synced targeting.
- **"Resume Uploaded" conversion** as a secondary optimization signal.
