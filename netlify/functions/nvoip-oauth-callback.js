const DEFAULT_REDIRECT = 'https://app.hubspot.com/';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const parseState = (value) => {
  if (!value) return null
  try {
    const json = Buffer.from(value, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch (error) {
    console.warn('Erro ao decodificar state', error)
    return null
  }
}

const buildDestinationUrl = (decodedState, fallback) => {
  const returnUrl =
    decodedState?.returnUrl ??
    decodedState?.return_url ??
    decodedState?.returnTo ??
    decodedState?.return_to ??
    fallback ??
    DEFAULT_REDIRECT

  try {
    return new URL(returnUrl)
  } catch {
    return new URL(fallback ?? DEFAULT_REDIRECT)
  }
}

const buildQuery = (destination, queryParams) => {
  const { code, state, error, ...rest } = queryParams
  if (code) destination.searchParams.set('nvoip_code', code)
  if (state) destination.searchParams.set('nvoip_state', state)
  if (error) destination.searchParams.set('error', error)

  Object.entries(rest).forEach(([key, value]) => {
    if (!value) return
    destination.searchParams.set(key, value)
  })

  return destination
}

const normalizeQuery = (event) => {
  if (event.rawQuery) {
    return Object.fromEntries(new URLSearchParams(event.rawQuery))
  }

  return event.queryStringParameters ?? {}
}

const exchangeToken = async (code, redirectUri) => {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
  const tokenUrl = process.env.HUBSPOT_TOKEN_URL ?? 'https://api.nvoip.com.br/auth/oauth2/token'

  if (!code || !clientId || !clientSecret) return null

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange falhou (${response.status}): ${error}`)
  }

  return response.json()
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }

  const queryParams = normalizeQuery(event)
  const { state } = queryParams
  const decodedState = parseState(state)
  const destination = buildDestinationUrl(
    decodedState,
    process.env.HUBSPOT_REDIRECT_URI ?? 'https://hubspot-callback.netlify.app/nvoip-oauth-callback',
  )

  let tokenResult = null
  let tokenError = null
  if (queryParams.code) {
    try {
      tokenResult = await exchangeToken(queryParams.code, destination.toString())
    } catch (error) {
      tokenError = error?.message ?? 'Erro ao trocar token'
    }
  }

  buildQuery(destination, queryParams)
  if (decodedState?.portalId) destination.searchParams.set('portalId', decodedState.portalId)
  if (decodedState?.accountId) destination.searchParams.set('accountId', decodedState.accountId)

  const body = JSON.stringify({
    message: 'Redirecting to HubSpot with the decoded state',
    destination: destination.toString(),
    parsedState: decodedState,
    tokenResult,
    tokenError,
  })

  return {
    statusCode: 302,
    headers: {
      ...corsHeaders,
      Location: destination.toString(),
    },
    body,
  }
}
