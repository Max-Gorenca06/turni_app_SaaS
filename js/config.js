export const SUPABASE_CONFIG = {
    URL: 'https://api.158.180.239.147.sslip.io',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxNDQ4MTcwLCJleHAiOjIxMDY4MDgxNzB9.v6w9RwQBBKxdC0-sN08whXB0NjRbWgy_tCzuX_piuWk'
};

export function getSupabaseClient() {
    if (typeof window !== 'undefined' && window.supabaseClient) {
        return window.supabaseClient;
    }
    if (typeof supabase !== 'undefined') {
        try {
            const client = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
            if (typeof window !== 'undefined') {
                window.supabaseClient = client;
            }
            return client;
        } catch (err) {
            console.error("Errore inizializzazione Supabase client:", err);
            return null;
        }
    }
    console.warn("Libreria Supabase non caricata.");
    return null;
}

if (typeof window !== 'undefined') {
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;
    window.getSupabaseClient = getSupabaseClient;
}

