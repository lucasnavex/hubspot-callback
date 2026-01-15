import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { nvoipAuthConfig } from './app/settings/nvoipAuth'

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  [key: string]: unknown
}

const tokenStorageKey = 'nvoip.oauth.token'
const stateStorageKey = 'nvoip.oauth.state'

function App() {
  const { redirectUri, fallbackRedirect, permittedUrls, clientId, authUrl, tokenExchangeUrl, appRedirectPath, scopes } =
    nvoipAuthConfig
  const [status, setStatus] = useState('Pronto para iniciar o OAuth.')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<TokenResponse | null>(() => {
    const saved = localStorage.getItem(tokenStorageKey)
    if (!saved) return null
    try {
      return JSON.parse(saved) as TokenResponse
    } catch {
      return null
    }
  })

  const redirectUriForAuth = useMemo(() => {
    return new URL(appRedirectPath, window.location.origin).toString()
  }, [appRedirectPath])

  const storeToken = useCallback((tokenResponse: TokenResponse) => {
    localStorage.setItem(tokenStorageKey, JSON.stringify(tokenResponse))
    setToken(tokenResponse)
  }, [])

  const clearToken = useCallback(() => {
    localStorage.removeItem(tokenStorageKey)
    setToken(null)
    setStatus('Token removido do localStorage.')
  }, [])

  const exchangeToken = useCallback(
    async (code: string) => {
      setStatus('Trocando o code por token...')
      setError(null)
      const url = new URL(tokenExchangeUrl, window.location.origin)
      url.searchParams.set('code', code)
      url.searchParams.set('redirect_uri', redirectUriForAuth)

      const response = await fetch(url.toString())
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao trocar token.')
      }

      const tokenResponse = (await response.json()) as TokenResponse
      storeToken(tokenResponse)
      setStatus('Token salvo no localStorage.')
    },
    [redirectUriForAuth, storeToken, tokenExchangeUrl],
  )

  const buildAuthorizationUrl = useCallback(
    (state: string) => {
      const url = new URL(authUrl)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', redirectUriForAuth)
      url.searchParams.set('state', state)
      if (scopes.length > 0) {
        url.searchParams.set('scope', scopes.join(' '))
      }
      return url.toString()
    },
    [authUrl, clientId, redirectUriForAuth, scopes],
  )

  const startOAuth = useCallback(() => {
    setError(null)
    const state = crypto.randomUUID()
    sessionStorage.setItem(stateStorageKey, state)
    const popup = window.open(
      buildAuthorizationUrl(state),
      'nvoip-oauth',
      'width=520,height=720,menubar=no,toolbar=no,status=no,scrollbars=yes',
    )

    if (!popup) {
      setStatus('Não foi possível abrir a janela de login.')
      setError('Verifique se o navegador bloqueou popups.')
      return
    }

    setStatus('Fluxo OAuth em andamento na nova aba.')
  }, [buildAuthorizationUrl])

  useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || typeof payload !== 'object') return

      if (payload.type === 'nvoip-oauth-success') {
      console.log('[OAuth popup] sucesso recebido')
        setStatus('Token salvo no localStorage.')
        setError(null)
        const saved = localStorage.getItem(tokenStorageKey)
        if (saved) {
          try {
            setToken(JSON.parse(saved) as TokenResponse)
          } catch {
            setToken(null)
          }
        }
      }

      if (payload.type === 'nvoip-oauth-error') {
      console.log('[OAuth popup] erro recebido', payload.message)
        setStatus('OAuth retornou erro.')
        setError(payload.message ?? 'Erro desconhecido.')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')
    const oauthError = params.get('error')
    if (!code && !oauthError) return
    console.log('[OAuth callback] params', { code, state: returnedState, oauthError })

    const isPopup = Boolean(window.opener)
    const finishWithError = (message: string) => {
      setStatus('OAuth retornou erro.')
      setError(message)
      console.log('[OAuth callback] error', message)
      if (isPopup) {
        window.opener?.postMessage({ type: 'nvoip-oauth-error', message }, window.location.origin)
        window.close()
      }
    }

    const expectedState = sessionStorage.getItem(stateStorageKey)
    sessionStorage.removeItem(stateStorageKey)
    if (expectedState && returnedState !== expectedState) {
      console.log('[OAuth callback] state mismatch', { expectedState, returnedState })
      finishWithError('Não foi possível validar o state.')
      return
    }

    if (oauthError) {
      finishWithError(oauthError)
      return
    }

    if (!code) {
      console.log('[OAuth callback] code ausente')
      finishWithError('OAuth finalizado sem code.')
      return
    }

    setStatus('Trocando o code por token...')
    console.log('[OAuth callback] iniciando troca de token')
    exchangeToken(code)
      .then(() => {
        console.log('[OAuth callback] troca concluída')
        setStatus('Token salvo no localStorage.')
        setError(null)
        if (isPopup) {
          window.opener?.postMessage({ type: 'nvoip-oauth-success' }, window.location.origin)
          window.close()
        }
        window.history.replaceState({}, document.title, window.location.pathname)
      })
      .catch((exchangeError) => {
        finishWithError(
          exchangeError instanceof Error ? exchangeError.message : 'Erro desconhecido ao trocar token.',
        )
      })
  }, [exchangeToken])

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Callback HubSpot · Netlify</p>
        <h1>Login OAuth Nvoip</h1>
        <p>
          Use o botão abaixo para abrir uma janela controlada de autenticação. Ao finalizar o fluxo,
          trocamos o code por token e persistimos no localStorage.
        </p>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={startOAuth}>
            Conectar com Nvoip
          </button>
          {token ? (
            <button className="ghost-button" type="button" onClick={clearToken}>
              Limpar token
            </button>
          ) : null}
        </div>
        <div className="status-card" aria-live="polite">
          <span>{status}</span>
          {error ? <span className="status-error">{error}</span> : null}
        </div>
        {token ? (
          <pre className="token-preview">{JSON.stringify(token, null, 2)}</pre>
        ) : (
          <p className="token-placeholder">Nenhum token salvo ainda.</p>
        )}
      </section>

      <section className="panel-grid">
        <article>
          <h2>Rotas</h2>
          <ul>
            <li>
              <strong>Redirect</strong>: <code>{redirectUri}</code>
            </li>
            <li>
              <strong>Fallback</strong>: <code>{fallbackRedirect}</code>
            </li>
            <li>
              <strong>Redirect App</strong>: <code>{redirectUriForAuth}</code>
            </li>
          </ul>
        </article>

        <article>
          <h2>Permissões</h2>
          <p>Domínios liberados nas chamadas HubSpot:</p>
          <ul>
            {permittedUrls.fetch.map((url) => (
              <li key={`fetch-${url}`}>
                FETCH · <code>{url}</code>
              </li>
            ))}
            {permittedUrls.iframe.map((url) => (
              <li key={`iframe-${url}`}>
                IFRAME · <code>{url}</code>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Credenciais</h2>
          <p>
            Encontre os valores atuais no painel HubSpot ou via variáveis de ambiente Netlify:
          </p>
          <ul>
            <li>
              <code>VITE_HUBSPOT_CLIENT_ID</code>
            </li>
            <li>
              <code>VITE_HUBSPOT_CLIENT_SECRET</code> (mesmo valor usado no handler Netlify)
            </li>
            <li>
              <code>VITE_NVOIP_AUTH_URL</code>
            </li>
            <li>
              <code>VITE_APP_REDIRECT_PATH</code>
            </li>
            <li>
              <code>VITE_NVOIP_SCOPES</code>
            </li>
          </ul>
        </article>

        <article>
          <h2>Documentação</h2>
          <p>
            Confira o plano detalhado em <code>docs/netlify-callback-plan.md</code> e valide com{' '}
            <code>netlify dev</code> + <code>hs project upload</code>.
          </p>
        </article>
      </section>
    </main>
  )
}

export default App
