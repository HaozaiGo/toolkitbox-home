# ToolkitBox Home

Navigation homepage for ToolkitBox.

## Domains

- https://toolkitbox.org/
- https://www.toolkitbox.org/

## Deployment

Hosted on Vercel. The linked project is `toolkitbox-home`. Deployment does not require a Git push.

## Content Regression Checks

Run from this directory. The browser smoke uses installed Google Chrome, a temporary local HTTP server, and pinned test dependencies. It closes its server/browser and writes ignored evidence under `.artifacts/`.

```sh
npm exec --yes --package=linkedom@0.18.12 -- node scripts/validate-content.cjs
npm exec --yes --package=linkedom@0.18.12 --package=playwright@1.56.1 -- node scripts/smoke-content.cjs
```

Add `--base https://toolkitbox.org` to the smoke command to test deployed status codes and redirects rather than the local server. Browser layout tests block third-party scripts; they do not certify advertising, analytics, consent, or tool-subdomain behavior. The CMP API is mocked only for adapter regression checks.

## Maintenance Boundaries

- After changes to `privacy-controls.js`, run `node scripts/sync-tool-privacy.cjs` from this repository to copy the same-origin revocation adapter to the eight sibling tool repos. `--check` verifies the copies without editing them. Each affected tool must be deployed independently; deploying this homepage alone does not update the tools.
- In Search Console, submit the root sitemap and each tool subdomain's own `/sitemap.xml` under the verified domain property. The root sitemap intentionally lists only root-host pages. Submission/discovery is not indexing or AdSense approval.

- Sitemap dates are omitted because reliable per-page significant-change evidence is incomplete. Do not mass-stamp a release date into `lastmod`.
- Keep English/Chinese counterparts, canonical metadata, index links, and redirect destinations in sync. Consolidation must preserve the source topic, including direct `index.html` entry points.
- Procedures and screenshots are not completed test reports. Record URL/version, environment, input, expected/actual output, and evidence for any claimed result.
- CMP publication and regional behavior remain unverified account configuration. The current AdSense UI exposes a generic account-not-approved state and cannot establish or publish a CMP. Confirm the provider and published message, domain/subdomain coverage, regional consent and withdrawal behavior, and ad-request gating in the dashboard before treating this as resolved. Privacy fallback links are not a CMP.
- A generic rejection-email content tip is not a site-specific diagnosis. These improvements do not guarantee AdSense approval; no submission is automated.
