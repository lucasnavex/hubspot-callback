export const nvoipAuthConfig = {
  redirectUri: 'https://hubspot-callback.netlify.app/nvoip-oauth-callback',
  fallbackRedirect: 'https://hubspot-callback.netlify.app/nvoip-oauth-callback',
  clientId: import.meta.env.VITE_HUBSPOT_CLIENT_ID ?? '<seu-client-id-da-hubspot>',
  clientSecret: import.meta.env.VITE_HUBSPOT_CLIENT_SECRET ?? 'c4d7a76a-4239-4dd9-ac1d-530a0e4098e2',
  permittedUrls: {
    fetch: ['https://hubspot-callback.netlify.app'],
    iframe: ['https://hubspot-callback.netlify.app'],
  },
}
