export type HubspotRunServerlessFunctionResponse = {
  app?: {
    portalId?: string
    accountId?: string
  }
  [key: string]: unknown
}

export type HubspotRunServerlessFunctionOptions = {
  name: string
  parameters?: Record<string, unknown>
}

declare global {
  interface Window {
    hubspot?: {
      serverless?: {
        runServerlessFunction: (
          options: HubspotRunServerlessFunctionOptions,
        ) => Promise<HubspotRunServerlessFunctionResponse>
      }
      fetch?: (url: string, options?: RequestInit) => Promise<Response>
      app?: {
        portalId?: string
        accountId?: string
      }
    }
  }
}

export {}
