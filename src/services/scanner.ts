import type {
  WorkspaceFixType,
  WorkspaceIssueDimension,
  WorkspaceIssueSeverity,
} from "@findable/shared";
import { analyzeWithAi, type AiAnalysisResult } from "./ai-analyzer";

export interface ScanJobPayload {
  scanId: string;
  urls: string[];
  email: string;
}

export interface ScanExecutionIssue {
  description: string;
  dimension: WorkspaceIssueDimension;
  fixType: WorkspaceFixType;
  id: string;
  pointsImpact: number;
  productName: string;
  severity: WorkspaceIssueSeverity;
  title: string;
}

export interface ScanExecutionProduct {
  category: string;
  generatedSchema: Record<string, unknown>;
  issues: ScanExecutionIssue[];
  llmScore: number;
  name: string;
  overallScore: number;
  price: number | null;
  protocolScore: number;
  schemaScore: number;
  url: string;
}

export interface ScanExecutionResult {
  issues: ScanExecutionIssue[];
  pagesScanned: number;
  pagesTotal: number;
  products: ScanExecutionProduct[];
  reportJson: Record<string, unknown>;
  scoreCompetitive: number | null;
  scoreLlm: number;
  scoreOverall: number;
  scoreProtocol: number;
  scoreSchema: number;
  status: "complete";
}

interface PageAnalysis {
  category: string;
  description: string;
  generatedSchema: Record<string, unknown>;
  issues: ScanExecutionIssue[];
  llmScore: number;
  name: string;
  overallScore: number;
  price: number | null;
  protocolScore: number;
  schemaScore: number;
  url: string;
}

interface SignalSnapshot {
  availabilityDetected: boolean;
  brandDetected: boolean;
  canonicalDetected: boolean;
  descriptionLength: number;
  faqDetected: boolean;
  gtinDetected: boolean;
  jsonLdDetected: boolean;
  merchantFeedHintDetected: boolean;
  priceDetected: boolean;
  productSchemaDetected: boolean;
  returnPolicyDetected: boolean;
  reviewDetected: boolean;
  shippingDetected: boolean;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; FindableBot/1.0; +https://getfindable.au)";

function hashString(value: string): number {
  return Array.from(value).reduce((accumulator, character) => {
    return (accumulator * 31 + character.charCodeAt(0)) % 100000;
  }, 7);
}

function startCaseFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "product";

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractTitle(html: string) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
}

function extractMetaContent(html: string, key: string, attribute = "name") {
  const regex = new RegExp(
    `<meta[^>]*${attribute}=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i",
  );

  return decodeHtml(html.match(regex)?.[1]?.trim() ?? "");
}

function extractCanonicalUrl(html: string) {
  return html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
}

function extractJsonLdBlocks(html: string) {
  const matches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];

  return matches
    .map((block) => block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim())
    .filter(Boolean);
}

function parseJsonLdObjects(html: string) {
  const parsedObjects: Record<string, unknown>[] = [];

  for (const block of extractJsonLdBlocks(html)) {
    try {
      const parsed = JSON.parse(block) as unknown;

      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry === "object") {
            parsedObjects.push(entry as Record<string, unknown>);
          }
        }
        continue;
      }

      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;

        if (Array.isArray(record["@graph"])) {
          for (const entry of record["@graph"] as unknown[]) {
            if (entry && typeof entry === "object") {
              parsedObjects.push(entry as Record<string, unknown>);
            }
          }
        }

        parsedObjects.push(record);
      }
    } catch {
      // Ignore malformed JSON-LD blocks and continue scanning.
    }
  }

  return parsedObjects;
}

function schemaTypeMatches(value: unknown, target: string): boolean {
  if (typeof value === "string") {
    return value.toLowerCase() === target.toLowerCase();
  }

  if (Array.isArray(value)) {
    return value.some((entry) => schemaTypeMatches(entry, target));
  }

  return false;
}

function findSchemaObject(
  objects: Record<string, unknown>[],
  target: string,
) {
  return objects.find((entry) => schemaTypeMatches(entry["@type"], target)) ?? null;
}

function maybeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const match = value.match(/-?\d+(\.\d+)?/);

    if (match) {
      return Number.parseFloat(match[0]);
    }
  }

  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildIssue(
  url: string,
  productName: string,
  title: string,
  description: string,
  pointsImpact: number,
  severity: WorkspaceIssueSeverity,
  dimension: WorkspaceIssueDimension,
  fixType: WorkspaceFixType,
): ScanExecutionIssue {
  const slug = `${url}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    id: slug.replace(/^-+|-+$/g, ""),
    productName,
    title,
    description,
    pointsImpact,
    severity,
    dimension,
    fixType,
  };
}

