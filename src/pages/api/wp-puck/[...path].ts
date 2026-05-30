import type { APIRoute } from 'astro'
import { getSessionFromRequest, cleanupSessions } from '@/lib/puck-auth'

// Proxy to the dc-puck REST contract on decoupled-wp:
//   GET  /wp-json/dc/v1/load/{id}
//   POST /wp-json/dc/v1/save/{id}
//   GET  /wp-json/dc/v1/mapping
// The frontend never holds WP credentials — it forwards the per-post
// edit token (minted by dc/v1/token/{id}) in the header the
// plugin reads.
const WP_URL = import.meta.env.WP_BASE_URL

async function handleRequest(request: Request, path: string, method: string) {
  try {
    if (!WP_URL) {
      return new Response(JSON.stringify({ error: 'WP_BASE_URL not configured' }), { status: 500 })
    }

    const wpUrl = `${WP_URL}/wp-json/dc/v1/${path}`

    const headers: Record<string, string> = {
      Accept: 'application/json',
    }

    // Both load (GET) and save (POST) hit dc-puck's can_edit gate,
    // which accepts the per-post edit token. The token lives in the
    // server-side session minted by /api/auth/validate; forward it on
    // every request, not just writes.
    cleanupSessions()
    const session = getSessionFromRequest(request)
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please open the editor from WordPress.' }),
        { status: 401 }
      )
    }
    headers['X-Dc-Puck-Token'] = session.token

    let body: string | undefined

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json'
      const rawBody = await request.json()
      body = JSON.stringify(rawBody)
    }

    const wpResponse = await fetch(wpUrl, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(30000),
    })

    const responseData = await wpResponse.json()
    return new Response(JSON.stringify(responseData), { status: wpResponse.status })
  } catch (error: any) {
    console.error('Puck proxy error:', error)
    return new Response(
      JSON.stringify({ error: `Puck proxy error: ${error.message}` }),
      { status: 502 }
    )
  }
}

export const GET: APIRoute = async ({ params, request }) => {
  return handleRequest(request, params.path!, 'GET')
}

export const POST: APIRoute = async ({ params, request }) => {
  return handleRequest(request, params.path!, 'POST')
}
