// @ts-nocheck
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { word } = await req.json();
    if (!word || typeof word !== 'string') {
      return new Response(
        JSON.stringify({ error: 'word required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Tra cứu phiên âm và file âm thanh từ Free Dictionary API
    let phonetic_uk = '';
    let phonetic_us = '';
    let audio_uk_url = '';
    let audio_us_url = '';
    let example = '';

    try {
      const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`);
      if (dictRes.ok) {
        const arr = await dictRes.json();
        const entry = Array.isArray(arr) ? arr[0] : null;
        const phs: any[] = entry?.phonetics || [];
        for (const p of phs) {
          const src = (p.sourceUrl || p.audio || '') as string;
          const isUk = /uk|british|-gb\b/i.test(src) || /uk/i.test(p.audio || '');
          const isUs = /us|american|-us\b/i.test(src) || /us/i.test(p.audio || '');
          if (p.audio) {
            if (isUk && !audio_uk_url) audio_uk_url = p.audio;
            else if (isUs && !audio_us_url) audio_us_url = p.audio;
            else if (!audio_us_url) audio_us_url = p.audio;
          }
          if (p.text) {
            if (isUk && !phonetic_uk) phonetic_uk = p.text;
            else if (isUs && !phonetic_us) phonetic_us = p.text;
            else if (!phonetic_us) phonetic_us = p.text;
          }
        }
        if (!phonetic_uk && !phonetic_us && entry?.phonetic) phonetic_us = entry.phonetic;
        for (const m of (entry?.meanings || [])) {
          for (const d of (m.definitions || [])) {
            if (d.example) { example = d.example; break; }
          }
          if (example) break;
        }
      }
    } catch { /* ignore error, fallback to AI */ }

    // 2. Tra cứu nghĩa và từ loại bằng Gemini API
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) {
      return new Response(
        JSON.stringify({ error: 'Missing GEMINI_API_KEY' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ĐÃ SỬA MODEL THÀNH gemini-1.5-flash (Chuẩn REST API)
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are an English–Vietnamese dictionary assistant. For the English word "${word}", return ONLY a JSON object with keys: word_class (part of speech, e.g. "noun", "verb"), meaning_en (short English definition), meaning_vi (Vietnamese translation, natural). Do not wrap in markdown code blocks.`
              }
            ]
          }
        ],
        generationConfig: { response_mime_type: 'application/json' }
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return new Response(
        JSON.stringify({ error: txt }), 
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await res.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    return new Response(
      JSON.stringify({
        word_class: parsed.word_class || '',
        meaning_en: parsed.meaning_en || '',
        meaning_vi: parsed.meaning_vi || '',
        phonetic_uk,
        phonetic_us,
        audio_uk_url,
        audio_us_url,
        example,
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});