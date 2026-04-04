# FINDABLE — Product Requirements Document

## The AI Commerce Readiness Platform

**Domain:** getfindable.au
**Tagline:** "AI agents are shopping for your customers. Can they find you?"

---

## 1. WHAT IS FINDABLE

FINDABLE is the Lighthouse for AI commerce. It scans e-commerce product pages and produces an actionable readiness score across four dimensions that determine whether products get discovered, recommended, and purchased through AI shopping agents and LLMs.

**The free scan:** Merchant pastes up to 3 product page URLs → enters email → Cloudflare Turnstile validates human → scan runs → report displays on screen with scores, issues, and fixes → copy sent to email → drip sequence sells paid plan.

**The paid product:** Platform-connected (Shopify App / WooCommerce Plugin / BigCommerce App) continuous monitoring, auto-fix engine, AEO description rewriting, feed generation for OpenAI ACP and Google UCP protocols, competitor tracking, and LLM visibility testing.

---

## 2. WHY NOW

### The Market Has Shifted

| Metric | Value | Source |
|---|---|---|
| Consumers using GenAI for product discovery | 58% | nShift 2026 |
| ChatGPT daily shopping queries | 50M+ | OpenAI |
| LLM-referred traffic conversion rate | 2.47% | Alhena |
| vs. Google Ads conversion rate | 1.82% | Industry benchmark |
| vs. Meta Ads conversion rate | 0.52% | Industry benchmark |
| AI-engaged visitor conversion rate | 9.84% | Alhena |
| ChatGPT share of all LLM-referred e-commerce traffic | 97% | Alhena |
| SMBs with ANY AI commerce optimization | <2% | TJ Digital |
| "Golden Record" stores (99.9% attribute completion) visibility lift | 3-4x | eFulfillment 2026 |
| FAQ schema citation probability boost | +89% | Moz 2025 |
| Content updated within 30 days citation lift | 3.2x | Rank.bot |
| Review volume importance over star rating for LLM recommendation | 3.6x | Onely 2026 |
| Marketers expecting ChatGPT to drive product discovery | 66% | Adobe Express |
| Agentic commerce projected global mediation by 2030 | $3-5T | McKinsey |
| LLM conversion rate vs. traditional — AI-engaged visitors | 9.84% vs ~2% | Alhena |

### Four Live Commerce Protocols (All Active Now)

**OpenAI Agentic Commerce Protocol (ACP)**
- Merchants submit structured product feeds via SFTP to OpenAI endpoint
- 15-minute refresh cycles for real-time pricing/inventory
- Shopify + Etsy auto-enrolled via catalog integration
- All others must apply at chatgpt.com/merchants
- Feed spec: developers.openai.com/commerce/specs/feed/
- Instant Checkout via Stripe (rolling out selectively)
- U.S. only currently, global expansion planned
- Live retailers: Target, Sephora, Nordstrom, Lowe's, Best Buy, Home Depot, Wayfair, Walmart
- OpenAI rejects feeds with marketing language — descriptions must be factual
- Feed formats: JSONL (gzip), CSV (gzip), TSV (gzip), Parquet (zstd)

**Google Universal Commerce Protocol (UCP)**
- Open standard spanning full journey: discovery → checkout → post-purchase
- Works through Google Merchant Center feeds
- `native_commerce=true` flag enables "Buy" button in AI Mode and Gemini
- Requires: JSON capability manifest, defined return policies, Merchant Center feed
- Interoperates with Agent2Agent, Agent Payments Protocol, MCP
- 20+ companies endorsed at NRF January 2026 launch
- Merchant remains seller of record, Google Pay via stored Wallet credentials

**Schema.org Structured Data (Universal)**
- All LLMs (ChatGPT, Claude, Perplexity, Gemini) crawl and parse Schema.org Product markup
- JSON-LD format preferred (Google recommended, least error-prone)
- Universal baseline — works across every AI surface without enrollment
- Most stores have bare-minimum or broken implementation

**Stripe Agentic Commerce Suite**
- Payment infrastructure for agent-to-merchant transactions
- Powers ACP checkout, integrates with UCP
- One-line activation for Shopify merchants on Stripe/Shopify Payments

### The Gap

98%+ of stores are invisible to AI shoppers. The information about what to fix exists across hundreds of blog posts, specs, and consulting decks. Nobody has automated it into a scan-and-fix product. FINDABLE does.

---

## 3. FOUR SCORING DIMENSIONS

### Overall Findable Score: 0-100

Weighted composite:
- Schema Intelligence: 30%
- LLM Discoverability: 30%
- Protocol Compliance: 25%
- Competitive Position: 15%

---

### 3.1 Schema Intelligence (0-100)

Can an autonomous shopping agent read, parse, and act on this product page?

**Scoring rubric — every point is earned:**

| Check | Points | Method |
|---|---|---|
| JSON-LD `<script type="application/ld+json">` exists | 5 | Parse page head |
| @type = Product or ProductGroup | 5 | Validate schema type |
| `name` present, non-generic, matches visible H1 | 3 | Compare schema name to page H1 |
| `description` present, >50 chars, non-placeholder | 3 | Length + content check |
| `image` present, valid HTTPS URL, resolves | 3 | URL validation + HEAD request |
| `brand` present as @type Brand | 3 | Schema structure check |
| `sku` present, non-empty | 3 | Field presence |
| `gtin/gtin13/gtin14/ean/upc` present | 5 | Critical for cross-platform matching |
| `mpn` present | 2 | Manufacturer part number |
| `offers.price` present, numeric | 5 | Field validation |
| `offers.priceCurrency` present, ISO 4217 | 2 | Currency code validation |
| `offers.availability` present, valid enum | 5 | schema.org availability value |
| `offers.itemCondition` present | 2 | NewCondition etc. |
| `offers.seller` present as Organization | 2 | Structure check |
| `offers.priceValidUntil` present | 1 | For time-limited pricing |
| `shippingDetails` present with rate + delivery time + destination | 5 | Nested structure validation |
| `hasMerchantReturnPolicy` present with window + method + fees | 5 | Nested structure validation |
| `aggregateRating` with ratingValue + reviewCount | 3 | Both fields present |
| `review` (individual reviews in schema) | 2 | At least one Review |
| `category` present (Google Product Category or text) | 2 | Field presence |
| `material` present (where applicable) | 3 | Category-dependent |
| `color` present (where applicable) | 2 | Category-dependent |
| `size` present (where applicable) | 2 | Category-dependent |
| `weight` as QuantitativeValue with unit | 2 | Structured weight data |
| `additionalProperty` for category-specific attributes | 3 | Dimensions, specs, certifications |
| Variant handling: ProductGroup + hasVariant, each with distinct offers | 5 | Multi-variant structure |
| BreadcrumbList schema on page | 2 | Category hierarchy for agents |
| FAQPage schema on page | 3 | Structured Q&A |
| Data consistency: schema price matches visible price | 5 | Scrape visible price, diff against schema |
| Data consistency: schema availability matches visible stock status | 3 | Text analysis vs schema enum |
| No duplicate/conflicting Product schema blocks | 3 | Count Product schemas per page |
| **Total** | **100** | |

