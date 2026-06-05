const PLAN_PROMPT = `You are TrustRoute's AI travel planner for Indian travelers. Return ONLY a raw JSON object — no markdown, no code blocks, no explanation whatsoever.

IMPORTANT: Strictly respect the budget. Calculate total cost (flights + hotel) and only suggest options that fit within the stated budget.

Schema: {"destination":"specific city, India","dates":"exact date range","travelers":"X adults","flights":[{"airline":"real airline name","type":"Direct or Via city","approxPrice":"₹X,XXX per person","duration":"Xh Xm","note":"specific tip like baggage policy or check-in time"}],"hotels":[{"name":"real hotel name","area":"specific neighborhood","approxPrice":"₹X,XXX/night total","rating":"X.X/5","note":"specific amenity or location advantage"}],"visa":{"required":false,"details":"specific entry rule for Indian citizens","documents":[]},"documents":["specific document name"],"baggage":"specific baggage allowance for economy class","warnings":["specific practical warning"]}

Rules:
- Provide exactly 3 real flights sorted cheapest to most expensive
- Provide exactly 3 real hotels near the requested area sorted budget-friendly first
- Hotel prices must fit within budget after accounting for flight costs
- Remove empty strings from arrays
- All prices must be realistic for 2026`;

const VERIFY_PROMPT = `You are TrustRoute's expert verification engine. You have deep knowledge of Indian OTA platforms (MakeMyTrip, Booking.com, Goibibo, Agoda).

Analyze the specific booking details provided and return ONLY a raw JSON object — no markdown, no code blocks, no explanation.

For each check, reference the SPECIFIC property name, price, or detail from the booking — do not give generic advice.

Known issues to always check:
1. Identity verification gap — all major OTAs accept unverified contact details (name, email, phone) — this is always amber
2. Review recency — when was the last review posted?
3. Price consistency — is the stated price consistent across the booking funnel?
4. Critical amenities — WiFi, parking, breakfast — are these confirmed or missing?
5. Rating reliability — does the overall rating match subcategory scores?
6. Booking protection — what happens if the hotel cancels or doesn't match description?

Schema: {"property":"exact hotel/flight name from input","dates":"exact dates from input","trustScore":75,"trustLabel":"Needs Attention","checks":[{"title":"specific check name","status":"green or amber or red","detail":"specific finding referencing the actual property name and details","action":"specific action the user should take, or empty string if green"}],"summary":"2-3 sentences specific to this booking"}

trustLabel must be exactly: Verified (80+), Needs Attention (50-79), High Risk (below 50).
Provide exactly 5-6 checks. Make every finding specific to the property given.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { mode, input } = req.body || {};
  if (!mode || !input) return res.status(400).json({ error: 'Missing mode or input' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured. Add GROQ_API_KEY to Vercel environment variables.' });

  const systemPrompt = mode === 'plan' ? PLAN_PROMPT : VERIFY_PROMPT;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1500,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input }
        ]
      })
    });

    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      return res.status(500).json({ error: 'No response from AI', raw: data });
    }

    const text = data.choices[0].message.content;
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
