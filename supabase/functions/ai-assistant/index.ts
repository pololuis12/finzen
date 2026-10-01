// ============================================================
// FinZen · Edge Function "ai-assistant"
// Recibe un mensaje del usuario, arma el contexto financiero REAL
// (usando su propia sesión/JWT, respetando RLS) y consulta a Claude.
//
// Desplegar:  supabase functions deploy ai-assistant
// Secreto:    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// ============================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    // Cliente con la sesión del usuario -> el RLS filtra automáticamente sus datos
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "No autorizado" }, 401);

    const { message } = await req.json();
    if (!message) return json({ error: "Falta 'message'" }, 400);

    // ---- Contexto financiero real del usuario (últimos datos) ----
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthISO = monthStart.toISOString().slice(0, 10);

    const [{ data: summary }, { data: balances }, { data: debts }, { data: investments }, { data: recent }] =
      await Promise.all([
        supabase.rpc("monthly_summary", { p_month: monthISO }),
        supabase.from("account_balances").select("name,bank,type,current_balance,currency"),
        supabase.from("debts").select("counterparty,direction,principal,status").eq("status", "open"),
        supabase.from("investments").select("name,type,amount_invested,current_value"),
        supabase.from("transactions").select("type,expense_type,amount,description,occurred_at")
          .order("occurred_at", { ascending: false }).limit(15),
      ]);

    const context = {
      resumen_mes_actual: summary?.[0] ?? null,
      cuentas: balances ?? [],
      deudas_abiertas: debts ?? [],
      inversiones: investments ?? [],
      transacciones_recientes: recent ?? [],
    };

    // ---- Guardar el mensaje del usuario ----
    await supabase.from("ai_messages").insert({ user_id: user.id, role: "user", content: message });

    // ---- Llamada a Claude ----
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Falta ANTHROPIC_API_KEY" }, 500);

    const system = [
      "Eres el asistente financiero personal de FinZen. Respondes en español, claro y directo.",
      "Usas SOLO los datos del contexto para analizar ingresos, egresos (fijos/normales/casuales),",
      "cuentas, deudas e inversiones. Das consejos prácticos y accionables sobre ahorro, presupuesto",
      "y salud financiera. Si faltan datos, dilo. Montos en la moneda indicada (por defecto COP).",
      "No inventes cifras que no estén en el contexto.",
      "Contexto financiero (JSON): " + JSON.stringify(context),
    ].join(" ");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: message }],
      }),
    });

    const data = await resp.json();
    const text = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n") || "No pude generar una respuesta.";

    await supabase.from("ai_messages").insert({ user_id: user.id, role: "assistant", content: text });

    return json({ reply: text });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}
