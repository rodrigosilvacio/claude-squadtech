# Bibliotecas de terceiros (vendorizadas)

Copiadas do npm com versão fixa, para o site não depender de CDN e funcionar igual em qualquer ambiente.

| Arquivo | Pacote | Versão | Licença |
|---|---|---|---|
| `supabase-2.110.5.js` | `@supabase/supabase-js` (build UMD, `dist/umd/supabase.js`) | 2.110.5 | MIT |
| `marked-12.0.2.esm.js` | `marked` (`lib/marked.esm.js`) | 12.0.2 | MIT |
| `purify-3.1.6.es.mjs` | `dompurify` (`dist/purify.es.mjs`) | 3.1.6 | Apache-2.0 ou MPL-2.0 |

Para atualizar: `npm pack <pacote>@<versão>`, extraia e substitua o arquivo, mudando o nome e as importações.
