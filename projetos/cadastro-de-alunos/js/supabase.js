import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.5/+esm';
import { SUPABASE_URL, SUPABASE_CHAVE } from './config.js';

// Cliente único do app. A storageKey própria isola a sessão de outros apps do mesmo domínio
// e é a chave que a Sala de Testes usa para rodar o app logado.
export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: {
    storageKey: 'sq_cadastro_de_al_d0f3_auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
