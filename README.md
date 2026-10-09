# PureGamma Research website

Static research and composite-strategy website deployed at https://pgresearch.org/.

## Pages

- `index.html`: PG Composite Strategy, reported performance, architecture, methodology, and institutional access.
- `research.html`: research methods, paper abstracts, and reading materials.
- `framework.html`: signal, portfolio, execution, and review framework.
- `legal.html`: existing risk disclosure, client-service boundaries, website terms, and privacy notice.

The current pages share `pg-release-20261009.css` and `pg-release-20261009.js`. The contact handler reads SMTP credentials and form secrets from the server's private configuration; these are not in this repository.

## Performance source

The October 2026 release uses the supplied `PG-CTA_2026-10-09.xlsx`, with 1,500 daily NAV observations from September 1, 2022 through October 9, 2026. The workbook itself is not published. Its reported series is in `assets/performance/net-value-data-20261009.js`.

- Cumulative return: last NAV / first NAV − 1.
- Annualized return: (last NAV / first NAV)^(365.25 / elapsed calendar days) − 1.
- Drawdown: NAV / running peak − 1.
- Annual and monthly returns: closing NAV / prior period closing NAV − 1, using the first observation for the initial partial period.

September–December 2022, October 2026, and year-to-date 2026 are labeled as partial periods. Component-level returns and external benchmark results are not inferred from the composite series.

When refreshing the reported series, also refresh the static headline values, yearly and monthly tables, source dates, hero sparkline, static fallback SVG, and asset cache versions in `index.html`. Keep the calculations and published period labels consistent.

## Local preview

Serve the repository root using any static web server. PHP is required for the contact endpoint; a static preview can display the form but cannot deliver inquiries.

## Contacts

- BP: noreply@puregamma.ai
- LP and website inquiries: chris@puregamma.ai

## Validation

The release was checked on desktop and mobile layouts. NAV and drawdown tabs support pointer, touch, and keyboard inspection. Monthly returns reconcile to the yearly and inception-to-date results. Contact validation and challenge availability can be checked without submitting an email.
