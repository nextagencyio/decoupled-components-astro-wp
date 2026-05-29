import type { APIRoute } from 'astro'
import { createSession, COOKIE_NAME, cleanupSessions } from '@/lib/puck-auth'

// Validate a per-post edit token against spark-puck on decoupled-wp.
// The WP plugin's contract is { postId, token } -> { valid: bool }
// (leaner than Drupal's, which echoed user/node). The editor is opened
// from wp-admin with ?postId=&token= in the URL, so we already know the
// post id; on a valid token we mint a server-side session scoped to it.
const WP_URL = import.meta.env.WP_BASE_URL

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!WP_URL) {
      return new Response(JSON.stringify({ error: 'WP_BASE_URL not configured' }), { status: 500 })
    }

    const { token, postId } = await request.json()

    if (!token || !postId) {
      return new Response(JSON.stringify({ error: 'Missing token or postId' }), { status: 400 })
    }

    const res = await fetch(`${WP_URL}/wp-json/spark-puck/v1/validate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, postId }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json()

    if (!res.ok || !data.valid) {
      return new Response(
        JSON.stringify({ error: 'Token validation failed' }),
        { status: 401 }
      )
    }

    // Create a server-side session scoped to this post.
    cleanupSessions()
    const sessionId = createSession(
      'wp-editor', // spark-puck token is post-scoped, not user-scoped
      'WordPress Editor',
      String(postId),
      token
    )

    const isProduction = import.meta.env.PROD
    const cookieFlags = `HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${8 * 60 * 60}`

    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.append('Set-Cookie', `${COOKIE_NAME}=${sessionId}; ${cookieFlags}`)
    headers.append('Set-Cookie', `puck_token=${token}; ${cookieFlags}`)

    return new Response(JSON.stringify({
      success: true,
      // spark-puck tokens are post-scoped, not user-scoped, so there's
      // no real WP user identity to surface. Return a stable editor
      // identity so the Puck island has the { user: { uid, name } } shape
      // it shares with the Drupal flow.
      user: { uid: 'wp-editor', name: 'WordPress Editor' },
      node: { nid: postId },
    }), { headers })
  } catch (error: any) {
    console.error('Auth validation error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