**Category-specific attribute expectations:**

Scanner classifies each product into a category from page content, then applies expected attribute template. Missing expected attributes flagged as issues.

| Category | Critical Attributes | Nice-to-Have |
|---|---|---|
| Apparel | color, size, material, gender | fit, pattern, sleeveLength, ageGroup |
| Electronics | brand, model, screenSize/storage/RAM | processor, OS, connectivity, warranty |
| Footwear | size, color, material, gender | heelHeight, soleType, width |
| Furniture | dimensions (W×H×D), material, color | weight, assembly, maxLoadWeight |
| Beauty/Skincare | volume/weight, skinType, ingredients | shade, SPF, certifications |
| Food & Beverage | weight, ingredients, allergens | nutrition, servingSize, origin |
| Sporting Goods | size, material, sport, gender | level, weight, compatibility |
| Automotive Parts | compatibility (make/model/year), partNumber | material, weight, warranty |
| Home & Garden | dimensions, material, power/voltage | color, compatibility |

**Complete JSON-LD example (what a perfect product page schema looks like):**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Heavyweight Black Cotton Tee",
  "description": "300gsm 100% organic cotton crewneck t-shirt. Relaxed fit. Pre-shrunk. Double-stitched hems. Ethically manufactured in Portugal. GOTS certified.",
  "image": [
    "https://store.com/images/tee-front.jpg",
    "https://store.com/images/tee-back.jpg",
    "https://store.com/images/tee-detail.jpg"
  ],
  "brand": { "@type": "Brand", "name": "BrandName" },
  "sku": "BLK-TEE-XL",
  "gtin13": "0012345678901",
  "mpn": "BT-300-BLK",
  "color": "Black",
  "material": "100% Organic Cotton",
  "weight": { "@type": "QuantitativeValue", "value": "300", "unitCode": "GRM" },
  "size": "XL",
  "audience": { "@type": "PeopleAudience", "suggestedGender": "unisex" },
  "category": "Apparel > Shirts > T-Shirts",
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "Fabric Weight", "value": "300gsm" },
    { "@type": "PropertyValue", "name": "Fit", "value": "Relaxed" },
    { "@type": "PropertyValue", "name": "Body Length (M)", "value": "74cm" },
    { "@type": "PropertyValue", "name": "Certification", "value": "GOTS Organic" }
  ],
  "offers": {
    "@type": "Offer",
    "price": "49.95",
    "priceCurrency": "AUD",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "priceValidUntil": "2026-12-31",
    "seller": { "@type": "Organization", "name": "StoreName" },
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": {
        "@type": "MonetaryAmount",
        "value": "9.95",
        "currency": "AUD"
      },
      "deliveryTime": {
        "@type": "ShippingDeliveryTime",
        "handlingTime": { "@type": "QuantitativeValue", "minValue": 1, "maxValue": 2, "unitCode": "DAY" },
        "transitTime": { "@type": "QuantitativeValue", "minValue": 3, "maxValue": 7, "unitCode": "DAY" }
      },
      "shippingDestination": {
        "@type": "DefinedRegion",
        "addressCountry": "AU"
      }
    },
    "hasMerchantReturnPolicy": {
      "@type": "MerchantReturnPolicy",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30,
      "returnMethod": "https://schema.org/ReturnByMail",
      "returnFees": "https://schema.org/FreeReturn"
    }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "reviewCount": "234"
  },
  "review": [
    {
      "@type": "Review",
      "author": { "@type": "Person", "name": "Jake M." },
      "reviewRating": { "@type": "Rating", "ratingValue": "5" },
      "reviewBody": "Best heavyweight tee I've owned. Fabric is thick without being stiff."
    }
  ]
}
```

---

### 3.2 LLM Discoverability (0-100)

When a shopper asks "best heavyweight black cotton tees" — will ChatGPT, Claude, Gemini, or Perplexity recommend this product?

**How LLMs decide what to recommend (based on research):**

1. **Training data** — Did the brand/product appear frequently enough in training corpora to be "known"?
2. **Real-time retrieval (RAG/web search)** — When the LLM searches live, can it find and parse your product data?
3. **Third-party validation** — Independent reviews, editorial mentions, Reddit discussions confirm product is real and rated
4. **Entity clarity** — Brand and product are consistently named, unambiguous, clearly categorized
5. **Content structure** — Headings, lists, tables, FAQs are extractable. Paragraph soup is not.
6. **Freshness** — Recently updated content gets 3.2x more citations
7. **Review volume** — Products with 3.6x more reviews get recommended. Stars above 4.4 have diminishing returns.

**Key insight:** Third-party content gets cited 3x more than brand-owned websites by ChatGPT. Top 50 domains capture 48% of all citations. Wikipedia is the #1 cited source.

**Scoring rubric:**

| Check | Points | Method |
|---|---|---|
| Attribute density | 15 | Count machine-readable product attributes vs. category expectation. >90% = full points |
| AEO score | 20 | LLM analysis: Does first sentence define the product? Are attributes explicit? Factual vs. marketing? Comparison data present? |
| FAQ presence | 10 | FAQ content on page (schema or visible HTML). Boosts citation probability 89% |
| Comparison readiness | 10 | Can an LLM extract attributes to compare vs. alternatives? (material, weight, price/unit, certifications) |
| Review signals | 15 | Review count > 100 = full points. > 1000 = bonus. Rating > 4.4 threshold |
| Third-party presence | 10 | Brand/product mentioned on Google Reviews, Trustpilot, Reddit, review blogs? (quick web search check) |
| Content freshness | 10 | Last-Modified header, on-page dates, sitemap lastmod. Updated within 30 days = full points |
| Entity clarity | 5 | Brand name consistent across title, schema, description, breadcrumbs. Product name unambiguous |
| Wikipedia / knowledge base presence | 5 | Brand has Wikipedia page or major knowledge base listing |
| **Total** | **100** | |

**AEO Analysis — what we check per description:**

The LLM evaluates each product description against these criteria:

1. Does the first sentence state what the product IS? (not "Experience the..." or "Elevate your...")
2. Is material/composition explicitly stated?
3. Are dimensions/sizing explicitly stated?
4. Are use cases stated? ("Best for: ...")
5. Are care/maintenance instructions present?
6. Are comparison anchors present? ("Similar to: ...", "Comparable to: ...")
7. Is language factual and attribute-dense vs. emotional/marketing?
8. Could an LLM extract 10+ concrete attributes from this text alone?

**AEO rewrite example:**

Before (marketing copy — invisible to LLMs):
```
Elevate your everyday wardrobe with our signature heavyweight tee. 
Crafted from the finest cotton for those who appreciate quality, 
this shirt is built to last. Feel the difference from the moment 
you put it on.
```

After (AEO-optimized — findable by LLMs):
```
The [Brand] Signature Heavyweight Tee is a 300gsm 100% organic 
cotton crewneck t-shirt with reinforced collar and double-stitched 
hems. Available in Black, White, Navy, Olive. Sizes XS-3XL. 
Relaxed fit, 74cm body length (size M). Pre-shrunk. 200 washes 
tested. Ethically manufactured in Portugal (GOTS certified).

