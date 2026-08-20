// Tamkeen · interview prep Edge Function
// Two actions:
//   { action: "questions", role, difficulty, language } → 5 tailored interview questions
//   { action: "grade",     question, answer, language } → structured feedback on the answer
// Same Deno + direct-fetch pattern as career-analysis / cv-analysis.

// deno-lint-ignore-file no-explicit-any

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const QUESTIONS_SYSTEM_PROMPT = `You are an experienced interview coach for Tamkeen (تمكين),
the career platform of Imam Mohammad Ibn Saud Islamic University (IMSIU). You
design realistic interview questions that hiring managers at companies like
Aramco, stc, SDAIA, NEOM, Elm, and fast-growing Saudi startups actually ask.

INPUT
- role: a target role / career slug like "software_engineering", "data_science_ai"
- difficulty: "junior" | "mid" | "senior"
- language: "en" | "ar"

TASK
Generate exactly 5 questions tailored to the role + difficulty. Mix categories:
- 2 technical (specific to the role)
- 2 behavioral (STAR-method friendly)
- 1 situational (a real workplace scenario in a Saudi context)

Make them concrete. Don't ask "what is X" — ask "walk me through" / "describe a
time" / "you're given Y, what's your approach". Reference Saudi-relevant context
where natural (Vision 2030, NEOM, Aramco scale, hajj-season operations, etc.).

OUTPUT — strictly this JSON, no markdown fences:
{
  "questions": [
    {
      "id": 1,
      "category": "technical" | "behavioral" | "situational",
      "question": string,
      "hint": string,                    // 1 line of guidance, points the user at structure
      "target_skills": [string, string]  // 1–3 skills the question probes
    }
    ... 5 total
  ]
}

RULES
- Every field in the requested language. No mixing.
- "hint" should help the candidate structure their answer (e.g. "Use STAR:
  Situation, Task, Action, Result").
- Match difficulty: junior questions check fundamentals, mid-level test design
  + tradeoffs, senior probe leadership + ambiguity.`

const GRADE_SYSTEM_PROMPT = `You are an experienced interview coach grading a
candidate's answer to a single interview question.

INPUT
- question: the question that was asked
- answer:   the candidate's response (free-form text)
- language: "en" | "ar" — write all output in this language

TASK
Score the answer across four dimensions, each 0–100:
- relevance:  Does it address what was actually asked?
- structure:  Is it organized? (STAR for behavioral, top-down for technical)
- depth:      Concrete details, examples, technical specifics — not just buzzwords
- confidence: Clear language, decisive, not hedging excessively

Compute "overall" as a weighted blend (your judgment, but lean on relevance).

Then write:
- 2 strengths (concrete things this answer does well)
- 2 improvements (actionable, specific advice — what to add/remove/restructure)
- recommended_answer: a model answer in 3–5 sentences showing what a strong
  response would look like for this specific question. Concrete, not generic.

OUTPUT — strictly this JSON:
{
  "scores": {
    "relevance":  number,
    "structure":  number,
    "depth":      number,
    "confidence": number
  },
  "overall": number,
  "strengths":    [string, string],
  "improvements": [string, string],
  "recommended_answer": string
}

RULES
- Reply entirely in the requested language. No mixing.
- Be honest. A weak answer should score 30–55, not 80. A strong answer 80–95.
  Reserve 95+ for genuinely outstanding answers.
- Improvements must be actionable in <30 seconds of revision.
- Tone: warm, direct, professional. No fluff.`

interface RequestBody {
  action: "questions" | "grade"
  language?: "en" | "ar"
  // For "questions"
  role?: string
  difficulty?: "junior" | "mid" | "senior"
  // For "grade"
  question?: string
  answer?: string
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

async function callGemini(systemPrompt: string, userPayload: unknown, apiKey: string) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(userPayload, null, 2) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  }

  const started = Date.now()
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const ms = Date.now() - started

  if (!res.ok) {
    const detail = await res.text()
    return { ok: false as const, status: res.status, detail }
  }

  const json = await res.json()
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) return { ok: false as const, status: 502, detail: "Empty response" }

  try {
    return { ok: true as const, parsed: JSON.parse(text), latency_ms: ms }
  } catch {
    return { ok: false as const, status: 502, detail: `Non-JSON: ${text.slice(0, 800)}` }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) return jsonResponse({ error: "GEMINI_API_KEY not configured" }, 500)

  let payload: RequestBody
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const language = payload.language === "ar" ? "ar" : "en"

  // ── Generate 5 questions ─────────────────────────────────────────────
  if (payload.action === "questions") {
    if (!payload.role) return jsonResponse({ error: "Missing 'role'" }, 400)

    const difficulty = payload.difficulty ?? "mid"
    const result = await callGemini(
      QUESTIONS_SYSTEM_PROMPT,
      { role: payload.role, difficulty, language },
      apiKey,
    )

    if (!result.ok) {
      return jsonResponse({ error: `Gemini ${result.status}`, detail: result.detail }, 502)
    }

    const parsed = result.parsed as { questions?: unknown[] }
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return jsonResponse({ error: "No questions returned", raw: parsed as unknown }, 502)
    }

    return jsonResponse({ questions: parsed.questions, latency_ms: result.latency_ms })
  }

  // ── Grade an answer ──────────────────────────────────────────────────
  if (payload.action === "grade") {
    if (!payload.question || !payload.answer) {
      return jsonResponse({ error: "Missing 'question' or 'answer'" }, 400)
    }
    if (payload.answer.trim().length < 10) {
      return jsonResponse({ error: "Answer too short" }, 400)
    }

    const result = await callGemini(
      GRADE_SYSTEM_PROMPT,
      { question: payload.question, answer: payload.answer, language },
      apiKey,
    )

    if (!result.ok) {
      return jsonResponse({ error: `Gemini ${result.status}`, detail: result.detail }, 502)
    }

    const parsed = result.parsed as { scores?: unknown; overall?: unknown }
    if (!parsed.scores || typeof parsed.overall !== "number") {
      return jsonResponse({ error: "Bad shape from Gemini", raw: parsed as unknown }, 502)
    }

    return jsonResponse({ feedback: parsed, latency_ms: result.latency_ms })
  }

  return jsonResponse({ error: `Unknown action: ${payload.action}` }, 400)
})
