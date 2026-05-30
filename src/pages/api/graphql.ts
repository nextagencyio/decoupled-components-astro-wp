import type { APIRoute } from 'astro'

// WPGraphQL proxy. Unlike Drupal (OAuth client-credentials), WPGraphQL
// serves public read queries with no auth — the dc-core model
// exposes content types to the anonymous role. Authenticated mutations
// (if ever needed) would add a JWT via wp-graphql-jwt-authentication;
// the read path the frontend uses needs none.
const WP_URL = import.meta.env.WP_BASE_URL
const WP_GRAPHQL_URL = import.meta.env.WP_GRAPHQL_URL // optional explicit override

function endpoint(): string | null {
  if (WP_GRAPHQL_URL) return WP_GRAPHQL_URL
  if (WP_URL) return `${WP_URL}/graphql`
  return null
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const url = endpoint()
    if (!url) {
      return new Response(
        JSON.stringify({ errors: [{ message: 'WP_BASE_URL / WP_GRAPHQL_URL not configured' }] }),
        { status: 500 }
      )
    }

    const body = await request.json()

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })

    const data = await response.json()
    return new Response(JSON.stringify(data), { status: response.status })
  } catch (error) {
    console.error('GraphQL proxy error:', error)
    return new Response(
      JSON.stringify({ errors: [{ message: 'GraphQL request failed' }] }),
      { status: 500 }
    )
  }
}