Best for: streetwear layering, casual daily wear, workwear basics, 
minimalist capsule wardrobes.

Care: Machine wash cold (30°C), tumble dry low. Minimal shrinkage 
after first wash (<2%).

Similar to: Carhartt WIP Chase Tee (slightly heavier), Lady White 
Co. Lite Jersey (comparable weight, higher price), Los Angeles 
Apparel 1801GD (lighter at 180gsm).
```

**LLM Prompt Testing Engine (Pro tier):**

We construct real shopper prompts and query ChatGPT/Claude/Perplexity to check if the product/brand appears in recommendations.

Prompt templates:
```
"best [category] for [use case]"
  → "best heavyweight cotton tees for streetwear"

"top 10 [category] under $[price]"
  → "top 10 black tees under $60 AUD"

"[brand] vs [competitor]"
  → "Carhartt WIP tee vs [brand name] tee"

"what [category] should I buy for [context]"
  → "what t-shirt should I buy for layering in hot weather"
```

We log: whether brand/product appears, position in recommendation, what the LLM says about it, and which competitors are mentioned instead. Longitudinal tracking shows visibility trends over time.

---

### 3.3 Protocol Compliance (0-100)

Is the store plugged into the AI commerce channels that are live right now?

| Check | Points | Method |
|---|---|---|
| OpenAI ACP — merchant registered | 15 | Check if products appear in ChatGPT shopping results |
| ACP feed — all required fields complete | 15 | product.id, title, description, brand, category, url, variants, pricing, availability, images, shipping, policies |
| ACP feed — recommended fields present | 5 | Promotions, Q&A, reviews, certifications |
| ACP feed — description quality (factual, not marketing) | 5 | LLM classification of description tone |
| ACP feed — refresh frequency | 5 | 15-min = full, daily = partial, manual = minimal |
| Google Merchant Center active | 15 | Feed synced, products approved |
| GMC `native_commerce` flag enabled | 10 | AI Mode "Buy" button eligibility |
| GMC `structured_title` / `structured_description` present | 5 | Required if using AI-generated product content |
| UCP JSON capability manifest published | 5 | Declares supported commerce actions |
| Return policy defined in GMC | 5 | Required for UCP checkout eligibility |
| Schema.org on-page (web crawl fallback) | 10 | For LLMs that crawl directly (Claude, Perplexity) |
| Platform auto-enrollment verified | 5 | Shopify/Etsy: verify products actually surface in ChatGPT |
| **Total** | **100** | |

**OpenAI ACP Feed — Required fields:**

| Field | Type | Notes |
|---|---|---|
| product.id | string | Unique product identifier |
| product.title | string | Factual, not marketing copy |
| product.description | string | Attribute-rich, OpenAI rejects marketing language |
| product.brand | string | Consistent across all channels |
| product.category | string | Google Product Category taxonomy |
| product.url | URL | Canonical product page |
| variant.id | string | Unique per variant |
| variant.title | string | Descriptive ("Black / XL") |
| variant.price | object | {amount, currency} |
| variant.availability | enum | in_stock, out_of_stock, preorder |
| variant.image_url | URL | Primary variant image |
| variant.gtin | string | Required for physical goods |
| group_id | string | Groups variants under parent product |
| shipping.methods[] | array | Method, rate, delivery estimate |
| policies.return_policy | URL | Machine-readable return policy |
| enable_search | boolean | true = appear in ChatGPT search |
| enable_checkout | boolean | true = in-chat purchase (if eligible) |

Feed formats: JSONL (gzip), CSV (gzip), TSV (gzip), Parquet (zstd)
Delivery: SFTP push to OpenAI-provided endpoint
Refresh: Every 15 minutes (recommended)
Spec: developers.openai.com/commerce/specs/feed/
Draft status: feedback open until April 7, 2026

**Google UCP Requirements:**
- Google Merchant Center feed active with products approved
- `native_commerce=true` attribute on eligible product listings
- JSON capability manifest published (declares supported commerce actions)
- Return policies defined in Merchant Center
- Google Pay support for checkout flow
- Interoperates with Agent2Agent, Agent Payments Protocol, MCP

---

### 3.4 Competitive Position (0-100)

How does the store compare to direct competitors across all dimensions?

**Input:** User provides 1-5 competitor URLs during paid onboarding, or we auto-detect from category + geography.

**Method:** Run identical Schema + LLM + Protocol scans on each competitor. Score is relative — top performer = 100, others proportional.

**Output example:**

```
YOUR STORE:        Schema: 41 | LLM: 28 | Protocol: 15 | Overall: 31
Competitor A:      Schema: 78 | LLM: 65 | Protocol: 72 | Overall: 72
Competitor B:      Schema: 55 | LLM: 42 | Protocol: 30 | Overall: 44
Competitor C:      Schema: 33 | LLM: 19 | Protocol: 8  | Overall: 22

