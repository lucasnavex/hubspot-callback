const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 4000
const tokenStore = new Map()

const buildKey = (portalId, accountId) => `${portalId}:${accountId}`

const isValidText = (value) => typeof value === 'string' && value.trim().length > 0

const respondWithError = (res, statusCode, message) => {
  res.status(statusCode).json({ error: message })
}

const validateIds = (portalId, accountId, res) => {
  if (!isValidText(portalId)) {
    respondWithError(res, 400, 'portalId é obrigatório e deve ser uma string não vazia.')
    return false
  }

  if (!isValidText(accountId)) {
    respondWithError(res, 400, 'accountId é obrigatório e deve ser uma string não vazia.')
    return false
  }

  return true
}

app.post('/tokens/store', (req, res) => {
  const { portalId, accountId, tokens } = req.body ?? {}

  if (!validateIds(portalId, accountId, res)) {
    return
  }

  if (!tokens || typeof tokens !== 'object') {
    respondWithError(res, 400, 'tokens é obrigatório e deve ser um objeto.')
    return
  }

  if (!isValidText(tokens.access_token)) {
    respondWithError(res, 400, 'tokens.access_token é obrigatório.')
    return
  }

  const key = buildKey(portalId, accountId)
  const storedTokens = {
    ...tokens,
    storedAt: new Date().toISOString(),
  }

  tokenStore.set(key, storedTokens)

  res.status(200).json({
    portalId,
    accountId,
    tokens: storedTokens,
  })
})

app.get('/tokens/retrieve', (req, res) => {
  const portalId = req.query.portalId ?? req.query.portal_id ?? ''
  const accountId = req.query.accountId ?? req.query.account_id ?? ''

  if (!validateIds(portalId, accountId, res)) {
    return
  }

  const key = buildKey(portalId, accountId)
  if (!tokenStore.has(key)) {
    respondWithError(res, 404, 'Tokens não encontrados para este portal/account.')
    return
  }

  const tokens = tokenStore.get(key)

  res.status(200).json({
    portalId,
    accountId,
    tokens,
  })
})

app.listen(PORT, () => {
  console.log(`Token backend escalável em memória ouvindo na porta ${PORT}`)
})
