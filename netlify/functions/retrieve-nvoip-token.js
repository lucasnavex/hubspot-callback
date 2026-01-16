const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-nvoip-secret',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

// Storage abstraction - usa o mesmo storage que store-nvoip-token
const fs = require('fs')
const path = require('path')

const TOKENS_FILE = path.join('/tmp', 'nvoip-tokens.json')

// Função helper para ler tokens do storage
const readTokens = () => {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const data = fs.readFileSync(TOKENS_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Erro ao ler tokens:', error)
  }
  return {}
}

// Validação de segurança
const validateRequest = (event) => {
  const secret = process.env.NVOIP_SECRET
  if (!secret) {
    console.warn('NVOIP_SECRET não configurado - validando apenas origem')
  }

  const providedSecret = event.headers['x-nvoip-secret'] || event.headers['X-Nvoip-Secret']
  
  // Se secret estiver configurado, valida
  if (secret && providedSecret !== secret) {
    return { valid: false, error: 'Secret inválido ou ausente' }
  }

  return { valid: true }
}

// Normaliza query params
const normalizeQuery = (event) => {
  if (event.rawQuery) {
    return Object.fromEntries(new URLSearchParams(event.rawQuery))
  }
  return event.queryStringParameters ?? {}
}

// Valida se o token ainda é válido (não expirou)
const isTokenValid = (tokenData) => {
  if (!tokenData) return false
  
  if (tokenData.expiresAt) {
    const expiresAt = new Date(tokenData.expiresAt)
    const now = new Date()
    if (now >= expiresAt) {
      return false // Token expirado
    }
  }
  
  return true
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }

  // Apenas GET é permitido
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido. Use GET.' }),
    }
  }

  // Valida segurança
  const securityCheck = validateRequest(event)
  if (!securityCheck.valid) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: securityCheck.error }),
    }
  }

  // Parse query params
  const queryParams = normalizeQuery(event)
  const { portalId, accountId } = queryParams

  // Valida IDs
  if (!portalId || typeof portalId !== 'string' || portalId.trim() === '') {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'portalId é obrigatório na query string' }),
    }
  }

  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'accountId é obrigatório na query string' }),
    }
  }

  try {
    // Lê tokens do storage
    const allTokens = readTokens()
    
    // Busca token específico
    const key = `${portalId.trim()}:${accountId.trim()}`
    const tokenData = allTokens[key]

    // Verifica se token existe
    if (!tokenData) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Token não encontrado para este portalId e accountId' }),
      }
    }

    // Verifica se token ainda é válido
    if (!isTokenValid(tokenData)) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Token expirado ou inválido',
          expiresAt: tokenData.expiresAt,
        }),
      }
    }

    // Retorna tokens no formato esperado
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: tokenData.tokens.access_token,
        refresh_token: tokenData.tokens.refresh_token,
        expires_in: tokenData.tokens.expires_in,
        token_type: tokenData.tokens.token_type,
        scope: tokenData.tokens.scope,
        savedAt: tokenData.savedAt,
        expiresAt: tokenData.expiresAt,
      }),
    }
  } catch (error) {
    console.error('Erro ao processar retrieve token:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Erro interno ao recuperar token',
        message: error?.message || 'Erro desconhecido',
      }),
    }
  }
}