Your Position: 3rd of 4
Biggest gap: Protocol Compliance — Competitor A has active ACP feed. You don't.
Quick win: Adding GTIN to top 50 products lifts Schema score ~15 points.
```

---

## 4. FREE SCAN — UX FLOW

### The Page

```
┌──────────────────────────────────────────────────┐
│                                                  │
│    AI agents are shopping for your customers.    │
│              Can they find you?                  │
│                                                  │
│    Paste up to 3 product page URLs:              │
│                                                  │
│    ┌──────────────────────────────────────────┐   │
│    │ https://                                 │   │
│    └──────────────────────────────────────────┘   │
│    ┌──────────────────────────────────────────┐   │
│    │ https://                                 │   │
│    └──────────────────────────────────────────┘   │
│    ┌──────────────────────────────────────────┐   │
│    │ https://              (optional)         │   │
│    └──────────────────────────────────────────┘   │
│                                                  │
│    Email:                                        │
│    ┌──────────────────────────────────────────┐   │
│    │ you@email.com                            │   │
│    └──────────────────────────────────────────┘   │
│                                                  │
│          [ Get Your Findable Score ]             │
│                                                  │
│    ☁ Protected by Cloudflare     One scan/email  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### The Flow

```
1. User enters 1-3 product URLs + email
2. Cloudflare Turnstile validates human (invisible for most users)
3. Bot? → Blocked. Disposable email? → Rejected.
4. Check: has this email scanned before? → Yes? → "You've already used your free scan. Connect your store for full access."
5. Real human, new email → scan fires
6. Loading screen with live progress:
   "Scanning product 1 of 3..."
   "Extracting structured data..."
   "Analyzing for LLM discoverability..."
   "Calculating your Findable Score..."
7. Report displays on screen (15-20 seconds total)
8. Copy of report emailed
9. Drip sequence begins
```

### Rate Limiting

- 1 scan session per email address (3 products per session)
- 10 scan sessions per IP per day
- Disposable email domain blocklist (guerrillamail, tempmail, mailinator, etc.)
- Cloudflare Turnstile on every submission
- No CAPTCHA unless rate limit triggered

### Cost Per Free Scan

| Component | Cost |
|---|---|
| Cloudflare Turnstile | Free |
| Firecrawl: 3 pages × $0.00083 | $0.0025 |
| Claude Haiku: 3 classification calls | $0.006 |
| Email send (Resend) | $0.001 |
| **Total per scan session** | **~$0.01** |

100,000 free scans = ~$1,000. That's the entire launch marketing budget.

### Email Drip Sequence

| Timing | Email | Purpose |
|---|---|---|
| Immediate | "Your Findable Score: 34/100" — full report attached | Deliver value |
| 24 hours | "Your top competitor scores 67. Here's what they have that you don't." | Create urgency via competition |
| 72 hours | "The 3 fixes that would improve your score the most" — specific, actionable | Show path to improvement |
| 7 days | "58% of shoppers now use AI to find products. Here's what that means for your revenue." | Education + fear |
| 14 days | "Connect your Shopify store and fix everything in one click. First month $29." | Hard CTA |

---

## 5. SCANNING ALGORITHM

### Phase 1: Discovery (2 seconds)

```
Input: 1-3 product URLs

For each URL:
1. Validate URL format (must be HTTPS, valid domain)
2. Detect platform from URL patterns:
   - *.myshopify.com or cdn.shopify.com assets → Shopify
   - /wp-json/ or woocommerce classes → WooCommerce
   - BigCommerce indicators → BigCommerce
   - Else → custom/headless
3. Queue each URL for extraction
```

### Phase 2: Extraction (5-10 seconds per URL)

```
For each product URL:

1. Firecrawl /scrape endpoint
   - Input: URL
   - Output: clean markdown + raw HTML
   - 1 credit per page

2. Extract existing structured data:
   - Parse all <script type="application/ld+json"> blocks
   - Validate JSON syntax
   - Check for Microdata/RDFa (flag as legacy format)
   - Count Product schema instances (flag duplicates)
   - Map all present fields to internal data model

3. Extract visible page content (from markdown):
   - Product name: H1, og:title, <title> tag
   - Price: visible price elements, og:price:amount
   - Currency: og:price:currency, visible currency symbol
   - Images: og:image, product gallery images
   - Description: meta description, visible product description text
   - Breadcrumbs: navigation hierarchy
   - Reviews: visible review count + average rating
   - Stock status: "In Stock", "Out of Stock", "Sold Out" text
   - Specifications: tables, definition lists, attribute grids
   - Shipping info: shipping section text
   - Return policy: visible or linked policy text
   - Material/composition: from specs or description
   - Size/color options: from variant selectors

4. Identify data present in page but NOT in schema
   (This becomes the auto-fix opportunity)
```

