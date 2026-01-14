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

  buildQuery(destination, queryParams)
  if (decodedState?.portalId) destination.searchParams.set('portalId', decodedState.portalId)
  if (decodedState?.accountId) destination.searchParams.set('accountId', decodedState.accountId)

  const body = JSON.stringify({
    message: 'Redirecting to HubSpot with the decoded state',
    destination: destination.toString(),
    parsedState: decodedState,
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
