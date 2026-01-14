import axios from "axios"

const AUTH_CONFIG = {
  clientId: "N8N-Test",
  clientSecret: "923683fc-02d4-4c24-b5a8-a34c642a0cf6",
  // Use current origin to avoid HTTPS/HTTP mismatch and hardcoded host
  redirectUri: `${window.location.origin}/integrations?integration=n8n`,
  authHost: "https://api.nvoip.com.br",
  scope:
    "openid call:make call:query sms:send whatsapp:send whatsapp:templates",
  state: Math.random().toString(36).slice(2)
}

class OAuthService {
  constructor() {
    this.config = AUTH_CONFIG
    this.basicAuth = `Basic ${btoa(
      `${this.config.clientId}:${this.config.clientSecret}`
    )}`
  }

  getAuthorizationUrl() {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state: this.config.state
    })
    return `${this.config.authHost}/auth/oauth2/authorize?${params.toString()}`
  }

  async exchangeCodeForTokens(code) {
    const tokenUrl = `${this.config.authHost}/auth/oauth2/token`
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri
    })

    try {
      const res = await axios.post(tokenUrl, body.toString(), {
        headers: {
          Authorization: this.basicAuth,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      })
      return res.data
    } catch (err) {
      if (err?.response?.status === 401) {
        const fallbackBody = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret
        })
        const res2 = await axios.post(tokenUrl, fallbackBody.toString(), {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        })
        return res2.data
      }
      throw err
    }
  }

  async exchangePasswordForTokens(username, password) {
    const tokenUrl = `${this.config.authHost}/v2/oauth/token`
    const body = new URLSearchParams({
      grant_type: "password",
      username,
      password
    })
    const res = await axios.post(tokenUrl, body.toString(), {
      headers: {
        Authorization: this.basicAuth,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })
    return res.data
  }

  async refreshAccessToken(refreshToken) {
    const tokenUrl = `${this.config.authHost}/v2/oauth/token`

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    })

    try {
      const response = await axios.post(tokenUrl, body.toString(), {
        headers: {
          Authorization: this.basicAuth,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      })
      return response.data.access_token
    } catch (error) {
      throw new Error("Falha ao atualizar token")
    }
  }
}

export const oAuthService = new OAuthService()
export const getAuthUrl = () => oAuthService.getAuthorizationUrl()
export const exchangeCodeForToken = (code) =>
  oAuthService.exchangeCodeForTokens(code)
export const getAccessToken = (refreshToken) =>
  oAuthService.refreshAccessToken(refreshToken)