### Phase 3: Classification (3-5 seconds)

```
Single Claude Haiku call per product:

Input: {
  product_name,
  description_text,
  visible_attributes,
  existing_schema_fields
}

Prompt: "Classify this product and analyze its LLM readiness.

Return JSON:
{
  google_product_category: string,
  expected_attributes: string[],  // for this category
  found_attributes: string[],     // actually present on page
  missing_attributes: string[],   // expected but not found
  aeo_score: 0-100,
  aeo_issues: string[],
  description_type: 'marketing' | 'factual' | 'mixed',
  attribute_density: float,       // found / expected ratio
  suggested_faq: [                // auto-generated FAQ entries
    { question: string, answer: string }
  ]
}"
```

### Phase 4: Consistency Check (1 second)

```
For each product:

1. Compare schema price vs. visible price on page
   - Match → pass
   - Mismatch → critical issue

2. Compare schema availability vs. visible stock text
   - "InStock" schema + "Sold Out" visible → critical issue
   
3. Check for multiple Product schema blocks
   - >1 → high issue (common with theme + app conflicts)
   
4. Verify image URLs resolve (HEAD request)
   - 404 → high issue
```

### Phase 5: Scoring (instant)

```
Apply rubrics from Section 3 to all extracted + classified data.

Calculate:
- Schema Intelligence score (0-100)
- LLM Discoverability score (0-100)
- Protocol Compliance score (0-100) — limited in free scan
- Overall Findable Score (0-100, weighted composite)

Generate prioritized issue list, sorted by:
1. Impact (points gained if fixed)
2. Effort (auto-fixable vs. manual)
3. Severity (critical → low)
```

### Phase 6: Report Generation (1 second)

```
Output:
- Overall Findable Score with visual gauge (big number, color-coded)
- Per-product breakdown (if 3 URLs: side-by-side comparison)
- Four dimension scores with visual bars
- Top 5 highest-impact fixes with estimated score improvement per fix
- Full issue list grouped by severity
- Auto-fixable issues highlighted: "Connect Shopify to fix these automatically"
- Sample JSON-LD generated for the highest-traffic product (proof of value)
- Sample AEO-rewritten description for one product (proof of value)
- CTA: "Scan your entire store → Connect Shopify"
```

---

## 6. AUTO-FIX ENGINE

### What Can Be Auto-Fixed

| Fix | Method | Trigger |
|---|---|---|
| Generate complete JSON-LD | Extract attributes from page + API, build Schema.org Product JSON-LD | Starter tier |
| Inject JSON-LD into pages | Shopify Script Tag API / WP wp_head / BC Script Manager | Starter tier |
| Add BreadcrumbList schema | Read navigation/breadcrumbs, generate schema | Starter tier |
| Generate FAQ schema | LLM creates Q&A from product attributes, outputs FAQPage JSON-LD | Growth tier |
| Fix duplicate schema | Identify conflicting blocks, recommend removal steps | Starter tier |
| Convert Microdata → JSON-LD | Parse existing Microdata, output equivalent JSON-LD | Starter tier |
| Rewrite descriptions for AEO | LLM rewrites marketing copy → attribute-dense factual descriptions | Growth tier |
| Generate ACP feed | Map all products to OpenAI spec, output JSONL, host on CDN | Growth tier |
| Generate GMC supplemental feed | Output missing attributes as supplemental feed | Growth tier |
| Sync schema with live API data | Pull latest price/availability, update JSON-LD | Continuous (paid) |

### What Requires Merchant Input

| Gap | What We Tell Them |
|---|---|
| Missing GTIN/UPC/EAN | "X products have no barcode. Add in Shopify Admin > Products > Variants > Barcode. This is the #1 factor for cross-platform matching." |
| Missing material/composition | "Products in [category] should list material. Add a 'Material' metafield in Shopify." |
| Missing dimensions | "[Category] products need W × H × D. Add dimension metafields." |
| No return policy page | "Create /policies/returns — we auto-generate schema once it exists." |
| No reviews | "Products with 100+ reviews are 3.6x more likely to be recommended by LLMs. Consider Judge.me or Stamped." |
| No third-party presence | "Your brand isn't mentioned on review platforms. List on Trustpilot, Google Business Profile." |

### AEO Rewrite Engine

**Prompt:**

```
You are rewriting a product description for AI/LLM discoverability.

PRODUCT DATA:
{extracted_attributes_json}

ORIGINAL DESCRIPTION:
{original_description}

RULES:
1. First sentence: "[Brand] [Product] is a [weight/specs] [material] [type]..."
2. List ALL known attributes: material, dimensions, weight, colors, sizes
3. Add "Best for:" with 3-5 specific use cases
4. Add care instructions if applicable
5. Add "Similar to:" with 2-3 real competitor products in same category
6. ZERO marketing language. NO: premium, luxury, amazing, elevate, crafted
7. Every sentence must contain a concrete, extractable fact
8. An LLM reading this must be able to answer 10+ specific questions

OUTPUT: Rewritten description only.
```

### Injection Methods by Platform

**Shopify:**
- Script Tag API — inject JSON-LD into `<head>`, zero theme changes
- Theme App Extension — modern approach for embedded UI elements
- Webhooks for product create/update/delete → auto-regenerate schema
- No Liquid editing, no theme code modifications

**WooCommerce:**
- `wp_head` action hook — inject JSON-LD via plugin
- WooCommerce product data via REST API v3
- Compatible with Yoast/RankMath (deduplication handled)

**BigCommerce:**
- Script Manager API — inject into page head
- Catalog API for product data
- No Stencil theme editing required

---

## 7. FEED GENERATION PIPELINE

### ACP Feed Builder

```
1. Read all products from store API (Shopify/WC/BC)
2. For each product:
   a. Map fields to OpenAI feed spec
   b. Generate group_id for variant grouping
   c. Rewrite description to factual tone (strip marketing language)
   d. Validate GTIN format
   e. Map shipping methods from store settings
   f. Link return policy URL
   g. Set enable_search = true
   h. Set enable_checkout based on Stripe/payment eligibility
3. Output as JSONL (gzip compressed)
4. Host on FINDABLE CDN (R2/S3)
5. Provide hosted feed URL for merchant to register with OpenAI
6. Auto-refresh on configurable interval (15min / 1hr / daily)
7. Webhook-triggered refresh on product update events
```

