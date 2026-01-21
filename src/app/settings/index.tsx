import { useCallback, useEffect, useMemo, useState } from 'react'
import { nvoipAuthConfig } from './nvoipAuth'

type StoredTokens = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  [key: string]: unknown
}

type PersistParams = {
  portalId: string
  accountId: string
  tokens: StoredTokens
}

type RetrieveParams = {
  portalId: string
  accountId: string
}

const resolveTokenBackendBaseUrl = () => {
  const raw = nvoipAuthConfig.tokenBackendUrl?.trim() ?? ''
  if (!raw) {
    throw new Error(
      'Configure a variável VITE_NVOIP_TOKEN_BACKEND_URL com a URL completa do backend de tokens.',
    )
  }
  return raw.replace(/\/+$/, '')
}

const tokenBackendBaseUrl = resolveTokenBackendBaseUrl()

const buildTokenBackendUrl = (relativePath: string) => {
  const safePath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${tokenBackendBaseUrl}${safePath}`
}

const buildJsonResponseError = async (response: Response) => {
  const text = await response.text()
  return text || `HTTP ${response.status}`
}

const ensureHubspotFetch = () => {
  const fetchFn = window.hubspot?.fetch
  if (!fetchFn) {
    throw new Error('`hubspot.fetch` não está disponível.')
  }
  return fetchFn
}

export const persistTokensToBackend = async ({
  portalId,
  accountId,
  tokens,
}: PersistParams): Promise<StoredTokens> => {
  const hubspotFetch = ensureHubspotFetch()
  const response = await hubspotFetch(buildTokenBackendUrl('/tokens/store'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ portalId, accountId, tokens }),
  })

  if (!response.ok) {
    throw new Error(await buildJsonResponseError(response))
  }

  const data = await response.json()
  if (!data || typeof data !== 'object') {
    throw new Error('Resposta inválida da função de armazenamento.')
  }

  return data.tokens ?? tokens
}

export const fetchTokensFromBackend = async ({
  portalId,
  accountId,
}: RetrieveParams): Promise<StoredTokens | null> => {
  const hubspotFetch = ensureHubspotFetch()
  const query = new URLSearchParams({
    portalId,
    accountId,
  })

  const response = await hubspotFetch(
    buildTokenBackendUrl(`/tokens/retrieve?${query.toString()}`),
    {
      method: 'GET',
    },
  )

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(await buildJsonResponseError(response))
  }

  const data = await response.json()
  if (!data || typeof data !== 'object') {
    throw new Error('Resposta inválida da função de recuperação.')
  }

  return data.tokens ?? null
}

const getPortalAccountIds = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const portalId =
    window.hubspot?.app?.portalId ??
    searchParams.get('portalId') ??
    searchParams.get('portal_id') ??
    ''
  const accountId =
    window.hubspot?.app?.accountId ??
    searchParams.get('accountId') ??
    searchParams.get('account_id') ??
    ''

  return { portalId, accountId }
}

const useAllowedOrigins = () =>
  useMemo(() => new Set(nvoipAuthConfig.permittedUrls?.iframe ?? []), [])

const SettingsCard = () => {
  const [tokens, setTokens] = useState<StoredTokens | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const { portalId, accountId } = useMemo(() => getPortalAccountIds(), [])
  const allowedOrigins = useAllowedOrigins()

  const loadTokens = useCallback(async () => {
    if (!portalId || !accountId) {
      setStatus('idle')
      return
    }

    setStatus('loading')
    try {
      const retrieved = await fetchTokensFromBackend({ portalId, accountId })
      setTokens(retrieved)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao carregar tokens.')
    }
  }, [portalId, accountId])

  const saveTokens = useCallback(
    async (incomingTokens: StoredTokens) => {
      if (!portalId || !accountId) return
      setStatus('loading')
      try {
        const stored = await persistTokensToBackend({
          portalId,
          accountId,
          tokens: incomingTokens,
        })
        setTokens(stored)
        setStatus('ready')
        setError(null)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Erro desconhecido ao salvar tokens.')
      }
    },
    [portalId, accountId],
  )

  const formatFingerprint = (value?: string) =>
    value ? `${value.substring(0, 10)}…` : '—'

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (allowedOrigins.size > 0 && !allowedOrigins.has(event.origin)) {
        return
      }

      if (!event.data || typeof event.data !== 'object') {
        return
      }

      const { type, token } = event.data as { type?: string; token?: StoredTokens }

      if (!token) {
        return
      }

      if (type === 'nvoip-oauth-success' || type === 'nvoip-token-from-local-storage') {
        void saveTokens(token)
      }
    },
    [allowedOrigins, saveTokens],
  )

  useEffect(() => {
    void loadTokens()
  }, [loadTokens])

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  return (
    <section className="settings-shell">
      <header>
        <h1>Integração Nvoip</h1>
        <p>
          {portalId && accountId
            ? `Portal ${portalId} • Account ${accountId}`
            : 'Aguardando identificação de portal/account.'}
        </p>
      </header>
      <div className="settings-status">
        <strong>Status:</strong> {status}
      </div>
      {tokens ? (
        <div>
          <p>
            <strong>Access Token:</strong> {formatFingerprint(tokens.access_token)}
          </p>
          {tokens.refresh_token && (
            <p>
              <strong>Refresh Token:</strong> {formatFingerprint(tokens.refresh_token)}
            </p>
          )}
          <p>
            <strong>Scope:</strong> {tokens.scope ?? '—'}
          </p>
        </div>
      ) : (
        <p>Nenhum token armazenado. Conecte novamente a partir do iframe.</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

export default SettingsCard
