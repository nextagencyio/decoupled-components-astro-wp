/**
 * WPGraphQL read client for decoupled-wp.
 *
 * Hand-written (vs. the Drupal codegen'd schema/client) because the WP
 * GraphQL surface the frontend needs is small and stable: fetch a page
 * or resource by slug, with its shared Spark fields + components. Public
 * reads need no auth (the spark-core model exposes content to anon).
 *
 * The component contract: every component is a `SparkComponent`
 * discriminated by `kind` (richtext | cta | gallery | embed), with all
 * possible props as nullable fields. The renderer dispatches on `kind`.
 */

import { isDemoMode } from './demo-mode'
import { createMockClient } from './mock-client'

export interface SparkImage {
  src: string
  alt: string
}

export interface SparkComponent {
  __typename: 'SparkComponent'
  kind: string
  html?: string | null
  heading?: string | null
  text?: string | null
  buttonLabel?: string | null
  buttonUrl?: string | null
  images?: SparkImage[] | null
}

export interface SparkEntry {
  __typename: string
  databaseId: number
  title: string
  slug: string
  uri?: string | null
  heroImage?: SparkImage | null
  introParagraphs?: string[] | null
  metaDescription?: string | null
  components?: SparkComponent[] | null
  bodyHtml?: string | null
}

const COMPONENT_FIELDS = `
  __typename
  kind
  html
  heading
  text
  buttonLabel
  buttonUrl
  images { src alt }
`

const ENTRY_FIELDS = `
  __typename
  databaseId
  title
  slug
  uri
  heroImage { src alt }
  introParagraphs
  metaDescription
  bodyHtml
  components { ${COMPONENT_FIELDS} }
`

function gqlEndpoint(): string {
  const explicit = import.meta.env.WP_GRAPHQL_URL
  if (explicit) return explicit
  const base = import.meta.env.WP_BASE_URL
  if (!base) throw new Error('WP_BASE_URL / WP_GRAPHQL_URL not configured')
  return `${base}/graphql`
}

async function query<T = any>(q: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(gqlEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables }),
    signal: AbortSignal.timeout(30000),
  })
  const json = await res.json()
  if (json.errors) {
    throw new Error('WPGraphQL error: ' + JSON.stringify(json.errors))
  }
  return json.data as T
}

/**
 * Normalize a path to a slug. '/', '/home', '/home/' → 'home' (the
 * homepage convention is a page slugged 'home'); '/resources/foo/' →
 * 'foo'. We try a page first, then a resource.
 */
function pathToSlug(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  if (trimmed === '' || trimmed === 'node/1') return 'home'
  const parts = trimmed.split('/')
  return parts[parts.length - 1]
}

export interface WpClient {
  getEntryByPath(path: string): Promise<SparkEntry | null>
  raw<T = any>(q: string, variables?: Record<string, unknown>): Promise<T>
}

function liveClient(): WpClient {
  return {
    async getEntryByPath(path: string): Promise<SparkEntry | null> {
      const slug = pathToSlug(path)

      // Try a page by slug.
      const pageData = await query<{ pageBy?: { __typename: string } | null }>(
        `query($slug:ID!){ page(id:$slug, idType:URI){ ${ENTRY_FIELDS} } }`,
        { slug },
      ).catch(() => null)
      if (pageData?.page) return pageData.page as unknown as SparkEntry

      // Fall back to a resource by slug. (CPTs use idType:SLUG;
      // the built-in page type uses idType:URI above.)
      const resData = await query<{ resource?: SparkEntry | null }>(
        `query($slug:ID!){ resource(id:$slug, idType:SLUG){ ${ENTRY_FIELDS} } }`,
        { slug },
      ).catch(() => null)
      if (resData?.resource) return resData.resource

      return null
    },
    raw: query,
  }
}

export function getClient(): WpClient {
  if (isDemoMode()) {
    return createMockClient() as unknown as WpClient
  }
  return liveClient()
}
