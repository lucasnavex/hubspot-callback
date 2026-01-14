const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const buildReturnUrl = (portalId, accountId) =>
  `https://app.hubspot.com/integrations-settings/${portalId}/installed/framework/28600665/general-settings?accountId=${encodeURIComponent(
    accountId ?? '',
  )}`

const buildState = ({ portalId, accountId, returnUrl }) => {
  const payload = {
    portalId,
    accountId,
    returnUrl,
    nonce: Math.random().toString(36).slice(2),
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

const createIframeUrl = ({ portalId, accountId, returnUrl, state }) => {
  const iframe = new URL('https://hubspot-callback.netlify.app/nvoip-oauth-iframe')
  iframe.searchParams.set('portalId', portalId ?? '')
  iframe.searchParams.set('accountId', accountId ?? '')
  iframe.searchParams.set('returnUrl', returnUrl ?? '')
  iframe.searchParams.set('state', state ?? '')
  iframe.searchParams.set('nonce', Math.random().toString(36).slice(2))
  return iframe.toString()
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    }
  }

  const params =
    event.httpMethod === 'POST' && event.body
      ? JSON.parse(event.body)
      : event.queryStringParameters ?? {}

  const portalId = params.portalId || params.portal_id || 'unknown'
  const accountId = params.accountId || params.account_id || 'unknown'
  const returnUrl =
    params.returnUrl ||
    params.return_url ||
    buildReturnUrl(portalId, accountId)

  const state = buildState({ portalId, accountId, returnUrl })

  console.info('iframe handler state:', {
    portalId,
    accountId,
    returnUrl,
    state,
  })

  const iframeUrl = createIframeUrl({ portalId, accountId, returnUrl, state })

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      response: {
        iframeUrl,
      },
      state,
      portalId,
      accountId,
      returnUrl,
    }),
  }
}
