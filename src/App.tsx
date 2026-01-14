import './App.css'
import { nvoipAuthConfig } from './app/settings/nvoipAuth'

function App() {
  const { redirectUri, fallbackRedirect, permittedUrls } = nvoipAuthConfig

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Callback HubSpot · Netlify</p>
        <h1>Configuração do callback `/nvoip-oauth-callback`</h1>
        <p>
          Esta aplicação entrega um handler Netlify que replica o callback OAuth da Nvoip e reconstrói o
          estado antes de redirecionar o usuário de volta ao HubSpot.
        </p>
      </section>

      <section className="panel-grid">
        <article>
          <h2>Rotas</h2>
          <ul>
            <li>
              <strong>Redirect</strong>: <code>{redirectUri}</code>
            </li>
            <li>
              <strong>Fallback</strong>: <code>{fallbackRedirect}</code>
            </li>
          </ul>
        </article>

        <article>
          <h2>Permissões</h2>
          <p>Domínios liberados nas chamadas HubSpot:</p>
          <ul>
            {permittedUrls.fetch.map((url) => (
              <li key={`fetch-${url}`}>
                FETCH · <code>{url}</code>
              </li>
            ))}
            {permittedUrls.iframe.map((url) => (
              <li key={`iframe-${url}`}>
                IFRAME · <code>{url}</code>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Credenciais</h2>
          <p>
            Encontre os valores atuais no painel HubSpot ou via variáveis de ambiente Netlify:
          </p>
          <ul>
            <li>
              <code>VITE_HUBSPOT_CLIENT_ID</code>
            </li>
            <li>
              <code>VITE_HUBSPOT_CLIENT_SECRET</code> (mesmo valor usado no handler Netlify)
            </li>
          </ul>
        </article>

        <article>
          <h2>Documentação</h2>
          <p>
            Confira o plano detalhado em <code>docs/netlify-callback-plan.md</code> e valide com{' '}
            <code>netlify dev</code> + <code>hs project upload</code>.
          </p>
        </article>
      </section>
    </main>
  )
}

export default App
