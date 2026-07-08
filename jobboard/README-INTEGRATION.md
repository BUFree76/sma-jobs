# StaffMyAgency Job Board Replacement — Developer Integration Guide

Replaces the current page at `https://staffmyagency.com/Main/JobSearch`.

## What's in this package

- `JobSearch.html` — the complete replacement page: markup, styles, and behavior in one
  file. Ships with 20 sample jobs so it runs standalone in any browser. Everything you
  need to change is inside the block marked **DATA ADAPTER** at the top of the
  `<script>` section; the rest of the JS should not need edits.

## Why this rebuild (goals it must preserve)

1. **Linkable searches.** Every search/filter/page state is written to the query string
   (`history.replaceState`) and restored on load. This is what lets Google Ads land
   candidates on a pre-filtered page like
   `/Main/JobSearch?q=licensed+sales&loc=Orlando,+FL` — do not remove it.
2. **Server-rendered job cards.** Google must see job content in the initial HTML.
3. **Real filters** — employment type, license, minimum salary, sort — plus keyword,
   location, and radius.

## Integration (pick one)

### Option A — Server-side render (recommended)

Render the page as a Razor view. In the controller action for `Main/JobSearch`:

1. Read the query-string contract (below), run the search server-side (real geocoded
   radius search against your job table), and pass the current page of jobs to the view.
2. In the view, emit the jobs as both HTML (replace the empty `<ul id="jobList">` with
   rendered cards for the first paint) and as JSON:
   ```html
   <script>
     window.SMA_JOBS  = @Html.Raw(JsonSerializer.Serialize(Model.Jobs));
     window.SMA_TOTAL = @Model.TotalCount;
   </script>
   ```
3. Delete `SAMPLE_JOBS` from the file. `getJobs()` already prefers `window.SMA_JOBS`.

With Option A you may also convert the client-side filtering to full page loads
(standard GET form). That is simpler and even better for SEO; the JS filtering is a
progressive enhancement, not a requirement.

### Option B — JSON endpoint

Implement `GET /api/jobs` accepting the same query-string contract and returning
`{ total: number, jobs: Job[] }`, then replace the body of `getJobs()` with a `fetch()`.
Keep the initial page render server-side regardless, or Google sees an empty list.

## Query-string contract

| Param       | Type / values                          | Notes                                  |
|-------------|----------------------------------------|----------------------------------------|
| `q`         | string                                 | keyword — title, agency, description   |
| `loc`       | string                                 | city, state, or ZIP                    |
| `radius`    | `10` `25` `50` `100` (miles)           | only meaningful with `loc`; default 25 |
| `type`      | `FULL_TIME` `PART_TIME` (repeatable)   |                                        |
| `license`   | `P&C` `L&H` `None` (repeatable)        |                                        |
| `salaryMin` | number (annual USD)                    | match if job's salaryMax ≥ salaryMin   |
| `sort`      | `newest` (default) or `salary`         |                                        |
| `page`      | integer, 1-based                       | 8 per page in the demo — adjust freely |

## Job object contract

```json
{
  "id": "12345",
  "title": "Licensed Insurance Sales Representative",
  "agency": "Hartwell State Farm Agency",
  "city": "Suwanee", "state": "GA", "zip": "30024",
  "salaryMin": 37500, "salaryMax": 50000,
  "salaryUnit": "YEAR",
  "type": "FULL_TIME",
  "license": "P&C",
  "posted": "2026-07-06",
  "snippet": "First ~160 chars of the description, plain text…",
  "url": "/jobs/licensed-insurance-sales-representative-suwanee-ga/12345"
}
```

`url` should point at the job detail page. Today those are
`/Main/ApplyForJob/{token}/{token}` — see the SEO checklist for the recommended change.

Notes:
- `url` must be a **site-relative path** in production (e.g. `/Main/ApplyForJob/...`).
  Job title and Apply button are ordinary same-tab links — no `target="_blank"`, no
  external redirect. The demo data uses absolute `https://staffmyagency.com/...` URLs
  only so the hosted preview's links work; don't copy that pattern.
- `salaryUnit` is optional; `"YEAR"` is assumed. Use `"HOUR"` for hourly postings —
  the page renders "$/hr" and annualizes (×2080) for the minimum-salary filter and
  salary sort.
- `license` must come from the real job record. The demo file infers it from job
  titles, which is a placeholder only.
- The demo ships with 45 real listings captured from pages 1–3 of the live board on
  2026-07-08 so the preview looks authentic; they are a snapshot, not a data source.

