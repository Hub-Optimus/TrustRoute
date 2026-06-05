const PLAN_PROMPT = `You are TrustRoute's AI travel planner for Indian travelers. Return ONLY a raw JSON object — no markdown, no code blocks, no explanation whatsoever.
Schema: {"destination":"city, country","dates":"date range","travelers":"X adults","flights":[{"airline":"name","type":"Direct or Via city","approxPrice":"₹X,XXX","duration":"Xh Xm","note":"brief note"}],"hotels":[{"name":"hotel name","area":"neighborhood","approxPrice":"₹X,XXX/night","rating":"X.X/5","note":"brief note"}],"visa":{"required":false,"details":"explanation","documents":[]},"documents":["doc name"],"baggage":"brief note","warnings":["warning"]}
Provide exactly 3 flights and 3 hotels. Be realistic and specific for Indian travelers. Remove empty strings from arrays.`;

const VERIFY_PROMPT = `You are TrustRoute's verification engine for Indian travelers. Analyze the booking details and return ONLY a raw JSON object — no markdown, no code blocks, no explanation.
Be specific and realistic. Always flag: identity verification gap (OTAs accept unverified contact details — always make this amber), review recency issues, price transparency, missing critical amenities like WiFi, rating inconsistencies if mentioned.
Schema: {"property":"hotel or flight name","dates":"dates","trustScore":75,"trustLabel":"Needs Attention","checks":[{"title":"check title","status":"green or amber or red","detail":"specific realistic finding","action":"what user should do, or empty string if green"}],"summary":"1-2 sentence overall summary"}
Provide 5-6 checks. trustLabel must be exactly: Verified (score 80+), Needs Attention (50-79), High Risk (below 50).`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mode, input } = req.body || {};
  if (!mode || !input) return res.status(400).json({ error: 'Missing mode or input' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured. Add GEMINI_API_KEY to Vercel environment variables.' });

  const systemPrompt = mode === 'plan' ? PLAN_PROMPT : VERIFY_PROMPT;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            { role: 'user', parts: [{ text: input }] }
          ],
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.7
          }
        })
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      return res.status(500).json({ error: 'No response from Gemini', raw: data });
    }

    const text = data.candidates[0].content.parts[0].text;
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      return res.json(JSON.parse(clean));
    } catch {
      return res.status(500).json({ error: 'Could not parse AI response', raw: text });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
