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
    return new Response(JSON.stringify({ text: "", error: "GEMINI_API_KEY not set" }), {
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

    // Surface upstream non-2xx (auth/rate/etc.) instead of silently returning
    // empty text — the frontend logs whatever comes back, so giving it real
    // diagnostics helps debugging.
    if (!res.ok) {
      let upstreamMsg = "";
      try {
        const errBody = await res.json();
        upstreamMsg = errBody?.error?.message || JSON.stringify(errBody).slice(0, 300);
      } catch {
        try { upstreamMsg = (await res.text()).slice(0, 300); } catch { /* noop */ }
      }
      return new Response(
        JSON.stringify({
          text: "",
          error: `gemini-upstream-${res.status}`,
          upstreamStatus: res.status,
          upstreamMessage: upstreamMsg,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || "";

    // Empty text from a 200 response usually means: safety block, recitation
    // block, or MAX_TOKENS hit before any visible text was emitted. Pass that
    // back to the caller so it can show a sensible message instead of going
    // silent.
    if (!text) {
      const finishReason = candidate?.finishReason || "EMPTY";
      const blockReason = data?.promptFeedback?.blockReason || null;
      const safetyRatings = candidate?.safetyRatings || data?.promptFeedback?.safetyRatings || null;
      return new Response(
        JSON.stringify({
          text: "",
          error: blockReason ? `blocked-${blockReason}` : `empty-${finishReason}`,
          finishReason,
          blockReason,
          safetyRatings,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ text: "", error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
