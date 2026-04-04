import OpenAI from "openai";
import { env } from "../lib/env";

const openai = env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;

export interface AiAnalysisInput {
  url: string;
  productName: string;
  description: string;
  existingSchema: Record<string, unknown> | null;
  visiblePrice: number | null;
  visibleAttributes: string[];
  htmlSnippet: string;
}

export interface AiAnalysisResult {
  aeoScore: number;
  aeoIssues: string[];
  descriptionType: "marketing" | "factual" | "mixed";
  attributeDensity: number;
  googleCategory: string;
  expectedAttributes: string[];
  foundAttributes: string[];
  missingAttributes: string[];
  suggestedFaq: Array<{ question: string; answer: string }>;
  generatedSchema: Record<string, unknown>;
  rewrittenDescription: string;
}

const SYSTEM_PROMPT = `You are FINDABLE's AI commerce readiness analyzer. You audit e-commerce product pages for AI agent discoverability.

Your job is to analyze a product page and return a structured JSON assessment. You score against the gold standard: maximum-signal, zero-ambiguity structured data designed for agentic commerce.

Core principles:
- Explicit over implicit: never make an AI agent guess
- Complete over minimal: 99.9% attribute completion = 3-4x AI visibility
- Factual over marketing: "300gsm organic cotton" beats "premium luxury experience"
- OpenAI's ACP feed rejects marketing language in descriptions

AEO scoring (0-100):
- Does the first sentence define what the product IS? (+15)
- Are material/composition explicitly stated? (+10)
- Are dimensions/sizing explicitly stated? (+10)
- Are use cases stated? (+10)
- Are care instructions present? (+5)
- Are comparison anchors present? (+10)
- Is language factual vs marketing? (+20)
- Can an LLM extract 10+ attributes from text alone? (+20)

Return ONLY valid JSON, no markdown, no explanation.`;

function buildUserPrompt(input: AiAnalysisInput): string {
  return `Analyze this product page for AI commerce readiness.

URL: ${input.url}
Product Name: ${input.productName}
Visible Price: ${input.visiblePrice ?? "not detected"}

Description text from page:
"""
${input.description.slice(0, 2000)}
"""

Existing JSON-LD schema found on page:
${input.existingSchema ? JSON.stringify(input.existingSchema, null, 2).slice(0, 3000) : "NONE - no structured data detected"}

Visible attributes detected: ${input.visibleAttributes.length > 0 ? input.visibleAttributes.join(", ") : "minimal"}

Return this exact JSON structure:
{
  "aeoScore": <0-100 integer>,
  "aeoIssues": ["<specific issue>", ...],
  "descriptionType": "<marketing|factual|mixed>",
  "attributeDensity": <0.0-1.0 float, found/expected ratio>,
  "googleCategory": "<Google Product Category string>",
  "expectedAttributes": ["<attributes expected for this category>"],
  "foundAttributes": ["<attributes actually present>"],
  "missingAttributes": ["<expected but not found>"],
  "suggestedFaq": [
    {"question": "<natural language question a shopper would ask ChatGPT>", "answer": "<factual 2-3 sentence answer with concrete data>"},
    ... (generate 5 FAQs)
  ],
  "generatedSchema": <complete gold-standard Product JSON-LD object following schema.org best practices, with @context, @type, all detected attributes, proper nested types for Brand/Offer/ShippingDetails/ReturnPolicy, additionalProperty array for category-specific attributes>,
  "rewrittenDescription": "<AEO-optimized description: first sentence defines the product, all attributes explicit, 'Best for:' section, 'Similar to:' section, zero marketing language, max 150 words>"
}`;
}

export async function analyzeWithAi(
  input: AiAnalysisInput,
): Promise<AiAnalysisResult | null> {
  if (!openai) {
    return null;
  }

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as AiAnalysisResult;

    // Validate and clamp scores
    parsed.aeoScore = Math.max(0, Math.min(100, Math.round(parsed.aeoScore ?? 0)));
    parsed.attributeDensity = Math.max(0, Math.min(1, parsed.attributeDensity ?? 0));
    parsed.descriptionType = parsed.descriptionType ?? "mixed";
    parsed.aeoIssues = Array.isArray(parsed.aeoIssues) ? parsed.aeoIssues : [];
    parsed.suggestedFaq = Array.isArray(parsed.suggestedFaq) ? parsed.suggestedFaq : [];
    parsed.missingAttributes = Array.isArray(parsed.missingAttributes) ? parsed.missingAttributes : [];
    parsed.foundAttributes = Array.isArray(parsed.foundAttributes) ? parsed.foundAttributes : [];
    parsed.expectedAttributes = Array.isArray(parsed.expectedAttributes) ? parsed.expectedAttributes : [];

    return parsed;
  } catch (error) {
    console.error("AI analysis failed:", error);
    return null;
  }
}
