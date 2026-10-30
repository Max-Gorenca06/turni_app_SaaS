import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // Verifica autenticazione del chiamante (deve essere autenticato)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Autenticazione richiesta" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Sessione non valida o scaduta" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verifica che l'utente sia SuperAdmin o Admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: saRow } = await supabaseAdmin
      .from("superadmins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const { data: profRow } = await supabaseAdmin
      .from("profili")
      .select("ruolo")
      .eq("id", userData.user.id)
      .limit(1)
      .maybeSingle();

    const isAllowed = Boolean(saRow) || Boolean(profRow);
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: "Permessi insufficienti per inviare email" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const to = (body.to || "").trim();
    const subject = (body.subject || "").trim();
    const message = (body.message || "").trim();
    const html = body.html || "";

    if (!to || !subject || (!message && !html)) {
      return new Response(
        JSON.stringify({ error: "Parametri mancanti: destinatario (to), oggetto (subject) e messaggio sono obbligatori" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || "587");
    const smtpUser = Deno.env.get("SMTP_USER") || "";
    const smtpPass = Deno.env.get("SMTP_PASS") || "";
    const senderEmail = Deno.env.get("SMTP_ADMIN_EMAIL") || smtpUser;
    const senderName = Deno.env.get("SMTP_SENDER_NAME") || "Turni Cloud Pro";

    if (!smtpUser || !smtpPass) {
      return new Response(
        JSON.stringify({ error: "Credenziali SMTP non configurate sul server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const formattedHtml = html || `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 24px 32px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px;">TurniCloud<span style="color: #3b82f6;">.PRO</span></h2>
        </div>
        <div style="padding: 32px; color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <div style="background: #f8fafc; padding: 16px 32px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
          Inviato da ${senderName} • Gestione Intelligente Turni & Presenze
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to,
      subject,
      text: message,
      html: formattedHtml,
    });

    return new Response(
      JSON.stringify({ ok: true, messageId: info.messageId, to }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Errore send-email:", err);
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
