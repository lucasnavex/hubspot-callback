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
      context?: {
        portalId?: string
        accountId?: string
        getCurrentPortalId?: () => string | null
        getCurrentAccountId?: () => string | null
      }
      api?: {
        getCurrentPortalId?: () => Promise<string>
        getCurrentAccountId?: () => Promise<string>
      }
    }
  }
}

const tokenStorageKey = 'nvoip.oauth.token'
const stateStorageKey = 'nvoip.oauth.state'
const HUBSPOT_PARENT_ORIGIN =
  import.meta.env.VITE_HUBSPOT_PARENT_ORIGIN || 'https://app.hubspot.com'

function App() {
  const { clientId, authUrl, tokenExchangeUrl, appRedirectPath, scopes } = nvoipAuthConfig
  const [showCard, setShowCard] = useState(true)
  const [isLogged, setIsLogged] = useState(false)
  
  // Armazena portalId e accountId recebidos via postMessage ou URL
  const [hubspotIds, setHubspotIds] = useState<{ portalId: string; accountId: string } | null>(null)

  const sendTokensToParent = useCallback((tokens: TokenResponse) => {
    const isIframe = window.self !== window.top
    
    console.log('[sendTokensToParent] Verificando condições:', {
      isIframe,
      hasParent: !!window.parent,
      hasTokens: !!tokens,
      hasAccessToken: !!tokens?.access_token,
      windowLocation: window.location.href,
      parentOrigin: window.parent?.location?.origin || 'N/A (cross-origin)',
    })

    if (!isIframe) {
      console.warn('[sendTokensToParent] Não está em iframe, abortando envio')
      return
    }

    if (!window.parent) {
      console.warn('[sendTokensToParent] window.parent não disponível, abortando envio')
      return
    }

    if (!tokens || !tokens.access_token) {
      console.warn('[sendTokensToParent] Tokens inválidos ou sem access_token:', tokens)
      return
    }

    const messagePayload = {
      type: 'NVOIP_OAUTH_TOKENS',
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
    }

    console.log('[sendTokensToParent] Enviando postMessage para HubSpot:', {
      type: messagePayload.type,
      hasAccessToken: !!messagePayload.tokens.access_token,
      hasRefreshToken: !!messagePayload.tokens.refresh_token,
      expiresIn: messagePayload.tokens.expires_in,
      tokenType: messagePayload.tokens.token_type,
      targetOrigin: '*',
      fullPayload: messagePayload,
    })

    try {
      window.parent.postMessage(messagePayload, '*')
      console.log('[sendTokensToParent] ✅ postMessage enviado com sucesso para window.parent')
    } catch (error) {
      console.error('[sendTokensToParent] ❌ Falha ao enviar tokens para o parent (HubSpot):', error)
    }
  }, [])

  const redirectUriForAuth = useMemo(() => {
    return new URL(appRedirectPath, window.location.origin).toString()
  }, [appRedirectPath])

  // Obtém portalId e accountId da URL, do estado, ou do contexto do HubSpot
  const getHubSpotIds = useCallback(async () => {
    // 1. Usa IDs do estado (recebidos via postMessage) se disponíveis
    let portalId = hubspotIds?.portalId || null
    let accountId = hubspotIds?.accountId || null

    // 2. Tenta obter da URL query params (mais confiável se disponível)
    const params = new URLSearchParams(window.location.search)
    portalId = portalId || params.get('portalId')
    accountId = accountId || params.get('accountId')

    // 3. Se não estiver na URL nem no estado, tenta do contexto do HubSpot
    if (!portalId || !accountId) {
      // Tenta métodos síncronos do HubSpot
      if (window.hubspot?.context) {
        portalId = portalId || window.hubspot.context.portalId || null
        accountId = accountId || window.hubspot.context.accountId || null

        // Tenta métodos getCurrent* se disponíveis
        if (window.hubspot.context.getCurrentPortalId) {
          try {
            const id = window.hubspot.context.getCurrentPortalId()
            if (id) portalId = portalId || id
          } catch (e) {
            console.warn('Erro ao obter portalId via getCurrentPortalId:', e)
          }
        }

        if (window.hubspot.context.getCurrentAccountId) {
          try {
            const id = window.hubspot.context.getCurrentAccountId()
            if (id) accountId = accountId || id
          } catch (e) {
            console.warn('Erro ao obter accountId via getCurrentAccountId:', e)
          }
        }
      }

      // 4. Tenta métodos assíncronos da API do HubSpot
      if ((!portalId || !accountId) && window.hubspot?.api) {
        try {
          if (!portalId && window.hubspot.api.getCurrentPortalId) {
            const id = await window.hubspot.api.getCurrentPortalId()
            if (id) portalId = id
          }
          if (!accountId && window.hubspot.api.getCurrentAccountId) {
            const id = await window.hubspot.api.getCurrentAccountId()
            if (id) accountId = id
          }
        } catch (e) {
          console.warn('Erro ao obter IDs via HubSpot API:', e)
        }
      }

      // 5. Tenta extrair do pathname (formato: /app/:portalId/:accountId/...)
      if (!portalId || !accountId) {
        const pathMatch = window.location.pathname.match(/\/(\d+)\/([^/]+)/)
        if (pathMatch) {
          if (!portalId) portalId = pathMatch[1]
          if (!accountId) accountId = pathMatch[2]
        }
      }
    }

    const result = {
      portalId: portalId || '',
      accountId: accountId || '',
    }

    // Log detalhado para debug
    console.log('[getHubSpotIds] Tentando obter IDs:', {
      fromState: { portalId: hubspotIds?.portalId, accountId: hubspotIds?.accountId },
      fromUrl: { portalId: params.get('portalId'), accountId: params.get('accountId') },
      fromHubSpotContext: {
        portalId: window.hubspot?.context?.portalId,
        accountId: window.hubspot?.context?.accountId,
      },
      final: result,
      url: window.location.href,
      pathname: window.location.pathname,
      search: window.location.search,
      hasHubSpotContext: !!window.hubspot,
    })

    if (!result.portalId || !result.accountId) {
      console.warn('[getHubSpotIds] Não foi possível obter portalId ou accountId completamente:', result)
    }

    return result
  }, [hubspotIds])

  // Recupera token do Netlify storage
  const retrieveTokenFromNetlify = useCallback(async (): Promise<TokenResponse | null> => {
    const { portalId, accountId } = await getHubSpotIds()
    
    if (!portalId || !accountId) {
      console.warn('portalId ou accountId não disponíveis para recuperar token')
      return null
    }

    try {
      const serverlessUrl = `/.netlify/functions/retrieve-nvoip-token?portalId=${encodeURIComponent(portalId)}&accountId=${encodeURIComponent(accountId)}`
      
      // Usa fetch normal ou hubspot.fetch se disponível
      const fetchFn = window.hubspot?.fetch || fetch
      const response = await fetchFn(serverlessUrl, {
        method: 'GET',
        headers: {
          'x-nvoip-secret': import.meta.env.VITE_NVOIP_SECRET || '',
        },
      })

      if (response.status === 404) {
        // Token não encontrado, retorna null
        return null
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Falha ao recuperar token (${response.status}): ${errorText}`)
      }

      return (await response.json()) as TokenResponse
    } catch (error) {
      console.error('Erro ao recuperar token do Netlify:', error)
      return null
    }
  }, [getHubSpotIds])

  // Armazena token no Netlify storage
  const storeTokenInNetlify = useCallback(
    async (tokenResponse: TokenResponse): Promise<void> => {
      // Obtém IDs (aguarda se for assíncrono)
      const { portalId, accountId } = await getHubSpotIds()
      
      if (!portalId || !accountId) {
        const errorMsg = `portalId e accountId são obrigatórios para armazenar token. portalId: "${portalId}", accountId: "${accountId}"`
        console.error(errorMsg, {
          url: window.location.href,
          search: window.location.search,
        })
        throw new Error(errorMsg)
      }

      const serverlessFunctionName = 'store-nvoip-token'
      
      // Monta payload exatamente como o Netlify espera
      const payload = {
        portalId: portalId.trim(),
        accountId: accountId.trim(),
        tokens: {
          access_token: tokenResponse.access_token,
          refresh_token: tokenResponse.refresh_token || null,
          expires_in: tokenResponse.expires_in || null,
          token_type: tokenResponse.token_type || 'Bearer',
          scope: tokenResponse.scope || null,
        },
      }

      // Logs ampliados para debug
      console.log('[storeTokenInNetlify] Preparando para armazenar token:', {
        windowLocationHref: window.location.href,
        windowLocationPathname: window.location.pathname,
        windowLocationSearch: window.location.search,
        hubspotContext: {
          hasHubSpot: !!window.hubspot,
          context: window.hubspot?.context,
          hasApi: !!window.hubspot?.api,
        },
        hubspotIdsState: hubspotIds,
        payload: {
          portalId: payload.portalId,
          accountId: payload.accountId,
          tokens: {
            access_token: payload.tokens.access_token ? '[REDACTED]' : null,
            refresh_token: payload.tokens.refresh_token ? '[REDACTED]' : null,
            expires_in: payload.tokens.expires_in,
            token_type: payload.tokens.token_type,
            scope: payload.tokens.scope,
          },
        },
      })

      // Tenta obter IDs via API do HubSpot para log (se disponível)
      if (window.hubspot?.api?.getCurrentPortalId) {
        try {
          const apiPortalId = await window.hubspot.api.getCurrentPortalId()
          console.log('[storeTokenInNetlify] portalId via hubspot.api.getCurrentPortalId():', apiPortalId)
        } catch (e) {
          console.warn('[storeTokenInNetlify] Erro ao obter portalId via API:', e)
        }
      }

      if (window.hubspot?.api?.getCurrentAccountId) {
        try {
          const apiAccountId = await window.hubspot.api.getCurrentAccountId()
          console.log('[storeTokenInNetlify] accountId via hubspot.api.getCurrentAccountId():', apiAccountId)
        } catch (e) {
          console.warn('[storeTokenInNetlify] Erro ao obter accountId via API:', e)
        }
      }

      try {
        const secret = import.meta.env.VITE_NVOIP_SECRET || ''
        
        // Tenta usar runServerlessFunction primeiro (se disponível)
        if (window.hubspot?.serverless?.runServerlessFunction) {
          await window.hubspot.serverless.runServerlessFunction({
            name: serverlessFunctionName,
            parameters: payload,
          })
        } else {
          // Fallback para fetch direto
          const serverlessUrl = `/.netlify/functions/${serverlessFunctionName}`
          const fetchFn = window.hubspot?.fetch || fetch
          
          const response = await fetchFn(serverlessUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-nvoip-secret': secret,
            },
            body: JSON.stringify(payload),
          })

          if (!response.ok) {
            const errorText = await response.text()
            const errorMessage = `Falha ao armazenar token no Netlify (${response.status}): ${errorText}`
            
            // Log detalhado em caso de erro
            console.error('Erro ao armazenar token:', {
              status: response.status,
              statusText: response.statusText,
              errorText,
              payload: { ...payload, tokens: { ...payload.tokens, access_token: '[REDACTED]' } },
              hasSecret: !!secret,
            })
            
            throw new Error(errorMessage)
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Erro desconhecido ao armazenar token no Netlify'
        throw new Error(errorMessage)
      }
    },
    [getHubSpotIds, hubspotIds],
  )

  const storeToken = useCallback(
    async (tokenResponse: TokenResponse): Promise<void> => {
      const isIframe = window.self !== window.top
      
      console.log('[storeToken] Salvando token no localStorage:', {
        isIframe,
        hasAccessToken: !!tokenResponse.access_token,
        storageKey: tokenStorageKey,
      })

      // Armazena localmente também
      localStorage.setItem(tokenStorageKey, JSON.stringify(tokenResponse))
      
      console.log('[storeToken] ✅ Token salvo no localStorage')
      
      // Se estiver em iframe, envia imediatamente para o HubSpot
      // (não depende do evento storage, que só dispara entre janelas diferentes)
      if (isIframe && window.parent) {
        console.log('[storeToken] Enviando tokens para HubSpot imediatamente após salvar...')
        sendTokensToParent(tokenResponse)
      }
      
      // Atualiza UI
      setShowCard(false)
      setIsLogged(true)
    },
    [sendTokensToParent],
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

  // Listener para receber portalId/accountId via postMessage do HubSpot
  useEffect(() => {
    const handleProvideIds = (event: MessageEvent) => {
      // Aceita mensagens de qualquer origem (HubSpot pode enviar de app.hubspot.com)
      const payload = event.data
      
      if (payload?.type === 'nvoip-provide-ids') {
        const { portalId, accountId } = payload
        
        if (portalId && accountId) {
          console.log('[postMessage] Recebendo IDs do HubSpot:', { portalId, accountId, origin: event.origin })
          setHubspotIds({ portalId, accountId })
        } else {
          console.warn('[postMessage] Mensagem nvoip-provide-ids recebida mas portalId ou accountId ausentes:', payload)
        }
      }
    }

    window.addEventListener('message', handleProvideIds)
    return () => window.removeEventListener('message', handleProvideIds)
  }, [])

  // Solicita IDs ao parent via postMessage se não estiverem disponíveis
  useEffect(() => {
    const requestIdsIfNeeded = async () => {
      const isIframe = window.self !== window.top
      
      // Só solicita se estiver em iframe
      if (!isIframe || !window.parent) return

      // Aguarda um pouco para garantir que o parent esteja pronto
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Verifica se já tem IDs na URL
      const params = new URLSearchParams(window.location.search)
      const hasIdsInUrl = params.get('portalId') && params.get('accountId')
      
      // Se não tem IDs no estado nem na URL, solicita ao parent
      if (!hasIdsInUrl && !hubspotIds) {
        console.log('[postMessage] Solicitando IDs ao parent (HubSpot)...')
        
        try {
          // Envia mensagem pedindo os IDs
          // Usa "*" como targetOrigin para permitir comunicação com qualquer origem (parent do HubSpot)
          window.parent.postMessage({ type: 'nvoip-request-ids' }, '*')
        } catch (error) {
          console.warn('[postMessage] Erro ao solicitar IDs ao parent:', error)
        }
      } else if (hasIdsInUrl) {
        console.log('[postMessage] IDs já disponíveis na URL, não é necessário solicitar')
      } else if (hubspotIds) {
        console.log('[postMessage] IDs já disponíveis no estado, não é necessário solicitar')
      }
    }

    requestIdsIfNeeded()
  }, [hubspotIds])

  // Recupera token ao iniciar se estiver em iframe do HubSpot
  useEffect(() => {
    const loadStoredToken = async () => {
      const isIframe = window.self !== window.top
      
      // Só tenta recuperar se estiver em iframe (contexto HubSpot)
      if (!isIframe) return

      try {
        const storedToken = await retrieveTokenFromNetlify()
        if (storedToken) {
          await storeToken(storedToken)
        }
      } catch (error) {
        console.error('Erro ao carregar token armazenado:', error)
        // Continua normalmente mesmo se não conseguir recuperar
      }
    }

    loadStoredToken()
  }, [retrieveTokenFromNetlify, storeToken])

  // Verifica tokens no localStorage e envia para o HubSpot (fallback/backup)
  useEffect(() => {
    const isIframe = window.self !== window.top
    if (!isIframe || !window.parent) return

    const checkLocalStorageAndSend = () => {
      try {
        const stored = localStorage.getItem(tokenStorageKey)
        console.log('[checkLocalStorageAndSend] Verificando localStorage:', {
          hasStored: !!stored,
          storageKey: tokenStorageKey,
          isIframe: window.self !== window.top,
          hasParent: !!window.parent,
        })
        
        if (stored) {
          try {
            const tokens = JSON.parse(stored) as TokenResponse
            if (tokens && tokens.access_token) {
              console.log('[App] ✅ Token encontrado no localStorage, enviando para HubSpot...', {
                access_token: `${tokens.access_token.substring(0, 20)}...`,
                hasRefreshToken: !!tokens.refresh_token,
              })
              sendTokensToParent(tokens)
            } else {
              console.warn('[App] Token no localStorage mas sem access_token:', tokens)
            }
          } catch (e) {
            console.warn('[App] Erro ao parsear token do localStorage:', e)
          }
        } else {
          console.log('[App] Nenhum token encontrado no localStorage ainda')
        }
      } catch (error) {
        console.warn('[App] Erro ao verificar localStorage:', error)
      }
    }

    // Verifica imediatamente
    checkLocalStorageAndSend()

    // Escuta mudanças no localStorage (quando token é salvo)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === tokenStorageKey && e.newValue) {
        try {
          const tokens = JSON.parse(e.newValue) as TokenResponse
          if (tokens && tokens.access_token) {
            console.log('[App] Mudança detectada no localStorage, enviando tokens para HubSpot...')
            sendTokensToParent(tokens)
          }
        } catch (e) {
          console.warn('[App] Erro ao processar mudança no localStorage:', e)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // Verifica periodicamente como fallback (a cada 3 segundos, por 30 segundos)
    let checkInterval: ReturnType<typeof setInterval> | null = null
    let timeout: ReturnType<typeof setTimeout> | null = null

    checkInterval = setInterval(() => {
      checkLocalStorageAndSend()
    }, 3000)

    timeout = setTimeout(() => {
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
    }, 30000)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      if (checkInterval) clearInterval(checkInterval)
      if (timeout) clearTimeout(timeout)
    }
  }, [sendTokensToParent])

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
            // Se estiver em iframe do HubSpot, armazena no Netlify primeiro
            if (isIframe) {
              try {
                await storeTokenInNetlify(tokenResponse)
              } catch (netlifyError) {
                console.error('Erro ao armazenar token no Netlify:', netlifyError)
                // Notifica erro ao HubSpot se estiver em iframe
                if (window.parent) {
                  window.parent.postMessage(
                    {
                      // Alinha com o listener do HubSpot: "NVOIP_OAUTH_ERROR"
                      type: 'NVOIP_OAUTH_ERROR',
                      message:
                        netlifyError instanceof Error
                          ? netlifyError.message
                          : 'Erro ao armazenar token no Netlify',
                    },
                    HUBSPOT_PARENT_ORIGIN,
                  )
                }
                // Ainda armazena localmente mesmo em caso de erro
              }
            }

            // Armazena localmente e atualiza UI
            await storeToken(tokenResponse)

            // Envia tokens para o HubSpot (parent) quando estiver em iframe
            if (isIframe) {
              console.log('[handleMessage] Modo iframe: enviando tokens para HubSpot via sendTokensToParent')
              sendTokensToParent(tokenResponse)
            } else {
              console.log('[handleMessage] Não está em iframe, não enviando para HubSpot')
            }
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
  }, [sendTokensToParent, storeToken, storeTokenInNetlify])

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
        window.opener?.postMessage({ type: 'NVOIP_OAUTH_ERROR', message }, window.location.origin)
        window.close()
      } else if (isIframe && window.parent) {
        window.parent.postMessage({ type: 'NVOIP_OAUTH_ERROR', message }, HUBSPOT_PARENT_ORIGIN)
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

          // Se estiver em iframe, armazena no Netlify ANTES de qualquer notificação
          let netlifyStoreError: Error | null = null
          if (isIframe) {
            try {
              await storeTokenInNetlify(tokenResponse)
            } catch (netlifyError) {
              netlifyStoreError =
                netlifyError instanceof Error
                  ? netlifyError
                  : new Error('Erro desconhecido ao armazenar token no Netlify')
              console.error('Erro ao armazenar token no Netlify:', netlifyStoreError)
            }
          }

          // Armazena localmente e atualiza UI
          await storeToken(tokenResponse)

          console.log('[handleCode] Token armazenado localmente, verificando contexto:', {
            isPopup,
            isIframe,
            hasParent: !!window.parent,
            hasOpener: !!window.opener,
          })

          if (isPopup) {
            // Para popup, notifica e fecha
            console.log('[handleCode] Modo popup: enviando para opener')
            window.opener?.postMessage(
              { type: 'nvoip-oauth-success', token: tokenResponse },
              window.location.origin,
            )
            window.close()
          } else if (isIframe && window.parent) {
            // Envia tokens para o HubSpot (parent) via postMessage
            console.log('[handleCode] Modo iframe: enviando tokens para HubSpot via sendTokensToParent')
            sendTokensToParent(tokenResponse)

            // Para iframe, só notifica após tentar armazenar no Netlify
            if (netlifyStoreError) {
              // Notifica erro ao HubSpot
              window.parent.postMessage(
                {
                  type: 'NVOIP_OAUTH_ERROR',
                  message: netlifyStoreError.message,
                  token: tokenResponse, // Envia token mesmo em caso de erro para permitir retry
                },
                HUBSPOT_PARENT_ORIGIN,
              )
            } else {
              // Notifica sucesso ao HubSpot
              window.parent.postMessage(
                { type: 'nvoip-oauth-success', token: tokenResponse },
                HUBSPOT_PARENT_ORIGIN,
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
              { type: 'NVOIP_OAUTH_ERROR', message: errorMessage },
              HUBSPOT_PARENT_ORIGIN,
            )
          } else {
            await finishWithError(errorMessage)
          }
        }
      }

    handleCode()
  }, [exchangeToken, sendTokensToParent, storeToken, storeTokenInNetlify])

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