## Resume database (candidate opt-in)

The page includes an "Upload your resume" banner and modal form. It POSTs
`multipart/form-data` to the URL in `RESUME_ENDPOINT` (top of the script, in the data
adapter block — currently `null`, which runs a simulated demo submit).

Implement `POST /api/resumes` receiving:

| Field      | Notes                                            |
|------------|--------------------------------------------------|
| `name`     | required                                         |
| `email`    | required — dedupe/upsert candidates on this key  |
| `phone`    | optional                                         |
| `location` | required, free text (city/state/ZIP) — geocode server-side so agencies can search by radius |
| `role`     | `ANY` `SALES` `SERVICE` `OFFICE` `MANAGEMENT`    |
| `license`  | `NONE` `P&C` `L&H` `BOTH`                        |
| `consent`  | `"on"` when checked (checkbox is required client-side) |
| `resume`   | file — client accepts .pdf/.doc/.docx up to 5 MB |

Server-side requirements (client checks are convenience only):

- Re-validate file type and size; virus-scan before storing; store outside the web
  root or in blob storage with access control.
- Record a consent timestamp with the submission — the form text promises agencies
  may view the resume and contact the candidate, and that removal can be requested.
  Provide a removal path (even just a support email) to keep that promise.
- Return 2xx on success; any non-2xx shows the form's error message.
- Rate-limit the endpoint; it is unauthenticated and accepts file uploads.

Agency-side search of this database is a separate build in the main SMA app
(filter by radius from their office, role, license) — this page only handles intake.

## SEO checklist (do these alongside the page swap)

These are what make the board findable organically and make ad landing pages score well:

1. **Slugged job detail URLs.** Add a route like
   `/jobs/{slug}/{id}` → existing ApplyForJob action (slug is display-only; resolve by
   id). 301-redirect the old token URLs.
2. **JobPosting JSON-LD on every job detail page** (not on the search page). Template:

   ```html
   <script type="application/ld+json">
   {
     "@context": "https://schema.org/",
     "@type": "JobPosting",
     "title": "Licensed Insurance Sales Representative",
     "description": "<p>Full HTML description…</p>",
     "datePosted": "2026-07-06",
     "validThrough": "2026-09-06T23:59",
     "employmentType": "FULL_TIME",
     "hiringOrganization": {
       "@type": "Organization",
       "name": "Hartwell State Farm Agency"
     },
     "jobLocation": {
       "@type": "Place",
       "address": {
         "@type": "PostalAddress",
         "streetAddress": "",
         "addressLocality": "Suwanee",
         "addressRegion": "GA",
         "postalCode": "30024",
         "addressCountry": "US"
       }
     },
     "baseSalary": {
       "@type": "MonetaryAmount",
       "currency": "USD",
       "value": { "@type": "QuantitativeValue", "minValue": 37500, "maxValue": 50000, "unitText": "YEAR" }
     },
     "identifier": { "@type": "PropertyValue", "name": "StaffMyAgency", "value": "12345" }
   }
   </script>
   ```

   Validate with Google's Rich Results Test. This is what gets listings into Google
   for Jobs — free, high-intent traffic.
3. **`<title>` and meta description per job page**, e.g.
   `Licensed Insurance Sales Rep — Suwanee, GA | $37.5k–$50k | StaffMyAgency`.
4. **Filled jobs return HTTP 410** (or 404) and drop out of the sitemap the day they
   close. Google penalizes boards that serve expired listings.
5. **`robots.txt` + `sitemap.xml`** (both currently 404). Sitemap should list every
   active job detail URL and every location landing page; regenerate nightly.
6. **Location landing pages** (phase 2): `/jobs/{state}/{city}` rendering this same
   board pre-filtered, with an indexable H1 like "12 insurance agency jobs in
   Suwanee, GA". These become the Google Ads landing pages.

## Google Ads notes

- Ad final URLs should use the query-string contract above (or the location landing
  pages once built) — never the unfiltered board.
- Fire the Ads conversion tag on the application-submit success event so campaigns can
  optimize to cost-per-application.

## Not included (deliberately)

- Geocoded radius search — needs a lat/lng column on jobs (geocode the ZIP once at
  posting time) and a distance query server-side. The radius dropdown is wired into the
  URL contract and ready for it.
- "Save job" / email alerts — good phase-2 features; alerts also build a candidate
  email list you own.
- Agency-facing candidate search UI for the resume database — belongs in the
  authenticated SMA app, not on the public board.
