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

// Tipos para HubSpot context
declare global {
  interface Window {
    hubspot?: {
      serverless?: {
        runServerlessFunction: (options: {
          name: string
          parameters?: Record<string, unknown>
        }) => Promise<unknown>
      }
      fetch?: (url: string, options?: RequestInit) => Promise<Response>
    }
  }
}

const tokenStorageKey = 'nvoip.oauth.token'
const stateStorageKey = 'nvoip.oauth.state'

function App() {
  const { clientId, authUrl, tokenExchangeUrl, appRedirectPath, scopes } = nvoipAuthConfig
  const [showCard, setShowCard] = useState(true)
  const [isLogged, setIsLogged] = useState(false)

  const redirectUriForAuth = useMemo(() => {
    return new URL(appRedirectPath, window.location.origin).toString()
  }, [appRedirectPath])

  const storeTokenInHubSpot = useCallback(
    async (tokenResponse: TokenResponse): Promise<void> => {
      if (!window.hubspot) {
        throw new Error('HubSpot context não está disponível')
      }

      const serverlessFunctionName = 'store-nvoip-token'
      const parameters = {
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_in: tokenResponse.expires_in,
        token_type: tokenResponse.token_type,
        scope: tokenResponse.scope,
      }

      try {
        // Tenta usar runServerlessFunction primeiro
        if (window.hubspot.serverless?.runServerlessFunction) {
          await window.hubspot.serverless.runServerlessFunction({
            name: serverlessFunctionName,
            parameters,
          })
        } else if (window.hubspot.fetch) {
          // Fallback para fetch direto
          const serverlessUrl = `https://${window.location.hostname}/.netlify/functions/${serverlessFunctionName}`
          const response = await window.hubspot.fetch(serverlessUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(parameters),
          })

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
              `Falha ao armazenar token no HubSpot (${response.status}): ${errorText}`,
            )
          }
        } else {
          throw new Error('Nenhum método disponível para chamar função serverless do HubSpot')
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido ao armazenar token no HubSpot'
        throw new Error(errorMessage)
      }
    },
    [],
  )

  const storeToken = useCallback(
    async (tokenResponse: TokenResponse): Promise<void> => {
      // Armazena localmente também
      localStorage.setItem(tokenStorageKey, JSON.stringify(tokenResponse))
      // Atualiza UI
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

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || typeof payload !== 'object') return

      if (payload.type === 'nvoip-oauth-success') {
        if (payload.token) {
          const tokenResponse = payload.token as TokenResponse
          const isIframe = window.self !== window.top

          try {
            // Se estiver em iframe do HubSpot, armazena no HubSpot primeiro
            if (isIframe) {
              try {
                await storeTokenInHubSpot(tokenResponse)
              } catch (hubspotError) {
                console.error('Erro ao armazenar token no HubSpot:', hubspotError)
                // Notifica erro ao HubSpot se estiver em iframe
                if (window.parent) {
                  window.parent.postMessage(
                    {
                      type: 'nvoip-oauth-error',
                      message:
                        hubspotError instanceof Error
                          ? hubspotError.message
                          : 'Erro ao armazenar token no HubSpot',
                    },
                    window.location.origin,
                  )
                }
                // Ainda armazena localmente mesmo em caso de erro
              }
            }

            // Armazena localmente e atualiza UI
            await storeToken(tokenResponse)
          } catch (error) {
            console.error('Erro ao processar token:', error)
            // Ainda armazena localmente mesmo em caso de erro
            await storeToken(tokenResponse)
          }
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [storeToken, storeTokenInHubSpot])

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
        // Não fecha iframe automaticamente, deixa o HubSpot gerenciar
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

          // Se estiver em iframe, armazena no HubSpot ANTES de qualquer notificação
          let hubspotStoreError: Error | null = null
          if (isIframe) {
            try {
              await storeTokenInHubSpot(tokenResponse)
            } catch (hubspotError) {
              hubspotStoreError =
                hubspotError instanceof Error
                  ? hubspotError
                  : new Error('Erro desconhecido ao armazenar token no HubSpot')
              console.error('Erro ao armazenar token no HubSpot:', hubspotStoreError)
            }
          }

          // Armazena localmente e atualiza UI
          await storeToken(tokenResponse)

          if (isPopup) {
            // Para popup, notifica e fecha
            window.opener?.postMessage(
              { type: 'nvoip-oauth-success', token: tokenResponse },
              window.location.origin,
            )
            window.close()
          } else if (isIframe && window.parent) {
            // Para iframe, só notifica após tentar armazenar no HubSpot
            if (hubspotStoreError) {
              // Notifica erro ao HubSpot
              window.parent.postMessage(
                {
                  type: 'nvoip-oauth-error',
                  message: hubspotStoreError.message,
                  token: tokenResponse, // Envia token mesmo em caso de erro para permitir retry
                },
                window.location.origin,
              )
            } else {
              // Notifica sucesso ao HubSpot
              window.parent.postMessage(
                { type: 'nvoip-oauth-success', token: tokenResponse },
                window.location.origin,
              )
            }
            // Não fecha o iframe, deixa o HubSpot gerenciar o fechamento
          }

          window.history.replaceState({}, document.title, window.location.pathname)
        } catch (exchangeError) {
          const errorMessage =
            exchangeError instanceof Error
              ? exchangeError.message
              : 'Erro desconhecido ao trocar token.'

          // Se estiver em iframe, notifica o HubSpot sobre o erro
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
  }, [exchangeToken, storeToken, storeTokenInHubSpot])

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
