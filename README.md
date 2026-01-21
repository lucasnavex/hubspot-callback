# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Local HTTPS

The dev server runs on HTTPS by default. If no certs are provided, Vite will
generate a self-signed certificate at runtime. For a trusted local cert, use mkcert.

### Trusted cert with mkcert (Windows)

1. Install mkcert: `choco install mkcert`
2. Generate a local CA: `mkcert -install`
3. Create certs in the project root:

```
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1
```

4. Start dev server (defaults to `certs/localhost*.pem`, or override with env vars):

```
set VITE_DEV_HTTPS_KEY=certs\localhost-key.pem
set VITE_DEV_HTTPS_CERT=certs\localhost.pem
npm run dev
```

## Fluxo de tokens OAuth

### Arquitetura geral

- O iframe hospedado em Netlify (`App.tsx`) inicia o OAuth, troca o `code` pelo `access_token` via `nvoip-token-exchange` e guarda o `TokenResponse` em `localStorage` sob a chave `nvoip.oauth.token`.
- Assim que o iframe consegue o token, ele dispara `postMessage` para o overlay HubSpot (`nvoip-oauth-success`). Se já havia token no `localStorage`, um segundo `postMessage` (`nvoip-token-from-local-storage`) acontece logo na montagem, permitindo que o cartão identifique o token sem novo login.
- O cartão de configurações (`src/app/settings/index.tsx`) lê `portalId`/`accountId`, responde aos eventos do iframe e chama o backend via `hubspot.fetch` para persistir/recuperar tokens.

### Backend de tokens

- Há duas formas de expor os endpoints `POST /tokens/store` e `GET /tokens/retrieve`:
  1. **Backend em Node (local)**: o protótipo está em `token-backend/server.js` e é iniciado com `cd token-backend && npm install && npm start`. Ele usa um `Map<string, Tokens>` em memória com as mesmas validações descritas abaixo.
  2. **App Function do HubSpot**: `src/app/app.functions/tokenStorage.js` oferece a mesma lógica diretamente no HubSpot, com as rotas configuradas em `src/app/app.functions/serverless.json`.
- Em ambos os casos, a resposta de `POST /tokens/store` devolve `{ portalId, accountId, tokens }` com `tokens` contendo o `access_token` e o carimbo `storedAt`. O `GET /tokens/retrieve` valida `portalId/accountId` e retorna `200` com os dados ou `404` se não houver entrada.
- Tokens ficam apenas em memória. Sempre que o processo for reiniciado ou o container escalar, o mapa é limpo e o cartão deve ocorrer com novo login ou detectar `404`.

### Configuração do settings card

- A variável `VITE_NVOIP_TOKEN_BACKEND_URL` define a URL base para o backend (ex.: `http://localhost:4000` ou `https://<seu-host>/tokens`). No `.env` local ou no painel do deploy, ajuste para o endpoint que estiver em execução. O valor padrão é `http://localhost:4000`, que combina com o backend Node local.
- Além disso, garanta que `permittedUrls.fetch` em `src/app/app-hsmeta.json` inclui o domínio desse backend (já listamos `http://localhost:4000` e `https://integration-nvoip.netlify.app` como exemplos). A variável `nvoipAuthConfig.permittedUrls.iframe` também deve incluir o host que serve o iframe.
- O cartão serializa requisições com `JSON.stringify`, trata `response.ok` corretamente e interpreta `404` do `GET /tokens/retrieve` como “nenhum token salvo ainda”. Assim que recebe o evento `nvoip-oauth-success` ou `nvoip-token-from-local-storage`, ele chama `persistTokensToBackend` com os dados e atualiza o estado de “autenticado”.
- Ao recarregar o cartão, `fetchTokensFromBackend` é chamado; se houver dados persistidos, o card mostra o `access_token`, o `refresh_token` e o `scope`, mantendo o estado em `status = ready`.

### Sincronização com o localStorage

- Na inicialização do iframe, `App.tsx` lê o `localStorage` (`nvoip.oauth.token`), marca o usuário como logado, oculta o card local e envia `postMessage` com o token encontrado quando estiver dentro do iframe do HubSpot.
- Caso o valor salvo esteja inválido (JSON mal-formado ou `access_token` ausente), ele é limpo automaticamente para forçar o OAuth novamente.

### Observações e limitações

- O backend (node ou function) é um protótipo em memória. Use-o para validar o fluxo localmente, mas substitua por persistência real e controles de segurança antes de avançar para produção.
- Os tokens são isolados por `portalId` e `accountId`, evitando vazamentos entre contas diferentes no HubSpot.
- Os callbacks `nvoip-oauth-success`, `nvoip-oauth-error` e `nvoip-token-from-local-storage` devem sempre ser tratados no cartão para manter o estado sincronizado e reenvio automático quando necessário.
