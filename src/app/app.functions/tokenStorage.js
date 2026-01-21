const tokenStore = new Map()

const respond = (statusCode, payload) => ({
  statusCode,
  body: payload,
  headers: {
    'Content-Type': 'application/json',
  },
})

const buildKey = (portalId, accountId) => `${portalId}:${accountId}`

const normalizeParams = (params = {}) => {
  const normalized = {}
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      normalized[key] = value.length > 0 ? value[0] : ''
    } else if (value === undefined || value === null) {
      normalized[key] = ''
    } else {
      normalized[key] = value
    }
  }
  return normalized
}

const isValidId = (value) => typeof value === 'string' && value.trim().length > 0

const validatePortalAccount = (portalId, accountId) => {
  if (!isValidId(portalId)) {
    return respond(400, { error: 'portalId é obrigatório e deve ser uma string não vazia.' })
  }

  if (!isValidId(accountId)) {
    return respond(400, { error: 'accountId é obrigatório e deve ser uma string não vazia.' })
  }

  return null
}

const handleStore = (body = {}) => {
  const { portalId, accountId, tokens } = body

  const validationError = validatePortalAccount(portalId, accountId)
  if (validationError) {
    return validationError
  }

  if (!tokens || typeof tokens !== 'object') {
    return respond(400, { error: 'tokens é obrigatório e deve ser um objeto.' })
  }

  if (!isValidId(tokens.access_token)) {
    return respond(400, { error: 'tokens.access_token é obrigatório.' })
  }

  const key = buildKey(portalId, accountId)
  const storedTokens = {
    ...tokens,
    storedAt: new Date().toISOString(),
  }

  tokenStore.set(key, storedTokens)

  return respond(200, { portalId, accountId, tokens: storedTokens })
}

const handleRetrieve = (params = {}) => {
  const { portalId, accountId } = normalizeParams(params)

  const validationError = validatePortalAccount(portalId, accountId)
  if (validationError) {
    return validationError
  }

  const key = buildKey(portalId, accountId)

  if (!tokenStore.has(key)) {
    return respond(404, { error: 'Tokens não encontrados para este portal/account.' })
  }

  const tokens = tokenStore.get(key)

  return respond(200, { portalId, accountId, tokens })
}

exports.main = async (context = {}) => {
  try {
    const hasBody = context.body && Object.keys(context.body).length > 0
    if (hasBody) {
      return handleStore(context.body)
    }

    return handleRetrieve(context.params)
  } catch (error) {
    console.error('Erro na função de armazenamento de tokens:', error)
    return respond(500, { error: 'Erro interno ao processar tokens.' })
  }
}
