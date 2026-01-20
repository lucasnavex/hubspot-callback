/**
 * Script para enviar tokens do localStorage do iframe para o HubSpot
 * 
 * Adicione este script na página que roda no iframe (Netlify)
 * Ele detecta automaticamente tokens no localStorage e envia via postMessage
 */

(function() {
  'use strict';

  console.log('[Iframe Token Sender] Script carregado');

  // Origem do parent HubSpot (pode ser configurada via variável de ambiente ou usar padrão)
  const HUBSPOT_PARENT_ORIGIN = window.HUBSPOT_PARENT_ORIGIN || 'https://app.hubspot.com';

  // Função para enviar tokens para a página principal (HubSpot)
  function sendTokensToParent(tokens) {
    if (!tokens || !tokens.access_token) {
      console.warn('[Iframe Token Sender] Tokens inválidos ou sem access_token');
      return false;
    }

    console.log('[Iframe Token Sender] Enviando tokens para HubSpot:', {
      access_token: `${tokens.access_token.substring(0, 20)}...`,
      has_refresh_token: !!tokens.refresh_token,
      expires_in: tokens.expires_in,
      token_type: tokens.token_type
    });

    try {
      window.parent.postMessage(
        {
          type: "NVOIP_OAUTH_TOKENS",
          tokens: {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            scope: tokens.scope
          }
        },
        HUBSPOT_PARENT_ORIGIN
      );
      console.log('[Iframe Token Sender] Mensagem enviada com sucesso para:', HUBSPOT_PARENT_ORIGIN);
      return true;
    } catch (error) {
      console.error('[Iframe Token Sender] Erro ao enviar mensagem:', error);
      return false;
    }
  }

  // Função para buscar tokens no localStorage
  function findTokensInLocalStorage() {
    // Lista de possíveis chaves onde o token pode estar armazenado
    // Inclui a chave padrão usada pelo App.tsx: 'nvoip.oauth.token'
    const possibleKeys = [
      'nvoip.oauth.token',  // Chave padrão do App.tsx
      'nvoip_tokens',
      'nvoip_access_token',
      'access_token',
      'tokens',
      'oauth_tokens',
      'auth_tokens'
    ];

    for (const key of possibleKeys) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.access_token) {
              console.log(`[Iframe Token Sender] Tokens encontrados na chave: ${key}`);
              return parsed;
            }
          } catch (e) {
            // Se não for JSON válido, pode ser apenas o access_token como string
            if (key.includes('access_token') || key.includes('token')) {
              console.log(`[Iframe Token Sender] Access token encontrado como string na chave: ${key}`);
              return { access_token: stored };
            }
          }
        }
      } catch (error) {
        console.warn(`[Iframe Token Sender] Erro ao ler chave ${key}:`, error);
      }
    }

    return null;
  }

  // Função principal para verificar e enviar tokens
  function checkAndSendTokens() {
    const tokens = findTokensInLocalStorage();
    
    if (tokens && tokens.access_token) {
      const sent = sendTokensToParent(tokens);
      if (sent) {
        // Se enviou com sucesso, pode parar de verificar
        return true;
      }
    } else {
      console.log('[Iframe Token Sender] Nenhum token encontrado no localStorage');
    }
    
    return false;
  }

  // Executar imediatamente quando o script carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      console.log('[Iframe Token Sender] DOM carregado, verificando tokens...');
      checkAndSendTokens();
    });
  } else {
    console.log('[Iframe Token Sender] DOM já carregado, verificando tokens...');
    checkAndSendTokens();
  }

  // Escutar mudanças no localStorage (caso o token seja salvo depois)
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.includes('token') || e.key.includes('oauth'))) {
      console.log('[Iframe Token Sender] Mudança detectada no localStorage:', e.key);
      setTimeout(checkAndSendTokens, 100);
    }
  });

  // Verificar periodicamente (fallback - a cada 2 segundos)
  let checkInterval = setInterval(function() {
    const sent = checkAndSendTokens();
    if (sent) {
      // Se enviou com sucesso, pode parar de verificar (opcional)
      // clearInterval(checkInterval);
    }
  }, 2000);

  // Parar de verificar após 30 segundos (evitar loop infinito)
  setTimeout(function() {
    clearInterval(checkInterval);
    console.log('[Iframe Token Sender] Verificação periódica encerrada após 30s');
  }, 30000);

  // Expor função globalmente caso precise chamar manualmente
  window.sendNvoipTokensToParent = function() {
    return checkAndSendTokens();
  };

  console.log('[Iframe Token Sender] Listener configurado. Use window.sendNvoipTokensToParent() para enviar manualmente.');
})();
