const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-nvoip-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Storage abstraction - por padrão usa arquivo JSON local
// Para produção, migre para DynamoDB ou Firestore
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

// Função helper para escrever tokens no storage
const writeTokens = (tokens) => {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8')
    return true
  } catch (error) {
    console.error('Erro ao escrever tokens:', error)
    return false
  }
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

// Validação de portalId/accountId
const validateIds = (portalId, accountId) => {
  if (!portalId || typeof portalId !== 'string' || portalId.trim() === '') {
    return { valid: false, error: 'portalId é obrigatório e deve ser uma string válida' }
  }
  
  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    return { valid: false, error: 'accountId é obrigatório e deve ser uma string válida' }
  }

  // Validação adicional: pode adicionar whitelist de portalIds se necessário
  // const allowedPortals = process.env.ALLOWED_PORTAL_IDS?.split(',') || []
  // if (allowedPortals.length > 0 && !allowedPortals.includes(portalId)) {
  //   return { valid: false, error: 'portalId não autorizado' }
  // }

  return { valid: true }
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

  // Apenas POST é permitido
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Método não permitido. Use POST.' }),
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

  // Parse body
  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch (error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Body JSON inválido' }),
    }
  }

  const { portalId, accountId, tokens } = body

  // Valida IDs
  const idCheck = validateIds(portalId, accountId)
  if (!idCheck.valid) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: idCheck.error }),
    }
  }

  // Valida tokens
  if (!tokens || typeof tokens !== 'object') {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'tokens é obrigatório e deve ser um objeto' }),
    }
  }

  if (!tokens.access_token) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'tokens.access_token é obrigatório' }),
    }
  }

  try {
    // Calcula expiresAt se expires_in estiver presente
    const savedAt = new Date().toISOString()
    let expiresAt = null
    if (tokens.expires_in && typeof tokens.expires_in === 'number') {
      expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    }

    // Prepara o objeto para armazenar
    const tokenData = {
      portalId: portalId.trim(),
      accountId: accountId.trim(),
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_in: tokens.expires_in || null,
        token_type: tokens.token_type || 'Bearer',
        scope: tokens.scope || null,
      },
      savedAt,
      expiresAt,
    }

    // Lê tokens existentes
    const allTokens = readTokens()
    
    // Cria chave única por portalId + accountId
    const key = `${portalId}:${accountId}`
    
    // Atualiza ou cria novo registro
    allTokens[key] = tokenData
    
    // Salva no storage
    const saved = writeTokens(allTokens)
    
    if (!saved) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Erro ao salvar token no storage' }),
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: 'Token armazenado com sucesso',
        savedAt,
        expiresAt,
      }),
    }
  } catch (error) {
    console.error('Erro ao processar store token:', error)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Erro interno ao armazenar token',
        message: error?.message || 'Erro desconhecido',
      }),
    }
  }
}
