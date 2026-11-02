# Kalpavruksha corporate website

A 23-page, server-rendered corporate website with a static export, responsive editorial layouts, local illustrative imagery, keyboard-accessible menus, reduced-motion support, educational market charts, topic filters and a validated enquiry endpoint.

## Run locally

Requires Node.js 22 or later. There are no third-party runtime dependencies.

```powershell
npm run dev
```

Open http://localhost:3000. For a stable production process use `npm start` behind an HTTPS reverse proxy. Set `NODE_ENV=production` in the deployment environment.

```powershell
npm run check
npm test
npm run build
```

`dist/` contains pre-rendered HTML for every route. The Node server renders the same templates and supplies `/api/contact`. A static-only deployment **does not enable enquiry delivery**. Use the Node server for the full application.

## Initial audit and implementation map

The supplied workspace was empty. There was no existing framework, router, Git repository, stylesheet, logo, font, verified business photography, backend or deployment configuration to preserve. This implementation uses native Node.js modules and semantic HTML/CSS/JavaScript without introducing a framework migration.

| File | Purpose |
| --- | --- |
| `src/brand.mjs` | Central provisional palette, wordmark configuration and brand approval flag |
| `src/content.mjs` | All page-specific content, business identities, educational notes and FAQs |
| `src/render.mjs` | Reusable page heroes, editorial sections, charts, cards, form, header, footer and metadata |
| `src/home.mjs` | Cinematic homepage, selectable business scenes and varied editorial compositions |
| `src/contact.mjs` | Validation, abuse limits, anti-spam checks and verified provider responses |
| `server.mjs` | Server-rendered routes, public assets, security headers and contact API |
| `public/styles.css` | Responsive layout, motion, interaction and reduced-motion styles |
| `public/brand.css` | Official logo display and brand-specific treatment |
| `public/experience.css` | Image mosaic, cinematic page heroes, layered layouts and responsive refinements |
| `public/businesses.css` | Supplied business logo presentation across navigation, showcases and business pages |
| `public/app.js` | Menus, scroll reveals, topic filters, enquiry prefilling and form submission |
| `scripts/build.mjs` | Deterministic local static export and sitemap generation |
| `tests/site.test.mjs` | Route, asset, metadata, validation, API and delivery failure checks |
| `tests/interactions.test.mjs` | Scene selection, deferred media and accessible keyboard navigation |
| `vercel.json` | Explicit static build, output directory, clean page URLs and response headers |

## Page architecture

- Corporate: `/`, `/about`, `/vision`, `/businesses`, `/leadership`, `/corporate-office`.
- Wealth: `/wealth`, `/wealth/indian-markets`, `/wealth/forex`, `/wealth/market-insights`, `/wealth/financial-awareness`.
- Property: `/real-estate`, `/real-estate/properties`, `/real-estate/development`, `/real-estate/projects`.
- Other businesses: `/businesses/kv-constructions`, `/businesses/rudraksh-enterprises`, `/businesses/brindavan-resto`.
- Information: `/contact`, `/faq`, `/privacy-policy`, `/terms`, `/disclaimer`.

Navigation groups the routes into Company, Businesses and Perspectives. Each route has a unique title, description, canonical URL, one h1, semantic content and internal links. The sitemap includes all 23 pages. Preview indexing is disabled by default.

## Brand assets and publication review

The user-supplied official logo (`Kapla_logo-removebg-preview.png`) is preserved unchanged in `public/assets/kalpavruksha-logo.png` and used in the header, footer and browser icon. The primary gold (`#fbb634`) is sampled from its lettering; black, white and supporting neutral tones follow its visual treatment. CSS removes only the display of transparent outer padding, keeping the artwork and embedded tagline intact. The logo’s Kannada lettering and “WEALTH. GROWTH. LIFE.” tagline are preserved. System serif/sans typography and the complete palette application still require final brand review; no separate font files or full brand guide were supplied. Update `src/brand.mjs` and CSS font tokens when those are available; set `brand.approved` only after review. The abstract rings are an editorial growth motif, not an official emblem.

The five supplied business logos are copied unchanged from the matching `Downloads/Kalpa_Team_Logos` files: `Wealth.png`, `Kranvagn.png`, `Real-estate.png`, `Rudraksh.png` and `Brindavan.png`. Their original lettering, colours and square proportions are preserved on white presentation surfaces. They appear in the homepage identity gallery and business scenes, navigation, business cards, relevant page heroes, feature sections and business footer links. This logo presentation was restored at the user's request. The company order is Kalpavruksha Wealth, KV Constructions, Kalpavruksha Real Estate & Developers, Rudraksh Enterprises, Brindavan Resto. KV’s independent relationship is a named data attribute rather than a position-dependent label.

