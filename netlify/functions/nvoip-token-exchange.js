const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const normalizeQuery = (event) => {
  if (event.rawQuery) {
    return Object.fromEntries(new URLSearchParams(event.rawQuery))
  }

  return event.queryStringParameters ?? {}
}

const exchangeToken = async (code, redirectUri) => {
  const clientId =  DEFAULT_CLIENT_ID
  const clientSecret =  DEFAULT_CLIENT_SECRET
  const tokenUrl = process.env.HUBSPOT_TOKEN_URL ?? 'https://api.nvoip.com.br/auth/oauth2/token'

  if (!code || !redirectUri || !clientId || !clientSecret) return null

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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido' }),
    }
  }

  const queryParams = normalizeQuery(event)
  const code = queryParams.code
  const redirectUri = queryParams.redirect_uri ?? process.env.HUBSPOT_REDIRECT_URI

  if (!code || !redirectUri) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'code e redirect_uri são obrigatórios' }),
    }
  }

  try {
    const tokenResult = await exchangeToken(code, redirectUri)
    if (!tokenResult) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Credenciais incompletas para troca de token' }),
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokenResult),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: error?.message ?? 'Erro ao trocar token',
      }),
    }
  }
}
