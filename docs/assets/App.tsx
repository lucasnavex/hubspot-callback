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

const getPortalAccountFromQuery = () => {
  const params = new URLSearchParams(window.location.search)
  const portalId = params.get('portalId') ?? params.get('portal_id') ?? undefined
  const accountId = params.get('accountId') ?? params.get('account_id') ?? undefined
  return { portalId, accountId }
}

function App() {
  const { clientId, authUrl, tokenExchangeUrl, appRedirectPath, scopes } = nvoipAuthConfig
  const [showCard, setShowCard] = useState(true)
  const [isLogged, setIsLogged] = useState(false)
  const { portalId: portalIdFromQuery, accountId: accountIdFromQuery } = useMemo(
    getPortalAccountFromQuery,
    [],
  )

  const redirectUriForAuth = useMemo(() => {
    return new URL(appRedirectPath, window.location.origin).toString()
  }, [appRedirectPath])

  const storeToken = useCallback(
    async (tokenResponse: TokenResponse): Promise<void> => {
      localStorage.setItem(tokenStorageKey, JSON.stringify(tokenResponse))
      setShowCard(false)
      setIsLogged(true)
    },
    [],
  )

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
    setIsLogged(false)
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

  const notifyHubSpotCard = useCallback(
    (tokenResponse: TokenResponse) => {
      if (window.parent && window.self !== window.top) {
        const payload: Record<string, unknown> = {
          type: 'nvoip-oauth-success',
          token: tokenResponse,
        }

        if (portalIdFromQuery) {
          payload.portalId = portalIdFromQuery
        }
        if (accountIdFromQuery) {
          payload.accountId = accountIdFromQuery
        }

        window.parent.postMessage(payload, window.location.origin)
      }
    },
    [portalIdFromQuery, accountIdFromQuery],
  )

  useEffect(() => {
    const syncTokenFromStorage = async () => {
      const storedValue = localStorage.getItem(tokenStorageKey)
      if (!storedValue) {
        return
      }

      try {
        const parsedToken = JSON.parse(storedValue) as TokenResponse
        if (!parsedToken.access_token) {
          throw new Error('Access token ausente.')
        }

        await storeToken(parsedToken)
        notifyHubSpotCard(parsedToken)
      } catch (error) {
        console.warn('Token inválido no localStorage, limpando.', error)
        localStorage.removeItem(tokenStorageKey)
      }
    }

    void syncTokenFromStorage()
  }, [storeToken, notifyHubSpotCard])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const returnedState = params.get('state')
    const oauthError = params.get('error')
    if (!code && !oauthError) return

    const isPopup = Boolean(window.opener)
    const isIframe = window.self !== window.top
    const finishWithError = async (message: string) => {
      if (isPopup) {
        window.opener?.postMessage({ type: 'nvoip-oauth-error', message }, window.location.origin)
        window.close()
      } else if (isIframe && window.parent) {
        window.parent.postMessage({ type: 'nvoip-oauth-error', message }, window.location.origin)
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

        await storeToken(tokenResponse)
        notifyHubSpotCard(tokenResponse)

        if (isPopup) {
          window.opener?.postMessage(
            { type: 'nvoip-oauth-success', token: tokenResponse },
            window.location.origin,
          )
          window.close()
        }

        window.history.replaceState({}, document.title, window.location.pathname)
      } catch (exchangeError) {
        const errorMessage =
          exchangeError instanceof Error
            ? exchangeError.message
            : 'Erro desconhecido ao trocar token.'

        if (isIframe && window.parent) {
          window.parent.postMessage(
            { type: 'nvoip-oauth-error', message: errorMessage },
            window.location.origin,
          )
        } else {
          await finishWithError(errorMessage)
        }
      }
    }

    handleCode()
  }, [exchangeToken, storeToken, notifyHubSpotCard])

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
              <img src={nvoipLogo} alt="Nvoip" className="logo-image" />
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
      ) : isLogged ? (
        <section className="hero logged">
          <div className="oauth-card">
            <div className="logo-row">
              <img src={hubspotLogo} alt="HubSpot" className="logo-image" />
              <div className="logo-dots">
                <span />
                <span />
                <span />
              </div>
              <img src={nvoipLogo} alt="Nvoip" className="logo-image" />
            </div>
            <p className="card-subtitle">Você está conectado</p>
          </div>
        </section>
      ) : (
        <div className="blank-screen" />
      )}
    </main>
  )
}

export default App