### GMC Supplemental Feed

```
1. Read existing GMC feed (if accessible) or store product data
2. Identify missing/incomplete attributes per Google Merchant spec
3. Generate supplemental feed with:
   - Missing product attributes
   - native_commerce flag
   - structured_title / structured_description (if AI-generated)
4. Output as XML or CSV
5. Merchant uploads to Google Merchant Center
```

---

## 8. TECHNICAL ARCHITECTURE

### Stack

| Component | Technology |
|---|---|
| Runtime | Bun |
| API | Hono |
| Database | PostgreSQL + Drizzle ORM |
| Cache / Queue | Redis + BullMQ |
| Scraping | Firecrawl API |
| LLM | Claude API (Haiku for classification, Sonnet for rewrites) |
| Frontend | React + Vite + TailwindCSS |
| Hosting | Vercel (frontend) + Railway (API + workers) |
| Payments | Stripe |
| Email | Resend |
| File Storage | Cloudflare R2 (feed files) |
| Bot Protection | Cloudflare Turnstile |
| Analytics | PostHog |
| Error Tracking | Sentry |

### Database Schema

```sql
-- Accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free','starter','growth','pro','agency')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  free_scan_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores (connected via platform API)
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  url TEXT NOT NULL,
  name TEXT,
  platform TEXT CHECK (platform IN ('shopify','woocommerce','bigcommerce','custom')),
  shopify_shop TEXT,
  shopify_access_token TEXT,
  wc_url TEXT,
  wc_key TEXT,
  wc_secret TEXT,
  product_count INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scans
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  store_id UUID REFERENCES stores(id),
  scan_type TEXT CHECK (scan_type IN ('free','full','competitor','monitor')),
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','scanning','scoring','complete','failed')),
  urls_input TEXT[],
  pages_scanned INT DEFAULT 0,
  pages_total INT,
  score_overall INT,
  score_schema INT,
  score_llm INT,
  score_protocol INT,
  score_competitive INT,
  report_json JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products (per scan)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id),
  store_id UUID REFERENCES stores(id),
  url TEXT NOT NULL,
  name TEXT,
  platform_product_id TEXT,
  google_category TEXT,
  price DECIMAL(10,2),
  currency TEXT,
  availability TEXT,
  -- Schema completeness flags
  has_jsonld BOOLEAN DEFAULT FALSE,
  has_gtin BOOLEAN DEFAULT FALSE,
  has_brand BOOLEAN DEFAULT FALSE,
  has_shipping_schema BOOLEAN DEFAULT FALSE,
  has_return_schema BOOLEAN DEFAULT FALSE,
  has_review_schema BOOLEAN DEFAULT FALSE,
  has_faq_schema BOOLEAN DEFAULT FALSE,
  has_material BOOLEAN DEFAULT FALSE,
  has_color BOOLEAN DEFAULT FALSE,
  has_size BOOLEAN DEFAULT FALSE,
  has_weight BOOLEAN DEFAULT FALSE,
  has_breadcrumb BOOLEAN DEFAULT FALSE,
  has_variants_structured BOOLEAN DEFAULT FALSE,
  duplicate_schema_count INT DEFAULT 0,
  price_mismatch BOOLEAN DEFAULT FALSE,
  availability_mismatch BOOLEAN DEFAULT FALSE,
  schema_score INT,
  -- LLM readiness
  aeo_score INT,
  description_type TEXT,
  attribute_density FLOAT,
  review_count INT,
  rating_value FLOAT,
  llm_score INT,
  -- Raw data
  extracted_attributes JSONB,
  existing_schema JSONB,
  generated_schema JSONB,
  original_description TEXT,
  rewritten_description TEXT,
  suggested_faq JSONB,
  missing_attributes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Issues
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id),
  product_id UUID REFERENCES products(id),
  severity TEXT CHECK (severity IN ('critical','high','medium','low')),
  dimension TEXT CHECK (dimension IN ('schema','llm','protocol','consistency')),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  fix_type TEXT CHECK (fix_type IN ('auto','manual','hybrid')),
  points_impact INT,
  fixed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitors
CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  url TEXT NOT NULL,
  name TEXT,
  last_scan_id UUID REFERENCES scans(id),
  score_overall INT,
  score_schema INT,
  score_llm INT,
  score_protocol INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feeds (generated + hosted)
CREATE TABLE feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  feed_type TEXT CHECK (feed_type IN ('acp','gmc')),
  file_url TEXT,
  product_count INT,
  refresh_minutes INT DEFAULT 1440,
  last_generated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  alert_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('critical','warning','info')),
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Routes

```
# ── Free Scan (public) ──────────────────────────
POST   /api/scan                    → Submit free scan (urls[] + email)
GET    /api/scan/:id                → Poll scan status + results
GET    /api/scan/:id/report         → Full report JSON

# ── Auth ─────────────────────────────────────────
POST   /api/auth/signup             → Create account (email + password)
POST   /api/auth/login              → Login
POST   /api/auth/forgot             → Password reset

# ── Stores ───────────────────────────────────────
POST   /api/stores                  → Register store
POST   /api/stores/:id/connect      → Platform OAuth/API key connection
GET    /api/stores/:id              → Store details + latest scores
DELETE /api/stores/:id              → Remove store

# ── Scanning ─────────────────────────────────────
POST   /api/stores/:id/scan         → Full store scan (all products)
GET    /api/stores/:id/scans        → Scan history
GET    /api/stores/:id/scores       → Latest dimension scores
GET    /api/stores/:id/products     → All products with individual scores
GET    /api/stores/:id/issues       → All issues, filterable by severity/dimension
GET    /api/stores/:id/history      → Score trend over time (for charts)

