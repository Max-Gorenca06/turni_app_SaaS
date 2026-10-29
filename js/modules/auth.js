// Modulo Autenticazione & Isolamento Multi-Owner Aziende
import { getSupabaseClient } from '../config.js';

export async function checkLoginState(onSuccess, onFail) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
        if (onFail) onFail();
        return { isLoggedIn: false, session: null };
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const isLoggedIn = !!session;
        if (isLoggedIn && onSuccess) {
            onSuccess(session);
        } else if (!isLoggedIn && onFail) {
            onFail();
        }
        return { isLoggedIn, session };
    } catch (err) {
        console.error("Errore verifica sessione:", err);
        if (onFail) onFail();
        return { isLoggedIn: false, session: null };
    }
}

export async function fetchUserAziende(userId) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return [];

    try {
        // 1. Usa la RPC SECURITY DEFINER get_my_aziende() che restituisce solo le aziende
        //    dell'utente autenticato (o tutte se l'utente è SuperAdmin)
        const { data: rpcAziende, error: rpcError } = await supabaseClient.rpc('get_my_aziende');
        if (!rpcError && Array.isArray(rpcAziende)) {
            return rpcAziende;
        }

        // 2. Fallback client-side se la RPC non è ancora disponibile
        if (!userId) return [];
        const { data: profList } = await supabaseClient
            .from('profili')
            .select('azienda_id')
            .eq('id', userId);

        const myIds = (profList || []).map(p => p.azienda_id).filter(Boolean);
        if (myIds.length === 0) return [];

        const { data: aziendeList } = await supabaseClient
            .from('aziende')
            .select('*')
            .in('id', myIds);

        return aziendeList || [];
    } catch (err) {
        console.error("Errore caricamento aziende utente:", err);
        return [];
    }
}

export async function loginUser(email, password) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase non disponibile");

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function registerUser(email, password) {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) throw new Error("Supabase non disponibile");

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

export async function logoutUser() {
    const supabaseClient = getSupabaseClient();
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
}

if (typeof window !== 'undefined') {
    window.TurniAuth = {
        checkLoginState,
        fetchUserAziende,
        loginUser,
        registerUser,
        logoutUser
    };
}
