// Modulo Autenticazione & Gestione Profilo Aziendale
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