# ── Auto-Fix ─────────────────────────────────────
GET    /api/stores/:id/fixes        → Available auto-fixes with preview
POST   /api/stores/:id/fix/schema   → Generate + inject JSON-LD for all products
POST   /api/stores/:id/fix/aeo      → Rewrite descriptions (preview first)
POST   /api/stores/:id/fix/faq      → Generate FAQ schema
POST   /api/stores/:id/fix/all      → Apply all available auto-fixes

# ── Feeds ────────────────────────────────────────
POST   /api/stores/:id/feeds/acp    → Generate ACP feed
POST   /api/stores/:id/feeds/gmc    → Generate GMC supplemental feed
GET    /api/stores/:id/feeds        → List generated feeds + status
GET    /feeds/:id/acp.jsonl.gz      → Public hosted ACP feed URL
GET    /feeds/:id/gmc.xml           → Public hosted GMC feed URL

# ── Competitors ──────────────────────────────────
POST   /api/stores/:id/competitors  → Add competitor URLs
GET    /api/stores/:id/competitors  → Competitor comparison data
DELETE /api/stores/:id/competitors/:cid → Remove competitor

# ── Monitoring ───────────────────────────────────
GET    /api/stores/:id/alerts       → Active alerts
PUT    /api/stores/:id/monitor      → Configure monitoring (frequency, alert channels)

# ── Shopify ──────────────────────────────────────
GET    /api/shopify/install         → OAuth install redirect
GET    /api/shopify/callback        → OAuth callback + token exchange
POST   /api/shopify/webhooks        → Product create/update/delete events

# ── Billing ──────────────────────────────────────
POST   /api/billing/checkout        → Create Stripe checkout session
POST   /api/billing/portal          → Stripe customer portal link
POST   /api/billing/webhook         → Stripe webhook handler
```

### Worker Queues (BullMQ)

```
scan:discovery     → Validate URLs, detect platform
scan:extract       → Firecrawl scrape + data extraction
scan:classify      → LLM classification + AEO scoring
scan:score         → Apply rubrics, generate scores
scan:report        → Build report JSON

fix:schema         → Generate JSON-LD per product
fix:inject         → Push schema to platform (Script Tag API etc.)
fix:aeo            → LLM rewrite descriptions
fix:faq            → Generate FAQ schema
fix:feed           → Build ACP/GMC feed files

monitor:daily      → Re-scan connected stores
monitor:feed       → Refresh hosted feed files
monitor:alert      → Check for score drops, price mismatches
monitor:competitor → Periodic competitor re-scans
```

---

## 9. GROWTH ENGINE

### Viral Loop

```
Merchant scans → sees score (34/100) → shares on socials/Slack
  → competitors see → scan their store → see THEIR score
  → comparison creates urgency → both sign up
  → improved scores get shared ("went from 34 to 87!")
  → cycle continues