function buildGeneratedSchema(productName: string, url: string, price: number | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    url,
    offers: {
      "@type": "Offer",
      ...(price !== null ? { price } : {}),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  };
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function analyzeFetchedHtml(url: string, html: string): PageAnalysis {
  const title = extractTitle(html);
  const metaDescription =
    extractMetaContent(html, "description") ||
    extractMetaContent(html, "og:description", "property");
  const canonicalUrl = extractCanonicalUrl(html);
  const schemaObjects = parseJsonLdObjects(html);
  const productSchema = findSchemaObject(schemaObjects, "Product");
  const faqSchema = findSchemaObject(schemaObjects, "FAQPage");
  const reviewSchema =
    findSchemaObject(schemaObjects, "AggregateRating") ||
    findSchemaObject(schemaObjects, "Review");
  const offers =
    productSchema && typeof productSchema.offers === "object"
      ? (productSchema.offers as Record<string, unknown>)
      : null;
  const bodyText = stripTags(html);
  const name =
    (typeof productSchema?.name === "string" ? productSchema.name : "") ||
    extractMetaContent(html, "og:title", "property") ||
    title ||
    startCaseFromUrl(url);
  const price =
    maybeNumber(offers?.price) ??
    maybeNumber(extractMetaContent(html, "product:price:amount", "property")) ??
    maybeNumber(bodyText.match(/\$\s?\d+(\.\d{1,2})?/)?.[0] ?? null);

  const signals: SignalSnapshot = {
    availabilityDetected:
      typeof offers?.availability === "string" ||
      /in stock|out of stock|availability/i.test(bodyText),
    brandDetected:
      Boolean(
        (typeof productSchema?.brand === "string" && productSchema.brand) ||
          (typeof (productSchema?.brand as Record<string, unknown> | undefined)?.name === "string" &&
            (productSchema?.brand as Record<string, unknown>).name),
      ) || /brand/i.test(bodyText),
    canonicalDetected: canonicalUrl.length > 0,
    descriptionLength: metaDescription.length || bodyText.slice(0, 2000).length,
    faqDetected: Boolean(faqSchema) || /faq|frequently asked/i.test(bodyText),
    gtinDetected: Boolean(
      productSchema?.gtin ||
        productSchema?.gtin12 ||
        productSchema?.gtin13 ||
        productSchema?.gtin14 ||
        productSchema?.mpn,
    ),
    jsonLdDetected: schemaObjects.length > 0,
    merchantFeedHintDetected: /merchant|feed|jsonl|gmc|shopping/i.test(html),
    priceDetected: price !== null,
    productSchemaDetected: Boolean(productSchema),
    returnPolicyDetected:
      Boolean(offers?.hasMerchantReturnPolicy) || /return policy|returns/i.test(bodyText),
    reviewDetected: Boolean(reviewSchema) || /review|rating/i.test(bodyText),
    shippingDetected:
      Boolean(offers?.shippingDetails) || /shipping|delivery/i.test(bodyText),
  };

  let schemaScore = 18;
  schemaScore += signals.jsonLdDetected ? 12 : 0;
  schemaScore += signals.productSchemaDetected ? 24 : 0;
  schemaScore += signals.brandDetected ? 8 : 0;
  schemaScore += signals.gtinDetected ? 10 : 0;
  schemaScore += signals.priceDetected ? 8 : 0;
  schemaScore += signals.availabilityDetected ? 6 : 0;
  schemaScore += signals.shippingDetected ? 7 : 0;
  schemaScore += signals.returnPolicyDetected ? 7 : 0;
  schemaScore += signals.reviewDetected ? 6 : 0;
  schemaScore += signals.canonicalDetected ? 4 : 0;
  schemaScore = clamp(schemaScore, 0, 100);

  let llmScore = 22;
  llmScore += Math.min(signals.descriptionLength / 12, 26);
  llmScore += signals.reviewDetected ? 10 : 0;
  llmScore += signals.brandDetected ? 8 : 0;
  llmScore += signals.faqDetected ? 12 : 0;
  llmScore += /material|size|color|fit|dimensions|spec/i.test(bodyText) ? 10 : 0;
  llmScore = clamp(Math.round(llmScore), 0, 100);

  let protocolScore = 10;
  protocolScore += signals.productSchemaDetected ? 20 : 0;
  protocolScore += signals.shippingDetected ? 12 : 0;
  protocolScore += signals.returnPolicyDetected ? 12 : 0;
  protocolScore += signals.merchantFeedHintDetected ? 18 : 0;
  protocolScore += signals.canonicalDetected ? 8 : 0;
  protocolScore = clamp(protocolScore, 0, 100);

  const issues: ScanExecutionIssue[] = [];

  if (!signals.productSchemaDetected) {
    issues.push(
      buildIssue(
        url,
        name,
        "Product schema is missing",
        "No Product JSON-LD was detected on the page, so AI agents have little structured context to work with.",
        24,
        "critical",
        "schema",
        "auto",
      ),
    );
  }

  if (!signals.returnPolicyDetected) {
    issues.push(
      buildIssue(
        url,
        name,
        "Return policy is not machine-readable",
        "Add hasMerchantReturnPolicy so shopping agents can confidently surface your product in purchase flows.",
        10,
        "high",
        "schema",
        "auto",
      ),
    );
  }

  if (!signals.shippingDetected) {
    issues.push(
      buildIssue(
        url,
        name,
        "Shipping details are missing",
        "No shippingDetails were detected, which limits recommendation quality for time- and price-sensitive purchases.",
        8,
        "high",
        "schema",
        "auto",
      ),
    );
  }

  if (!signals.gtinDetected) {
    issues.push(
      buildIssue(
        url,
        name,
        "Unique product identifiers are missing",
        "No GTIN, MPN, or equivalent identifier was found, making it harder for AI systems to reconcile this product across sources.",
        7,
        "medium",
        "consistency",
        "manual",
      ),
    );
  }

  if (signals.descriptionLength < 140) {
    issues.push(
      buildIssue(
        url,
        name,
        "Description is too thin for LLM discovery",
        "The page does not expose enough factual product detail for extractive answers and recommendation engines.",
        8,
        "medium",
        "llm",
        "auto",
      ),
    );
  }

  if (!signals.faqDetected) {
    issues.push(
      buildIssue(
        url,
        name,
        "FAQ content is missing",
        "Adding FAQ content or FAQ schema improves citation opportunities in conversational shopping flows.",
        5,
        "low",
        "llm",
        "auto",
      ),
    );
  }

  if (!signals.reviewDetected) {
    issues.push(
      buildIssue(
        url,
        name,
        "Review signals are missing",
        "No review or rating signals were detected, reducing trust for recommendation engines.",
        6,
        "medium",
        "llm",
        "auto",
      ),
    );
  }

  const overallScore = Math.round(schemaScore * 0.4 + llmScore * 0.35 + protocolScore * 0.25);

  return {
    url,
    name,
    category: "Product Page",
    schemaScore,
    llmScore,
    protocolScore,
    overallScore,
    price,
    issues,
    description: metaDescription,
    generatedSchema: buildGeneratedSchema(name, url, price),
  };
}

function analyzeFallback(url: string): PageAnalysis {
  const hash = hashString(url);
  const schemaScore = 32 + (hash % 26);
  const llmScore = 24 + ((hash >> 2) % 28);
  const protocolScore = 12 + ((hash >> 3) % 18);
  const name = startCaseFromUrl(url);
  const issues = [
    buildIssue(
      url,
      name,
      "Unable to fetch the page for live analysis",
      "Findable fell back to URL-only scoring because the page could not be fetched or parsed from the server.",
      10,
      "high",
      "protocol",
      "manual",
    ),
    buildIssue(
      url,
      name,
      "Return policy schema missing",
      "No machine-readable return policy was confirmed during fallback analysis.",
      6,
      "medium",
      "schema",
      "auto",
    ),
    buildIssue(
      url,
      name,
      "FAQ schema not detected",
      "Conversational answer coverage is limited without FAQ content or FAQ schema.",
      4,
      "low",
      "llm",
      "auto",
    ),
  ];

  return {
    url,
    name,
    category: "Product Page",
    schemaScore,
    llmScore,
    protocolScore,
    overallScore: Math.round(schemaScore * 0.4 + llmScore * 0.35 + protocolScore * 0.25),
    price: null,
    issues,
    description: "",
    generatedSchema: buildGeneratedSchema(name, url, null),
  };
}

async function analyzeProductUrl(url: string) {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch {
    return analyzeFallback(url);
  }

  const baseAnalysis = analyzeFetchedHtml(url, html);

  // Enhance with AI analysis when OpenAI is configured
  const bodyText = stripTags(html).slice(0, 2000);
  const schemaObjects = parseJsonLdObjects(html);
  const productSchema = findSchemaObject(schemaObjects, "Product");
  const visibleAttributes = bodyText.match(/\b(cotton|polyester|leather|wool|size|color|weight|dimension|material|fit|warranty)\b/gi) ?? [];

  const aiResult = await analyzeWithAi({
    url,
    productName: baseAnalysis.name,
    description: baseAnalysis.description || bodyText.slice(0, 1000),
    existingSchema: productSchema,
    visiblePrice: baseAnalysis.price,
    visibleAttributes: [...new Set(visibleAttributes.map((a) => a.toLowerCase()))],
    htmlSnippet: html.slice(0, 4000),
  });

  if (!aiResult) {
    return baseAnalysis;
  }

  // Merge AI results into the base analysis
  return mergeAiAnalysis(baseAnalysis, aiResult);
}

function mergeAiAnalysis(base: PageAnalysis, ai: AiAnalysisResult): PageAnalysis {
  // AI-enhanced LLM score uses the AEO score weighted with heuristic
  const enhancedLlmScore = Math.round(ai.aeoScore * 0.7 + base.llmScore * 0.3);

  // Add AI-detected issues
  const aiIssues: ScanExecutionIssue[] = [];

  if (ai.descriptionType === "marketing") {
    aiIssues.push(
      buildIssue(base.url, base.name, "Description uses marketing language", "AI analysis detected marketing-heavy copy that LLMs and ACP feeds will deprioritize. Rewrite with factual, attribute-dense language.", 12, "high", "llm", "auto"),
    );
  }

  for (const attr of ai.missingAttributes.slice(0, 5)) {
    aiIssues.push(
      buildIssue(base.url, base.name, `Missing attribute: ${attr}`, `The ${attr} attribute is expected for this product category but was not found in the page or schema.`, 4, "medium", "schema", "manual"),
    );
  }

  if (ai.aeoIssues) {
    for (const issue of ai.aeoIssues.slice(0, 3)) {
      aiIssues.push(
        buildIssue(base.url, base.name, issue, "Identified by AI analysis of description quality and LLM discoverability.", 5, "medium", "llm", "auto"),
      );
    }
  }

  const allIssues = [...base.issues, ...aiIssues];
  const overallScore = Math.round(base.schemaScore * 0.4 + enhancedLlmScore * 0.35 + base.protocolScore * 0.25);

  return {
    ...base,
    category: ai.googleCategory || base.category,
    llmScore: enhancedLlmScore,
    overallScore,
    issues: allIssues,
    generatedSchema: ai.generatedSchema && typeof ai.generatedSchema === "object"
      ? ai.generatedSchema
      : base.generatedSchema,
    description: ai.rewrittenDescription || base.description,
  };
}

export async function runScan(payload: ScanJobPayload): Promise<ScanExecutionResult> {
  const products: ScanExecutionProduct[] = [];
  const issues: ScanExecutionIssue[] = [];

  for (const url of payload.urls) {
    const analysis = await analyzeProductUrl(url);
    products.push({
      category: analysis.category,
      generatedSchema: analysis.generatedSchema,
      issues: analysis.issues,
      llmScore: analysis.llmScore,
      name: analysis.name,
      overallScore: analysis.overallScore,
      price: analysis.price,
      protocolScore: analysis.protocolScore,
      schemaScore: analysis.schemaScore,
      url: analysis.url,
    });
    issues.push(...analysis.issues);
  }

  const pagesTotal = products.length;
  const scoreSchema = Math.round(
    products.reduce((sum, product) => sum + product.schemaScore, 0) / pagesTotal,
  );
  const scoreLlm = Math.round(
    products.reduce((sum, product) => sum + product.llmScore, 0) / pagesTotal,
  );
  const scoreProtocol = Math.round(
    products.reduce((sum, product) => sum + product.protocolScore, 0) / pagesTotal,
  );
  const scoreOverall = Math.round(scoreSchema * 0.4 + scoreLlm * 0.35 + scoreProtocol * 0.25);

  return {
    status: "complete",
    pagesScanned: pagesTotal,
    pagesTotal,
    products,
    issues,
    scoreOverall,
    scoreSchema,
    scoreLlm,
    scoreProtocol,
    scoreCompetitive: null,
    reportJson: {
      generatedAt: new Date().toISOString(),
      summary: `Scanned ${pagesTotal} product page${pagesTotal === 1 ? "" : "s"} for ${payload.email}.`,
      products,
      topIssues: issues
        .slice()
        .sort((left, right) => right.pointsImpact - left.pointsImpact)
        .slice(0, 5)
        .map((issue) => issue.title),
      issues,
    },
  };
}
