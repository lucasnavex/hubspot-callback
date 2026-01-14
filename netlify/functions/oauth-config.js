exports.handler = async () => {
  const config = {
    clientId: process.env.HUBSPOT_CLIENT_ID ?? 'Hubspot',
    redirectUri:
      process.env.HUBSPOT_REDIRECT_URI ?? 'https://hubspot-callback.netlify.app/nvoip-oauth-callback',
    scope: process.env.NVOIP_OAUTH_SCOPES ?? 'openid call:make call:query sms:send whatsapp:send whatsapp:templates',
    authHost: process.env.NVOIP_AUTH_HOST ?? 'https://api.nvoip.com.br',
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  }
}