```

### Distribution Channels

**1. Shopify App Store (Primary)**
4.6M+ merchants. Keywords: "AI SEO", "schema markup", "structured data", "ChatGPT shopping", "AI commerce", "agent ready". Free scan within the app drives conversion.

**2. Embeddable Scanner Widget**
Any e-commerce blog, newsletter, or tool site can embed a "Check Your AI Readiness" widget. Affiliate commission for embedding sites. Widget input: URL → iframe shows score → full report at getfindable.au.

**3. Public Score Badges**
Merchants who score 80+ can embed: "FINDABLE ✓ Score: 91/100" badge on their store. Free advertising for FINDABLE on every page of their store.

**4. Industry Benchmark Reports**
Quarterly reports: "The Average Shopify Apparel Store Scores 28/100 for AI Readiness." PR + SEO + lead gen. Published on getfindable.au/reports.

**5. Agency Partner Program**
White-label dashboard. Agency brand, agency pricing, agency client relationships. FINDABLE powers the engine. $999/mo base.

**6. Content Engine**
- "Why ChatGPT Doesn't Recommend Your Products"
- "Your Competitor Scores 78. You Score 34. Here's Why."
- "58% of Shoppers Now Use AI. Is Your Store Ready?"
- Weekly teardowns of well-known stores' AI readiness scores

**7. Integration Partnerships**
Cross-promote with Judge.me, Stamped (reviews), Klaviyo (email), PageFly (pages), any Shopify app that touches product data.

---

## 10. REVENUE

| Tier | Monthly | Annual | Includes |
|---|---|---|---|
| **Free Scan** | $0 | $0 | One scan session (up to 3 products). Score + top issues. No fixes. |
| **Starter** | $39/mo | $348/yr ($29/mo) | 500 products. Auto-schema injection. Weekly monitoring. Issue alerts. Email support. |
| **Growth** | $129/mo | $1,068/yr ($89/mo) | 5,000 products. AEO rewrites. ACP + GMC feed builder. FAQ generator. Daily monitoring. 2 competitors. |
| **Pro** | $349/mo | $2,868/yr ($239/mo) | Unlimited products. LLM prompt testing. Feed hosting + auto-refresh. 5 competitors. API access. Priority support. |
| **Agency** | $999/mo | $8,388/yr ($699/mo) | White-label. Unlimited stores. Client dashboards. Custom branding. Bulk scanning. Dedicated support. |

---

## 11. BUILD PHASES

### Phase 1: Free Scanner (Weeks 1-3)
- [ ] Landing page: getfindable.au (React + Vite + Tailwind)
- [ ] 3 URL inputs + email + Cloudflare Turnstile
- [ ] Email capture + disposable email blocklist
- [ ] Scan queue worker (Hono + BullMQ + Redis)
- [ ] Firecrawl integration (single page /scrape)
- [ ] Schema.org extraction + validation
- [ ] HTML content extraction (price, name, images, description, reviews)
- [ ] LLM product classification + AEO scoring (Claude Haiku)
- [ ] Consistency checks (price match, availability match, duplicate schema)
- [ ] Scoring engine (Schema + LLM dimensions)
- [ ] Report UI with scores, issues, sample fix preview
- [ ] Email report delivery (Resend)
- [ ] Drip sequence (5 emails over 14 days)
- [ ] Deploy: Vercel + Railway + Cloudflare R2
- [ ] PostHog analytics + Sentry error tracking

**Launch goal:** 1,000 free scans in first 30 days.

### Phase 2: Shopify App + Auto-Fix (Weeks 4-7)
- [ ] Shopify App Store listing + OAuth flow
- [ ] Product data ingestion via Admin API (GraphQL)
- [ ] Full-catalog scanning (all product pages)
- [ ] JSON-LD auto-generation for every product
- [ ] Schema injection via Script Tag API
- [ ] AEO description rewriter (preview + apply)
- [ ] FAQ schema generator
- [ ] Monitoring dashboard with score history charts
- [ ] Issue management UI (track fixed vs. outstanding)
- [ ] Stripe billing integration (all tiers)
- [ ] Shopify webhooks (product create/update/delete)
- [ ] Weekly monitoring scans (Starter) / daily (Growth+)

**Goal:** 100 paying Shopify merchants.

### Phase 3: Feeds + Protocols (Weeks 8-10)
- [ ] ACP feed generator (JSONL output)
- [ ] Feed hosting on R2 + auto-refresh infrastructure
- [ ] Feed validation against OpenAI spec
- [ ] GMC supplemental feed generator
- [ ] Protocol Compliance scoring dimension (full)
- [ ] ChatGPT shopping visibility check
- [ ] Google AI Mode visibility check
- [ ] Feed management dashboard

**Goal:** First merchants with live ACP feeds generated by FINDABLE.

### Phase 4: Competition + Scale (Weeks 11-14)
- [ ] Competitor scanning engine
- [ ] Competitive Position scoring dimension
- [ ] Comparison reports UI
- [ ] WooCommerce plugin (REST API v3 integration)
- [ ] BigCommerce app (Catalog API)
- [ ] Agency white-label dashboard
- [ ] LLM prompt testing engine (Pro tier)
- [ ] Public score badges (embeddable)
- [ ] Embeddable scanner widget (affiliate program)
- [ ] API access for programmatic scanning
- [ ] Industry benchmark report generator

**Goal:** $25K MRR. 3+ agency partnerships.

---

## 12. COMPETITIVE LANDSCAPE

| Player | What They Do | What They Don't Do | FINDABLE Advantage |
|---|---|---|---|
| Schema App | Shopify schema markup ($30-100/mo) | No AEO, no feeds, no LLM scoring, no competitors | Full stack: schema + LLM + protocols + competitive |
| Smart SEO | Basic Shopify schema + meta ($0-10/mo) | Minimal schema, no AI commerce features | 10x deeper analysis, auto-fix, feeds |
| Ahrefs / SEMrush | Traditional SEO audit | Zero agent/LLM optimization | Different buyer, different problem entirely |
| Alhena AI | AI shopping assistant for stores | On-site chatbot, not readiness scanner | We make stores findable; they add a chatbot |
| Invisible Tech | Consulting ($50K+, 2-week engagement) | Manual, one-time, expensive | Automated, continuous, $39/mo |
| Google Lighthouse | Performance/SEO scoring | No AI readiness, no AEO, no feeds | We're Lighthouse for the AI commerce era |
| Yoast / RankMath | WordPress SEO plugins | Basic schema only, no AI commerce | Full agent + LLM + protocol stack |

**Nobody combines all four dimensions** (schema + LLM discoverability + protocol compliance + competitive positioning) into a single scan-and-fix product.

---

## 13. RISKS

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Shopify builds native AI readiness | Medium | High | Multi-platform from day one. Deeper analysis than any native tool. Speed. |
| OpenAI changes ACP spec | High | Medium | Spec is draft until April 7 2026. We adapt faster than merchants can solo. Spec changes = merchants need us MORE. |
| Schema App adds LLM features | Medium | Medium | They'd add one dimension. We have four. Different product depth. |
| LLM shopping adoption slower than projected | Low | High | Already 50M daily queries. Even slow growth = massive market. |
| Firecrawl pricing increases | Medium | Low | Self-host for volume. API only for JS-heavy pages. Shopify API eliminates need for scraping on primary platform. |
| LLM call costs for AEO rewrites | Medium | Medium | Haiku for classification ($0.002). Sonnet for rewrites only on-demand. Cache results aggressively. |
| Competitors clone the free scanner | High | Low | Scanner is lead gen, not the product. The platform, fixes, feeds, monitoring = the moat. Anyone can build a scanner. Nobody will build the full stack as fast. |

---

## 14. SUCCESS METRICS

### 30 Days
- 5,000 free scans
- 200 email signups
- 50 Shopify app installs
- 15 paying customers
- Baseline: average Findable Score across all scanned stores documented

### 90 Days
- 25,000 free scans
- 500 paying customers
- $15K MRR
- 3 agency partners
- First industry benchmark report published
- Featured in 2+ e-commerce newsletters/podcasts

### 180 Days
- $50K MRR
- WooCommerce + BigCommerce live
- 10 agency partners
- 100K+ products under continuous monitoring
- Measurable proof: "Stores using FINDABLE improved LLM recommendation rate by X%"

### 12 Months
- $150K+ MRR
- Category leader for AI commerce readiness
- Partnership with at least one major platform (Shopify, OpenAI, Google)
- Team of 3-5

---

## 15. ELEVATOR PITCH

**One sentence:** FINDABLE is Lighthouse for AI commerce — scan your store, see what AI shopping agents see, fix everything in one click.

**30-second version:** 58% of consumers now use AI to find products. ChatGPT processes 50 million shopping queries a day. But fewer than 2% of stores are optimized for AI discovery. FINDABLE scans your product pages, scores them for AI readiness across four dimensions, and auto-fixes everything — from structured data to product descriptions to feed compliance. Paste your URL at getfindable.au and see your score in 15 seconds.

**The hook:** "AI agents are shopping for your customers. Can they find you?"
