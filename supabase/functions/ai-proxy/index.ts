// Supabase Edge Function: AI Proxy for Gemini
// The Gemini key lives here as an env var — never in frontend code
// Deploy: supabase functions deploy ai-proxy
// Set secret: supabase secrets set GEMINI_API_KEY=your_key_here

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { prompt, maxTokens = 400, systemPrompt } = body;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    // gemini-2.5-flash secretly spends part of maxOutputTokens on internal
    // "thinking", which truncates the actual user-visible reply. Disable it
    // (thinkingBudget: 0) so the full budget goes to the response. We also
    // floor maxOutputTokens at 512 — under that, Hebrew replies were getting
    // cut mid-word for Liya in the dialogue screen.
    const effectiveMaxTokens = Math.max(maxTokens || 400, 512);
    const geminiBody: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: effectiveMaxTokens,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    if (systemPrompt) {
      geminiBody.system_instruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
