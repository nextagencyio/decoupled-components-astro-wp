# WordPress port status

This is a fork of `decoupled-components-astro` (the Drupal + Puck Astro
starter) repointed at `decoupled-wp` (WordPress + spark-core +
spark-puck). It pairs with the WP product the way the original pairs
with `decoupled-project`.

## Done

- **Puck save/load proxy** → `src/pages/api/wp-puck/[...path].ts`
  forwards to `/wp-json/spark-puck/v1/{load,save,mapping}`, passing the
  per-post edit token in the `X-Spark-Puck-Token` header spark-puck
  reads. (Replaces the Drupal `drupal-puck` proxy.)
- **Token validate** → `src/pages/api/auth/validate.ts` calls
  `/wp-json/spark-puck/v1/validate-token` with `{postId, token}` and
  mints a post-scoped server session.
- **GraphQL proxy** → `src/pages/api/graphql.ts` forwards to
  `<WP_BASE_URL>/graphql`. WPGraphQL public reads need no auth (unlike
  Drupal's OAuth client-credentials), so the proxy is auth-free.
- **Env** → `.env.example` uses `WP_BASE_URL` (+ optional
  `WP_GRAPHQL_URL`) instead of `DRUPAL_*`.
- Removed the Drupal-only `jsonapi` proxy.

## Remaining (the read layer)

The page render path still uses the Drupal-codegen'd typed client
(`lib/drupal-client.ts` + `schema/client.ts`, generated from Drupal's
GraphQL schema). To finish:

1. **Regenerate `schema/`** against `decoupled-wp`'s WPGraphQL endpoint
   (`<WP_BASE_URL>/graphql`), OR hand-write a thin `lib/wp-client.ts`
   implementing the same small `TypedClient` surface the pages use:
   `getEntryByPath(path)`, `getEntries(type)`, `getEntry(type,id)`,
   `raw(query,vars)`.
2. **Map the query shape** from Drupal nodes to the WP model: the WP
   GraphQL exposes `pages`/`resources` with shared fields `bodyHtml`,
   `heroImage { src alt }`, `introParagraphs`, `components { ... }`,
   `metaDescription`. The page components in `src/components/` expect
   the Drupal field names — align them to these.
3. **Point `getClient()`** (`lib/drupal-client.ts`) at the WP client;
   keep the demo-mode mock path.

This step needs a reachable WPGraphQL endpoint to codegen/verify
against; it was deferred because the build sandbox can't reach the
DDEV HTTPS endpoint over the wire (the spark-puck transform itself was
verified directly in PHP via wp-cli, which does work).

## Verifying locally

```bash
cp .env.example .env   # set WP_BASE_URL to your decoupled-wp site
npm install
npm run dev
```

Open the editor from wp-admin (spark-puck mints a token); the proxy
forwards load/save to spark-puck. For the public render path, finish
the read layer above first.
