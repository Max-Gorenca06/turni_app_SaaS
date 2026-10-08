export const SUPABASE_CONFIG = {
    URL: 'https://api.158.180.239.147.sslip.io',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDQ4MTcwLCJleHAiOjIxMDY4MDgxNzB9.v6w9RwQBBKxdC0-sN08whXB0NjRbWgy_tCzuX_piuWk'
};

export function getSupabaseClient() {
    if (window.supabaseClient) {
        return window.supabaseClient;
    }
    if (typeof supabase !== 'undefined') {
        try {
            window.supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
            return window.supabaseClient;
        } catch (err) {
            console.error("Errore inizializzazione Supabase client:", err);
            return null;
        }
    }
    console.warn("Libreria Supabase non caricata.");
    return null;
}
