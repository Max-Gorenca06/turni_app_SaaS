// Configurazione centralizzata del Client Supabase e Costanti SaaS
export const SUPABASE_CONFIG = {
    URL: 'https://mrwjqeachzcmnwahnqjn.supabase.co',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yd2pxZWFjaHpjbW53YWhucWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDcxMTksImV4cCI6MjA5MzcyMzExOX0.S1WVO4y59azzM-iQss_836KHtK1gnmpfglRXZ1KRKdQ'
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
