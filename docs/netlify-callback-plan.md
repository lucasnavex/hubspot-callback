# Plano de callback Netlify

## 1. Configuração do site Netlify

- **Domínio alvo:** `https://hubspot-callback.netlify.app`
- **Function path:** `/nvoip-oauth-callback` exposto via `netlify/functions/nvoip-oauth-callback`
- **Build:** `npm run build` e publicação via `hs project upload`
- **Public:** o `App` está renderizando uma página estática com instruções; o callback ocorre na função serverless

## 2. Handler Netlify (`netlify/functions/nvoip-oauth-callback.js`)

- Recebe o `code`, `state`, `error` e quaisquer query params enviados pela Nvoip.
- Decodifica `state` (base64 JSON) para validar e reconstruir `returnUrl`, `accountId` e `portalId`.
- Tenta trocar o `code` por tokens chamando `https://api.nvoip.com.br/auth/oauth2/token` usando `HUBSPOT_CLIENT_ID`/`HUBSPOT_CLIENT_SECRET`; o resultado (access/refresh) fica visível nos logs e pode ser guardado conforme necessário.
- Reconstrói a URL de destino (priorizando o `returnUrl` contido no state) e anexa `nvoip_code`, `nvoip_state`, `error`, `portalId` e `accountId`.
- Retorna um 302 para o HubSpot com cabeçalhos CORS (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`).
- Responde `OPTIONS` com 204 para permitir preflight.

## 3. Handler iframe (`netlify/functions/hs-iframe-handler.js`)

- Recebe `portalId`, `accountId`, `returnUrl`/`actionUrl` e outros dados enviados pelo HubSpot ao abrir o botão externo no card de settings (GET ou POST).
- Gera o `state` com o mesmo padrão usado em `buildState()` (returnUrl → `https://app.hubspot.com/.../general-settings?accountId=…`) e loga os valores para ajudar na validação dos parâmetros dinâmicos.
- Retorna `{ response: { iframeUrl: "https://hubspot-callback.netlify.app/nvoip-oauth-iframe?..."} }` para que o HubSpot abra um iframe mostrando o botão de autenticação, o `state` e campos de token.
- As URLs dinâmicas (`portalId`, `accountId`, `returnUrl`) seguem a mesma fórmula usada no state e garantem que o callback final volte ao mesmo local.

## 4. iframe público (`public/nvoip-oauth-iframe.html`)

- Carrega o `portalId`, `accountId`, `state` e `returnUrl` passados pelo handler.
- Busca a configuração de OAuth via `/.netlify/functions/oauth-config` (clientId, redirectUri, scope, authHost).
- Inicia automaticamente a URL de autorização da Nvoip assim que a página é carregada, sem exibir botões adicionais.
- Serve como a “página interna” que o HubSpot renderiza dentro do iframe ao clicar no botão de URL externa, mantendo todo o fluxo dentro da tela de settings.

## 3. Variáveis de ambiente Netlify

- `HUBSPOT_CLIENT_ID` → client_id oficial do app HubSpot.
- `HUBSPOT_CLIENT_SECRET` → `c4d7a76a-4239-4dd9-ac1d-530a0e4098e2` (pode ser redefinido no painel).
- `HUBSPOT_TOKEN_URL` → (opcional) endpoint de token; padrão `https://api.nvoip.com.br/auth/oauth2/token`.
- `HUBSPOT_REDIRECT_URI` → `https://hubspot-callback.netlify.app/nvoip-oauth-callback`.
- `VITE_HUBSPOT_CLIENT_ID`/`VITE_HUBSPOT_CLIENT_SECRET` → expõe as credenciais para o frontend, evitando hardcode.
- O handler usa `HUBSPOT_REDIRECT_URI` para reforçar o destino e as credenciais para trocar o `code` por token em `/auth/oauth2/token` antes de gerar o redirect.

## 4. Fluxo OAuth (Authorization Code)

1. HubSpot abre o OAuth da Nvoip apontando para o callback configurado.
2. Nvoip redireciona para `https://hubspot-callback.netlify.app/nvoip-oauth-callback` com `code`, `state`, `error`.
3. O handler decodifica o `state`, valida os dados (`returnUrl`, `portalId`, `accountId`) e monta o redirect para o HubSpot.
4. O usuário é redirecionado com `nvoip_code`, `nvoip_state` e `error` (se houver) no query string.
5. Opcional: o handler pode usar o `code` + credenciais para trocar token em `/auth/oauth2/token`.

## 5. Testes e deploy

- Local: `netlify dev` para validar o handler e inspecionar logs da função.
- Build: `npm run build` seguido de `hs project upload` com o endpoint Netlify publicado.
- Fluxo real: executar OAuth HubSpot/Nvoip e confirmar o redirect para `https://hubspot-callback.netlify.app/nvoip-oauth-callback`.
- Verificar nos logs Netlify que `state` foi decodificado e o redirect final contém `nvoip_code/nvoip_state`.

## 6. Lista de funções

- `nvoip-oauth-callback` (callback principal, reenvia `state` e codes).
- Futuro: job de refresh token (usa o `refresh_token`, se necessário).
- Documentar enumerações e flows no README/documento principal.

## 7. Diagrama

```mermaid
flowchart LR
  HubSpotApp["HubSpot App card"] -->|abre OAuth| NvoipAuth["Nvoip OAuth endpoint"]
  NvoipAuth -->|redirect with code/state| NetlifyCallback["Netlify function /nvoip-oauth-callback"]
  NetlifyCallback -->|302 redirect com nvoip_code/nvoip_state| HubSpotApp
```
