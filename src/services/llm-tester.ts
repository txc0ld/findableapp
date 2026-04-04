/**
 * LLM Visibility Tester — Pro tier feature.
 *
 * Tests whether a merchant's brand/products appear in LLM responses
 * when users ask shopping questions. No other Shopify app does this.
 *
 * Uses OpenAI's chat completions API (gpt-4o-mini for cost control)
 * to simulate real consumer queries and checks if the brand is mentioned.
 */

import OpenAI from "openai";
import { env } from "../lib/env";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface VisibilityTestResult {
  prompt: string;
  mentioned: boolean;
  mentionContext: string | null;
  competitorsMentioned: string[];
  timestamp: Date;
}

export interface VisibilityReport {
  brandName: string;
  testsRun: number;
  mentionCount: number;
  mentionRate: number;
  results: VisibilityTestResult[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Extract the sentence (or nearby text) surrounding a brand mention.
 * Returns null if brand is not found.
 */
function extractMentionContext(
  text: string,
  brandName: string,
): string | null {
  const lowerText = text.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  const idx = lowerText.indexOf(lowerBrand);
  if (idx === -1) return null;

  // Find sentence boundaries around the mention
  const before = text.lastIndexOf(".", idx);
  const after = text.indexOf(".", idx + lowerBrand.length);

  const start = before === -1 ? 0 : before + 1;
  const end = after === -1 ? text.length : after + 1;

  return text.slice(start, end).trim();
}

/**
 * Detect other brand names mentioned in an LLM response.
 * Uses a simple heuristic: looks for capitalized multi-word phrases
 * or known brand-like patterns that are NOT the merchant's brand.
 */
function detectCompetitors(
  text: string,
  brandName: string,
): string[] {
  const lowerBrand = brandName.toLowerCase();

  // Split into sentences and look for brand-like patterns:
  // Capitalized words that appear as product recommendations
  const brandPattern = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\b/g;
  const candidates = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = brandPattern.exec(text)) !== null) {
    const candidate = match[1];
    // Skip common English words that happen to be capitalised at sentence starts
    const skipWords = new Set([
      "The", "This", "That", "These", "Those", "Here", "There", "They",
      "What", "When", "Where", "Which", "While", "With", "Would", "Will",
      "Some", "Many", "Most", "Each", "Every", "Other", "Another",
      "Both", "Such", "Their", "Your", "Very", "Also", "However",
      "Overall", "Additionally", "Furthermore", "Finally", "Firstly",
      "Secondly", "Thirdly", "Best", "Great", "Good", "High", "Quality",
      "Premium", "Budget", "Affordable", "Excellent", "Top", "Popular",
      "Known", "Made", "Features", "Offers", "Provides", "Includes",
      "Available", "Designed", "Perfect", "Ideal", "Recommended",
      "Consider", "Looking", "Price", "Range", "Option", "Options",
      "Product", "Products", "Brand", "Brands", "Shopping", "Store",
    ]);

    if (
      candidate &&
      candidate.length > 2 &&
      candidate.toLowerCase() !== lowerBrand &&
      !skipWords.has(candidate)
    ) {
      candidates.add(candidate);
    }
  }

  // Also look for patterns like "**BrandName**" (markdown bold)
  const boldPattern = /\*\*([^*]+)\*\*/g;
  while ((match = boldPattern.exec(text)) !== null) {
    const candidate = match[1]?.trim();
    if (
      candidate &&
      candidate.length > 2 &&
      candidate.toLowerCase() !== lowerBrand &&
      // Avoid picking up descriptive phrases
      candidate.split(" ").length <= 4
    ) {
      candidates.add(candidate);
    }
  }

  return Array.from(candidates).slice(0, 15);
}

/**
 * Build test prompts for a brand in a product category.
 */
function buildTestPrompts(
  productCategory: string,
  useCases: string[],
): string[] {
  return useCases.map(
    (useCase) => `What are the best ${productCategory} for ${useCase}?`,
  );
}

/* ------------------------------------------------------------------ */
/*  Main function                                                     */
/* ------------------------------------------------------------------ */

export async function testLlmVisibility(params: {
  brandName: string;
  productCategory: string;
  useCases: string[];
}): Promise<VisibilityReport> {
  const { brandName, productCategory, useCases } = params;

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const prompts = buildTestPrompts(productCategory, useCases);

  // Run all prompts in parallel to stay within proxy timeout
  const results = await Promise.all(
    prompts.map(async (prompt): Promise<VisibilityTestResult> => {
      try {
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful shopping assistant. Recommend specific brands and products. Be detailed and mention real brand names in your recommendations.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content ?? "";
        const mentioned = content.toLowerCase().includes(brandName.toLowerCase());

        return {
          prompt,
          mentioned,
          mentionContext: mentioned ? extractMentionContext(content, brandName) : null,
          competitorsMentioned: detectCompetitors(content, brandName),
          timestamp: new Date(),
        };
      } catch (err) {
        console.error(`[llm-tester] Error testing prompt "${prompt}":`, err);
        return {
          prompt,
          mentioned: false,
          mentionContext: null,
          competitorsMentioned: [],
          timestamp: new Date(),
        };
      }
    }),
  );

  const mentionCount = results.filter((r) => r.mentioned).length;

  return {
    brandName,
    testsRun: results.length,
    mentionCount,
    mentionRate: results.length > 0 ? mentionCount / results.length : 0,
    results,
  };
}
