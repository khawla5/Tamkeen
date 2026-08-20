// Tamkeen · career analysis Edge Function
// Calls Gemini with the user's assessment answers and returns a personalized
// career recommendation. Runs on Deno (Supabase Edge Runtime) — no SDK, just fetch.

// deno-lint-ignore-file no-explicit-any

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `You are a career counselor for Tamkeen (تمكين), the career
platform of Imam Mohammad Ibn Saud Islamic University (IMSIU), aligned with Vision 2030. You use Holland's RIASEC framework
(the international standard endorsed by O*NET / US DoL) but you do NOT let
the Holland code alone decide the result — the actual choices the user made
must shape the recommendation.

INPUT you will receive
- 24 answer entries. Each one includes:
    q        — the question id
    section  — which themed block it came from (activities, environment,
                problems, skills, values, future)
    code     — the RIASEC code that this option is tagged with (R/I/A/S/E/C)
    question — the question text shown to the user
    chosen   — the exact option text the user selected
- riasec_scores — count of how many times each code was picked (sums to 24)
- holland_code  — the user's top-3 codes (e.g. "IAS"). Use it as a guidepost,
                  NOT as a lookup table.
- The user's first name and (if available) university major
- Response language ("en" or "ar")

RIASEC CODES (for reference)
- R Realistic — hands-on, builders, doers
- I Investigative — thinkers, analysts, scientists
- A Artistic — creators, expressive, original
- S Social — teachers, helpers, healers
- E Enterprising — leaders, persuaders, sellers
- C Conventional — organizers, detail-driven, structured

CAREER CATALOG — pick exactly one top_match and one secondary_match from this
fixed list. Use the slug exactly as written (snake_case).

R | mechanical_engineering        — Mechanical Engineering
R | aerospace_aviation            — Aerospace & Aviation
R | renewable_energy              — Renewable Energy & Sustainability
I | software_engineering          — Software Engineering
I | data_science_ai               — Data Science & AI
I | healthcare_medicine           — Healthcare & Medicine
A | architecture_design           — Architecture & Urban Design
A | film_media_gaming             — Film, Media & Gaming
A | visual_arts_design            — Visual Arts & Design
S | education_teaching            — Education & Teaching
S | nursing_therapy               — Nursing & Therapy
S | counseling_hr                 — Counseling & HR
E | business_entrepreneurship     — Business & Entrepreneurship
E | marketing_brand               — Marketing & Brand Strategy
E | hospitality_tourism           — Hospitality, Tourism & Events
C | finance_banking               — Finance & Banking
C | accounting_auditing           — Accounting & Auditing
C | operations_supply_chain       — Operations & Supply Chain

HOW TO PICK THE PATH (READ CAREFULLY)
1. Read every \`chosen\` text. Pay attention to recurring concrete signals:
   tools, materials, audiences, settings, outputs (e.g. "build something
   tangible", "design a logo", "lead a team", "work with patients", "manage
   a schedule").
2. Use the holland_code as a sanity check, NOT as a decision tree. Two users
   with the same Holland code can — and should — get different paths if their
   actual choices point at different domains. For example, a "RIA" user who
   keeps picking lab/biology answers should land on healthcare_medicine, not
   data_science_ai. A "RIA" user who keeps picking design/aesthetic answers
   should land on architecture_design or visual_arts_design.
3. Within the top-3 codes, prefer the catalog entry whose theme is most
   echoed in the user's chosen texts. Single-code dominance only forces a
   path when that code wins by 6+ points AND the answer texts agree.
4. secondary_match must be from a DIFFERENT primary RIASEC code than
   top_match — give the user a meaningful alternative, not a near-duplicate.

WHY-FIELD MUST QUOTE THE USER
- The "why" field MUST reference at least TWO specific phrases from the
  \`chosen\` texts (paraphrased is fine, but tied to what they said).
- Example shape: "Your pull toward {phrase from chosen #X} and your
  preference for {phrase from chosen #Y} both point to ..."

OUTPUT — return ONLY this JSON, no markdown, no prose, no code fences:
{
  "top_match": string,                   // slug from the catalog
  "top_match_label": string,             // human label in the requested language
  "match_score": number,                 // 0–100, how strongly the answers align
  "secondary_match": string|null,        // a slug whose primary code differs from top_match's
  "secondary_match_label": string|null,
  "holland_code": string,                // echo back the 3-letter code
  "why": string,                         // 2–3 sentences referencing specific answers
  "strengths": [string, string, string],
  "growth_areas": [string, string, string],
  "first_steps": [string, string, string]
}

RULES
- Reply entirely in the requested language. Every field — including array
  items — in that language. Do not mix.
- "first_steps" must be concrete and Saudi-relevant. Name real programs and
  organizations: ZAKA AI (زكا), Misk Foundation, SDAIA Academy, KAUST,
  NEOM internships, the Royal Commission, Royal Institute of
  Traditional Arts, Ministry of Tourism programs, RHQ — not vague advice.
- Tone: warm, encouraging, practical. No fluff.
- Match score reflects how strongly the answer texts converge on the chosen
  path. A focused, consistent signal lands 85–95. A scattered profile lands
  60–75.`

