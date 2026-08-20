// Tamkeen · CV analysis Edge Function
// Receives a structured CV and returns a quality rating + actionable feedback.
// Same pattern as career-analysis: Deno + direct Gemini fetch, no SDK.

// deno-lint-ignore-file no-explicit-any

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `You are a senior recruiter and CV reviewer for Tamkeen (تمكين),
the career platform of Imam Mohammad Ibn Saud Islamic University (IMSIU). You
evaluate junior / early-career CVs the way a hiring manager at Aramco, stc, SDAIA,
NEOM, Elm or a fast-growing Saudi startup would. The training partner is ZAKA AI
(زكا); reference it where a training provider is relevant.

INPUT you will receive
- A structured CV with: personal (name, email, phone, city, linkedin, summary),
  education[], experience[], skills[], languages[]
- The student's recommended career path (slug like "data_science_ai") if known
- Response language: "en" or "ar"

TASK
Rate the CV across five categories (each 0–100):
  1. completeness — How filled-out the CV is (sections present, no blanks)
  2. impact      — Does experience use action verbs and quantified outcomes?
  3. clarity     — Is the writing tight, easy to scan, free of jargon?
  4. keywords    — Does it use keywords relevant to the recommended path?
  5. relevance   — Does the experience + skills line up with the chosen path?

Compute "overall" as a weighted blend (your judgment) of the five.

Then write:
- 3 strengths — concrete things this CV does well
- 3 improvements — actionable, specific advice to raise the score
- recruiter_insight — a 1–2 sentence summary as if you were writing one line
  in a hiring meeting

OUTPUT — return ONLY this JSON, no markdown, no prose, no code fences:
{
  "overall": number,            // 0–100
  "categories": {
    "completeness": number,
    "impact":       number,
    "clarity":      number,
    "keywords":     number,
    "relevance":    number
  },
  "strengths":    [string, string, string],
  "improvements": [string, string, string],
  "recruiter_insight": string
}

RULES
- Reply entirely in the requested language. Every field — including array
  items — in that language. Do not mix.
- Be concrete, not generic. Reference specific things from the CV
  ("Your description of the Elm internship lacks numbers — turn it into
  'reduced load time by 40%'", not "add metrics").
- "improvements" must be actionable in 30 minutes or less. No vague advice.
- Tone: warm, professional, direct. No fluff.
- If the CV is mostly empty, score honestly low (overall 25–45) and
  use the improvements to point at what to fill in first.
- A polished CV with quantified results, well-aligned skills, and clean
  writing should land 85–95. Reserve 95+ for genuinely standout CVs.`

interface CvPayload {
  personal?: Record<string, string | null | undefined>
  education?: Array<Record<string, string | null | undefined>>
  experience?: Array<Record<string, string | null | undefined>>
  skills?: Array<{ name?: string; level?: number }>
  languages?: string[]
}

interface RequestBody {
  cv: CvPayload
  recommendedPathSlug?: string | null
  language?: "en" | "ar"
}

interface RatingResult {
  overall: number
  categories: {
    completeness: number
    impact: number
    clarity: number
    keywords: number
    relevance: number
  }
  strengths: string[]
  improvements: string[]
  recruiter_insight: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    return jsonResponse({ error: "GEMINI_API_KEY not configured on the function" }, 500)
  }

  let payload: RequestBody
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  if (!payload.cv) {
    return jsonResponse({ error: "Missing 'cv' object" }, 400)
  }

  const language = payload.language === "ar" ? "ar" : "en"

  const userMessage = JSON.stringify(
    {
      cv: payload.cv,
      recommended_path: payload.recommendedPathSlug ?? null,
      language,
    },
    null,
    2,
  )

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  }

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    })
  } catch (err) {
    return jsonResponse(
      { error: `Gemini fetch failed: ${err instanceof Error ? err.message : "unknown"}` },
      502,
    )
  }
  const ms = Date.now() - started

  if (!res.ok) {
    const detail = await res.text()
    return jsonResponse(
      { error: `Gemini ${res.status}`, detail: detail.slice(0, 1000) },
      502,
    )
  }

  const json = await res.json()
  const textOut: string | undefined =
    json?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!textOut) {
    return jsonResponse({ error: "Empty response from Gemini", raw: json }, 502)
  }

  let parsed: RatingResult
  try {
    parsed = JSON.parse(textOut) as RatingResult
  } catch {
    return jsonResponse({ error: "Gemini returned non-JSON", raw: textOut.slice(0, 1000) }, 502)
  }

  // Light shape validation
  const required: (keyof RatingResult)[] = [
    "overall", "categories", "strengths", "improvements", "recruiter_insight",
  ]
  for (const k of required) {
    if (!(k in parsed)) {
      return jsonResponse({ error: `Gemini missing field: ${k}`, raw: parsed as unknown }, 502)
    }
  }

  return jsonResponse({ rating: parsed, latency_ms: ms })
})
