const DEFAULT_SCOPES = 'openid call:make call:query sms:send whatsapp:send whatsapp:templates'

export const nvoipAuthConfig = {
  redirectUri: 'https://integration-nvoip.netlify.app/nvoip-oauth-callback',
  fallbackRedirect: 'https://integration-nvoip.netlify.app/nvoip-oauth-callback',
  clientId: import.meta.env.VITE_HUBSPOT_CLIENT_ID ?? 'Hubspot',
  clientSecret: import.meta.env.VITE_HUBSPOT_CLIENT_SECRET ?? 'c4d7a76a-4239-4dd9-ac1d-530a0e4098e2',
  authUrl:
    import.meta.env.VITE_NVOIP_AUTH_URL ?? 'https://api.nvoip.com.br/auth/oauth2/authorize',
  tokenExchangeUrl: '/.netlify/functions/nvoip-token-exchange',
  appRedirectPath: import.meta.env.VITE_APP_REDIRECT_PATH ?? '/',
  scopes: (import.meta.env.VITE_NVOIP_SCOPES ?? DEFAULT_SCOPES)
    .split(',')
    .map((scope: string) => scope.trim())
    .filter(Boolean),
  permittedUrls: {
    fetch: ['https://integration-nvoip.netlify.app', 'http://localhost:4000'],
    iframe: ['https://integration-nvoip.netlify.app'],
  },
  tokenBackendUrl: import.meta.env.VITE_NVOIP_TOKEN_BACKEND_URL ?? 'http://localhost:4000',
}