interface AnswerInput {
  q: number
  section: string
  code: string  // RIASEC code: R | I | A | S | E | C
  question?: string | null   // localized question text
  chosen?: string | null     // localized text of the option the user picked
}

interface RequestBody {
  answers: AnswerInput[]
  riasec_scores?: Record<string, number>
  holland_code?: string
  name?: string
  major?: string
  language?: "en" | "ar"
}

interface AnalysisResult {
  top_match: string
  top_match_label: string
  match_score: number
  secondary_match: string | null
  secondary_match_label: string | null
  holland_code: string
  why: string
  strengths: string[]
  growth_areas: string[]
  first_steps: string[]
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    return jsonResponse(
      { error: "GEMINI_API_KEY not configured on the function" },
      500,
    )
  }

  let payload: RequestBody
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  if (
    !payload.answers ||
    !Array.isArray(payload.answers) ||
    payload.answers.length === 0
  ) {
    return jsonResponse({ error: "Missing or empty 'answers' array" }, 400)
  }

  const language = payload.language === "ar" ? "ar" : "en"

  const userMessage = JSON.stringify(
    {
      answers: payload.answers,
      riasec_scores: payload.riasec_scores ?? null,
      holland_code: payload.holland_code ?? null,
      name: payload.name ?? null,
      major: payload.major ?? null,
      language,
    },
    null,
    2,
  )

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      // Slightly creative — enough variation that two users with the same
      // Holland code but different chosen-text patterns land on different
      // paths, but not so high that Gemini drifts into invalid JSON.
      temperature: 0.65,
    },
  }

  // Retry transient Gemini errors (503 overloaded / 429 quota / 500 / network).
  // Capacity spikes on gemini-2.5-flash are common; a couple of backoff retries
  // turn 90% of these into successful calls.
  const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
  const MAX_ATTEMPTS = 3
  const started = Date.now()

  let geminiRes: Response | null = null
  let lastErrText = ""
  let lastStatus = 0

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      })
      if (res.ok) {
        geminiRes = res
        break
      }
      lastStatus = res.status
      lastErrText = await res.text()
      if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS) {
        // Either non-retryable (e.g. 400/401/403) or we've used all attempts.
        return jsonResponse(
          {
            error: `Gemini ${res.status}`,
            detail: lastErrText.slice(0, 1000),
            retryable: RETRY_STATUSES.has(res.status),
          },
          res.status === 503 ? 503 : 502,
        )
      }
    } catch (err) {
      lastErrText = err instanceof Error ? err.message : "unknown"
      if (attempt === MAX_ATTEMPTS) {
        return jsonResponse(
          { error: `Gemini fetch failed: ${lastErrText}`, retryable: true },
          502,
        )
      }
    }
    // Exponential backoff: 800ms, 1600ms.
    await new Promise((r) => setTimeout(r, 800 * attempt))
  }

  if (!geminiRes) {
    return jsonResponse(
      { error: `Gemini ${lastStatus}`, detail: lastErrText.slice(0, 1000), retryable: true },
      lastStatus === 503 ? 503 : 502,
    )
  }
  const ms = Date.now() - started

  const geminiJson = await geminiRes.json()
  const textOut: string | undefined =
    geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!textOut) {
    return jsonResponse(
      { error: "Empty response from Gemini", raw: geminiJson },
      502,
    )
  }

  // Strip a stray ```json ... ``` fence if Gemini ignores responseMimeType
  // (rare with structured output, but cheap to defend against).
  const cleaned = textOut
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()

  let parsed: Partial<AnalysisResult>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return jsonResponse(
      { error: "Gemini returned non-JSON text", raw: textOut.slice(0, 1000) },
      502,
    )
  }

  // Only the path + the human-readable bits are truly required. Coerce / fill
  // sensible defaults for the rest so a single missing field doesn't 502 the
  // whole call.
  if (!parsed.top_match || typeof parsed.top_match !== "string") {
    return jsonResponse(
      { error: "Gemini response missing top_match", raw: parsed as unknown },
      502,
    )
  }

  const filled: AnalysisResult = {
    top_match: parsed.top_match,
    top_match_label: parsed.top_match_label ?? parsed.top_match,
    match_score: typeof parsed.match_score === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.match_score)))
      : 75,
    secondary_match: parsed.secondary_match ?? null,
    secondary_match_label: parsed.secondary_match_label ?? null,
    holland_code: parsed.holland_code ?? (payload.holland_code ?? ""),
    why: parsed.why ?? "",
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 5) : [],
    growth_areas: Array.isArray(parsed.growth_areas) ? parsed.growth_areas.slice(0, 5) : [],
    first_steps: Array.isArray(parsed.first_steps) ? parsed.first_steps.slice(0, 5) : [],
  }

  return jsonResponse({ analysis: filled, latency_ms: ms })
})
