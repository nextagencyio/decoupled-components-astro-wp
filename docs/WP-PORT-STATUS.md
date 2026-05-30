# WordPress port status

This is a fork of `decoupled-components-astro` (the Drupal + Puck Astro
starter) repointed at `decoupled-wp` (WordPress + dc-core +
dc-puck). It pairs with the WP product the way the original pairs
with `decoupled-project`.

## Done

- **Puck save/load proxy** → `src/pages/api/wp-puck/[...path].ts`
  forwards to `/wp-json/dc/v1/{load,save,mapping}`, passing the
  per-post edit token in the `X-Dc-Puck-Token` header dc-puck
  reads. (Replaces the Drupal `drupal-puck` proxy.)
- **Token validate** → `src/pages/api/auth/validate.ts` calls
  `/wp-json/dc/v1/validate-token` with `{postId, token}` and
  mints a post-scoped server session.
- **GraphQL proxy** → `src/pages/api/graphql.ts` forwards to
  `<WP_BASE_URL>/graphql`. WPGraphQL public reads need no auth (unlike
  Drupal's OAuth client-credentials), so the proxy is auth-free.
- **Env** → `.env.example` uses `WP_BASE_URL` (+ optional
  `WP_GRAPHQL_URL`) instead of `DRUPAL_*`.
- Removed the Drupal-only `jsonapi` proxy.

## Read layer — done

- **`lib/wp-client.ts`** — hand-written WPGraphQL client (replaces the
  Drupal codegen'd `schema/client`). `getEntryByPath(path)` resolves a
  slug, queries `page(idType:URI)` then falls back to
  `resource(idType:SLUG)`, returning a `DcEntry` with shared fields
  (`heroImage{src alt}`, `introParagraphs`, `metaDescription`,
  `bodyHtml`, `components`). Public reads, no auth.
- **`src/components/DcComponents.astro`** — renders the component
  list, dispatching on `component.kind` (richtext | cta | gallery |
  embed) — the WP analogue of the Drupal `ParagraphRenderer` (which
  dispatched on per-type `__typename`).
- **`src/pages/index.astro` + `[...slug].astro`** — rewired to
  `wp-client` + `DcComponents`.
- Removed the orphaned `lib/drupal-client.ts` + `lib/drupal-utils.ts`.

Verified: the site **builds clean** (`npm run build`), and the exact
GraphQL queries the client issues were validated against the live
`decoupled-wp` schema via wp-cli (`page(id:"home",idType:URI)` and
`resource(id:"getting-started",idType:SLUG)` both return the expected
shape). The HTTP hop itself wasn't exercised from the build sandbox
(can't reach the DDEV HTTPS endpoint over the wire) — run `npm run dev`
against a reachable `WP_BASE_URL` to see it live.

## Component-set reconciliation (next content-model decision)

The original Drupal starter shipped a rich paragraph palette (Hero,
CardGroup, Pricing, Stats, Accordion, Quote, LogoCollection,
Newsletter, …) under `src/components/paragraphs/`. The WP model's
component set is currently coarse (richtext / cta / gallery / embed).
`DcComponents.astro` renders the WP set; the richer Drupal paragraph
components are still in the tree but unused.

To reach full palette parity, either:
1. **Expand the WP model's component set** (add hero/cards/pricing/etc.
   to dc-core's components field + GraphQL) and extend
   `DcComponents.astro` to render them, or
2. **Keep WP coarse** and delete the unused Drupal paragraph components.

This is a content-model call, not a wiring task — tracked here.

## Verifying locally

```bash
cp .env.example .env   # set WP_BASE_URL to your decoupled-wp site
npm install
npm run dev
```

Open the editor from wp-admin (dc-puck mints a token); the proxy
forwards load/save to dc-puck. For the public render path, finish
the read layer above first.