The website does not invent leadership profiles, property listings, project approvals, testimonials, financial registrations or returns. KV Constructions is explicitly independent and not owned by Kalpavruksha. All charts are schematic and labelled illustrative. Rudraksh is presented as a building materials retailer using a conceptual product display. Dining details, menus and hours are not invented.

The office milestone is the **planned opening on 15 November 2026**, not the organization’s founding date. Confirm event status and update the page if publishing after that date. The supplied location is Bidar, Karnataka, India; no unverified street address is published.

Legal pages are drafts. Confirm the responsible legal entity, privacy contact, retention period, processors and final terms before launch. Source references for forex restrictions and the NIFTY 50 are linked in the relevant educational pages. They do not establish any authorization for Kalpavruksha.

## Enable real enquiry delivery

Copy `.env.example` to `.env` and set the verified values, or provide them through your hosting platform’s secret manager:

- `SITE_URL`: the exact public origin, e.g. `https://your-approved-domain.example`. This controls canonicals and origin verification.
- `RESEND_API_KEY`: a server-only API key from the email provider.
- `CONTACT_FROM`: a sender verified by the email provider.
- `CONTACT_TO`: the verified destination business inbox.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: anti-spam configuration for the deployed hostname. Both are required for production form availability.
- `TRUST_PROXY`: leave false unless a trusted proxy replaces forwarded IP headers. Configure the proxy to remove client-supplied forwarding headers.

Restart after changing the environment. Secrets are never rendered into the client. The user will supply verified delivery details before finalization. Form delivery remains disabled until that configuration is present. The provider must return an accepted email ID before the UI shows confirmation; acceptance is not a guarantee that an email reached the recipient’s inbox. No real email delivery was attempted during development.

The API requires same-origin JSON requests, bounds request bodies to 16 KiB, validates every field and consent, checks the honeypot, validates Turnstile server-side and limits each client to five attempts per 15 minutes. Rate limits are in memory for a single Node process. A horizontally scaled deployment must use shared limits or equivalent edge rate limiting. The app does not persist form data locally. Configure business inbox retention deliberately.

## Deployment

### Vercel

Connect `kalpavruksha-cloud/Website`, deploy the `main` branch and leave the Root Directory at the repository root. The committed `vercel.json` selects the Other framework preset, runs `npm run build` and publishes `dist`. Clean URLs map each route to its own generated HTML file: `/about` uses `dist/about.html`, and `/wealth/forex` uses `dist/wealth/forex.html`. This preserves genuine page content on direct visits and refreshes; unknown paths use `404.html`.

If an earlier deployment showed a Vercel 404, deploy the latest commit. In Settings → Build and Deployment, verify the Root Directory is the repository root. The build command and output directory are defined in the repository configuration. Inspect deployment Build Logs if the build fails.

Set `SITE_URL` to the approved public origin when available. Otherwise Vercel's production domain, or its deployment domain, supplies canonical and sitemap URLs automatically. Preview indexing remains disabled until `PUBLIC_SITE=true` is deliberately configured after review.

This Vercel configuration publishes the static website. The persistent Node server and contact API are not deployed by this configuration, and the contact form stays disabled. Email delivery needs a separate Vercel Function integration or a Node hosting deployment when the verified delivery details are supplied.

### Node server and publication review

1. Apply approved branding and verify all business and legal content.
2. Configure the actual origin, email delivery and anti-spam secrets.
3. Run the checks and start the Node service behind HTTPS.
4. Verify a real enquiry arrives in the intended inbox and test delivery failures.
5. Perform desktop, mobile, keyboard and reduced-motion visual review.
6. Set `PUBLIC_SITE=true` after launch review and restart/rebuild. This enables indexing and changes robots.txt. Do not publish the default localhost canonicals.

The source is uploaded to GitHub. Vercel configuration is included for the user's connected deployment. Browser UI verification was attempted but Computer Use ended because it could not confidently establish Chrome’s current URL. Automated checks cover routes, the static deployment output and server behaviour; visual responsiveness and interaction verification still require a working browser session.

## Asset provenance

Photographs are locally downloaded illustrative Unsplash images, not verified company facilities or projects:

- Architecture: https://unsplash.com/photos/1486406146926-c627a92ad1ab (image identifier `photo-1486406146926-c627a92ad1ab`).
- Residence: image identifier `photo-1600607687920-4e2a09cf159d`.
- Construction: image identifier `photo-1504307651254-35680f356dfd`.
- Dining: image identifier `photo-1517248135467-4c7edcad34c4`.
- Markets: image identifier `photo-1611974789855-9c2a0a7236a3`.

Original image endpoint: `https://images.unsplash.com/{identifier}?auto=format&fit=crop&w=1800&q=82`. The custom `materials.svg` depicts a conceptual retail materials display. An unused downloaded interior image (`materials.jpg`) is not shown on the website. Confirm image licensing and approved replacements as part of launch review.
