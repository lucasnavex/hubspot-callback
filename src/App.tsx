import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { nvoipAuthConfig } from './app/settings/nvoipAuth'
import hubspotLogo from './assets/hubspot.svg'
import nvoipLogo from './assets/nvoiplogo.png'

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
  const { clientId, authUrl, tokenExchangeUrl, appRedirectPath, scopes } = nvoipAuthConfig
  const [showCard, setShowCard] = useState(true)

  const redirectUriForAuth = useMemo(() => {
    return new URL(appRedirectPath, window.location.origin).toString()
  }, [appRedirectPath])

  const storeToken = useCallback((tokenResponse: TokenResponse) => {
    localStorage.setItem(tokenStorageKey, JSON.stringify(tokenResponse))
    setShowCard(false)
  }, [])

  const exchangeToken = useCallback(
    async (code: string): Promise<TokenResponse> => {
      const url = new URL(tokenExchangeUrl, window.location.origin)
      url.searchParams.set('code', code)
      url.searchParams.set('redirect_uri', redirectUriForAuth)

      const response = await fetch(url.toString())
      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Falha ao trocar token.')
      }

      return (await response.json()) as TokenResponse
    },
    [redirectUriForAuth, tokenExchangeUrl],
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
    setShowCard(true)
    const state = crypto.randomUUID()
    sessionStorage.setItem(stateStorageKey, state)
    const popup = window.open(
      buildAuthorizationUrl(state),
      'nvoip-oauth',
      'width=520,height=720,menubar=no,toolbar=no,status=no,scrollbars=yes',
    )

    if (!popup) {
      return
    }
  }, [buildAuthorizationUrl])

  useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || typeof payload !== 'object') return

      if (payload.type === 'nvoip-oauth-success') {
        if (payload.token) {
          storeToken(payload.token as TokenResponse)
        }
      }

    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [storeToken])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')
    const oauthError = params.get('error')
    if (!code && !oauthError) return

    const isPopup = Boolean(window.opener)
    const finishWithError = (message: string) => {
      if (isPopup) {
        window.opener?.postMessage({ type: 'nvoip-oauth-error', message }, window.location.origin)
        window.close()
      }
    }

    const expectedState = sessionStorage.getItem(stateStorageKey)
    sessionStorage.removeItem(stateStorageKey)
    if (expectedState && returnedState !== expectedState) {
      finishWithError('Não foi possível validar o state.')
      return
    }

    if (oauthError) {
      finishWithError(oauthError)
      return
    }

    if (!code) {
      finishWithError('OAuth finalizado sem code.')
      return
    }

      const handleCode = async () => {
      try {
        const tokenResponse = await exchangeToken(code)
        storeToken(tokenResponse)
        if (isPopup) {
          window.opener?.postMessage(
            { type: 'nvoip-oauth-success', token: tokenResponse },
            window.location.origin,
          )
          window.close()
        }
        window.history.replaceState({}, document.title, window.location.pathname)
      } catch (exchangeError) {
        finishWithError(
          exchangeError instanceof Error ? exchangeError.message : 'Erro desconhecido ao trocar token.',
        )
      }
    }

    handleCode()
  }, [exchangeToken, storeToken])

  return (
    <main className={`app-shell ${showCard ? '' : 'blank'}`}>
      {showCard ? (
        <section className="hero">
          <div className="oauth-card">
          <div className="logo-row">
          <img src={hubspotLogo} alt="HubSpot" className="logo-image" />
          <div className="logo-dots">
            <span />
            <span />
            <span />
          </div>
          <img src={nvoipLogo} alt="Nvoip" className="logo-image"  />
        </div>
            <p className="card-subtitle">Faça login para continuar</p>
            <button className="oauth-card-button" type="button" onClick={startOAuth}>
              Entrar com a Nvoip
            </button>
          <p className="terms-text">
            Ao efetuar o login, você concorda com nossos{' '}
            <a href="https://www.nvoip.com.br/documentos/termo-de-uso.pdf?swcfpc=1" target="_blank" rel="noreferrer">
              Termos de Serviço
            </a>
          </p>
          </div>
        </section>
      ) : (
        <div className="blank-screen" />
      )}
    </main>
  )
}

export default App
