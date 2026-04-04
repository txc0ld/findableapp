# SKILL.md — AI-Ready Schema Generator

## Overview

This skill generates 10/10 gold-standard JSON-LD structured data optimized for three audiences simultaneously: **Google/Bing crawlers** (rich results, AI Overviews), **AI shopping agents** (ChatGPT Shopping, Gemini AI Mode, Perplexity), and **LLM recommendation engines** (when users ask "best X for Y").

The output is not basic Schema.org compliance. It is maximum-signal, zero-ambiguity structured data designed for agentic commerce in 2026.

---

## When To Use

Use this skill whenever you need to generate, audit, or fix JSON-LD structured data for:
- E-commerce product pages
- Business/organization pages
- Service pages
- Article/blog content
- Local business listings
- FAQ pages
- Any page that should be discoverable by AI agents

---

## Core Principles

### 1. Explicit Over Implicit
Never make an AI agent guess. If a product is black, say `"color": "Black"`. If it weighs 300g, say `"weight": {"@type": "QuantitativeValue", "value": "300", "unitCode": "GRM"}`. Agents that have to infer attributes from description text will deprioritize you vs. a competitor with explicit structured data.

### 2. Complete Over Minimal
Google's required properties are the floor, not the ceiling. Every recommended and optional property that can be populated SHOULD be populated. Stores with 99.9% attribute completion ("Golden Record") see 3-4x higher AI visibility.

### 3. Consistent Across Surfaces
The `name`, `brand`, `price`, and `availability` in your JSON-LD must exactly match what's visible on the page AND what's in your product feeds (OpenAI ACP, Google Merchant Center). Mismatches are a trust-breaking signal. AI agents cross-reference.

### 4. Factual Over Marketing
AI agents and LLMs parse descriptions for extractable facts. "Premium quality luxury experience" = zero extractable attributes. "300gsm 100% organic cotton crewneck, GOTS certified, manufactured in Portugal" = 5+ extractable attributes. OpenAI's ACP feed spec explicitly rejects marketing language.

### 5. Nested Relationships Over Flat Data
Use nested `@type` objects (Brand, Organization, Offer, AggregateRating, ShippingDetails, MerchantReturnPolicy) rather than flat key-value pairs. Nested entities create knowledge graph nodes that AI agents can traverse and cross-reference.

### 6. One Source of Truth Per Page
Exactly ONE `Product` schema block per product page. Duplicate or conflicting blocks (from theme + app + manual injection) confuse AI agents. Detect and consolidate.

---

## Schema Templates

### Template 1: Product Page (E-Commerce) — Gold Standard

This is the maximum-signal product schema. Every property here serves a specific AI agent or LLM discovery purpose.

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  
  // ── IDENTITY (Required) ──────────────────────────────────
  "name": "Heavyweight Black Organic Cotton Crewneck Tee",
  "description": "The [Brand] Heavyweight Tee is a 300gsm 100% organic cotton crewneck t-shirt with reinforced collar and double-stitched hems. Available in Black, White, Navy, Olive. Sizes XS-3XL. Relaxed fit, 74cm body length (size M). Pre-shrunk. Ethically manufactured in Portugal. GOTS certified. Best for: streetwear layering, casual daily wear, workwear basics. Similar to: Carhartt WIP Chase Tee, Lady White Co. Lite Jersey.",
  "url": "https://store.com/products/heavyweight-black-tee",
  "productID": "HWT-BLK-001",
  "sku": "HWT-BLK-XL",
  "gtin13": "0012345678901",
  "mpn": "HWT-300-BLK",
  
  // ── MEDIA ────────────────────────────────────────────────
  "image": [
    "https://store.com/images/tee-front.jpg",
    "https://store.com/images/tee-back.jpg",
    "https://store.com/images/tee-detail.jpg",
    "https://store.com/images/tee-lifestyle.jpg"
  ],
  
  // ── BRAND ────────────────────────────────────────────────
  "brand": {
    "@type": "Brand",
    "name": "BrandName",
    "url": "https://store.com",
    "logo": "https://store.com/logo.png"
  },
  
  // ── CLASSIFICATION ───────────────────────────────────────
  "category": "Apparel & Accessories > Clothing > Shirts & Tops > T-Shirts",
  "audience": {
    "@type": "PeopleAudience",
    "suggestedGender": "unisex",
    "suggestedMinAge": 16
  },
  
  // ── PHYSICAL ATTRIBUTES ──────────────────────────────────
  "color": "Black",
  "material": "100% Organic Cotton",
  "pattern": "Solid",
  "size": "XL",
  "weight": {
    "@type": "QuantitativeValue",
    "value": "300",
    "unitCode": "GRM",
    "unitText": "gsm"
  },
  
  // ── CATEGORY-SPECIFIC ATTRIBUTES ─────────────────────────
  "additionalProperty": [
    {
      "@type": "PropertyValue",
      "name": "Fabric Weight",
      "value": "300gsm"
    },
    {
      "@type": "PropertyValue",
      "name": "Fit",
      "value": "Relaxed"
    },
    {
      "@type": "PropertyValue",
      "name": "Body Length",
      "value": "74cm (Size M)"
    },
    {
      "@type": "PropertyValue",
      "name": "Neckline",
      "value": "Crewneck"
    },
    {
      "@type": "PropertyValue",
      "name": "Hem",
      "value": "Double-stitched"
    },
    {
      "@type": "PropertyValue",
      "name": "Pre-Shrunk",
      "value": "Yes"
    },
    {
      "@type": "PropertyValue",
      "name": "Certification",
      "value": "GOTS Organic"
    },
    {
      "@type": "PropertyValue",
      "name": "Country of Manufacture",
      "value": "Portugal"
    },
    {
      "@type": "PropertyValue",
      "name": "Care Instructions",
      "value": "Machine wash cold 30°C, tumble dry low, do not bleach"
    }
  ],
  
  // ── OFFER (Price + Availability + Shipping + Returns) ────
  "offers": {
    "@type": "Offer",
    "url": "https://store.com/products/heavyweight-black-tee?variant=xl",
    "price": "49.95",
    "priceCurrency": "AUD",
    "priceValidUntil": "2026-12-31",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition",
    "seller": {
      "@type": "Organization",
      "name": "StoreName",
      "url": "https://store.com"
    },
    "shippingDetails": {
      "@type": "OfferShippingDetails",
      "shippingRate": {
        "@type": "MonetaryAmount",
        "value": "9.95",
        "currency": "AUD"
      },
      "shippingDestination": {
        "@type": "DefinedRegion",
        "addressCountry": "AU"
      },
      "deliveryTime": {
        "@type": "ShippingDeliveryTime",
        "handlingTime": {
          "@type": "QuantitativeValue",
          "minValue": 1,
          "maxValue": 2,
          "unitCode": "DAY"
        },
        "transitTime": {
          "@type": "QuantitativeValue",
          "minValue": 3,
          "maxValue": 7,
          "unitCode": "DAY"
        }
      }
    },
    "hasMerchantReturnPolicy": {
      "@type": "MerchantReturnPolicy",
      "applicableCountry": "AU",
      "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
      "merchantReturnDays": 30,
      "returnMethod": "https://schema.org/ReturnByMail",
      "returnFees": "https://schema.org/FreeReturn",
      "returnPolicySeasonalOverride": {
        "@type": "MerchantReturnPolicySeasonalOverride",
        "startDate": "2026-11-01",
        "endDate": "2027-01-31",
        "merchantReturnDays": 60
      }
    }
  },
  
  // ── REVIEWS ──────────────────────────────────────────────
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.7",
    "bestRating": "5",
    "worstRating": "1",
    "ratingCount": "312",
    "reviewCount": "234"
  },
  "review": [
    {
      "@type": "Review",
      "author": {
        "@type": "Person",
        "name": "Jake M."
      },
      "datePublished": "2026-02-15",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "5",
        "bestRating": "5"
      },
      "reviewBody": "Best heavyweight tee I've owned. Fabric is thick without being stiff. True to size."
    },
    {
      "@type": "Review",
      "author": {
        "@type": "Person",
        "name": "Sarah L."
      },
      "datePublished": "2026-01-28",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": "4",
        "bestRating": "5"
      },
      "reviewBody": "Great quality cotton. Slightly long in the body for my preference but material is excellent."
    }
  ],
  
  // ── NAVIGATION CONTEXT ───────────────────────────────────
  "isRelatedTo": [
    {
      "@type": "Product",
      "name": "Heavyweight White Organic Cotton Crewneck Tee",
      "url": "https://store.com/products/heavyweight-white-tee"
    },
    {
      "@type": "Product",
      "name": "Midweight Black Cotton Pocket Tee",
      "url": "https://store.com/products/midweight-black-pocket-tee"
    }
  ]
}
```

### Template 1b: Multi-Variant Product (ProductGroup)

When a product has multiple variants (sizes, colors), use ProductGroup as parent:

```json
{
  "@context": "https://schema.org",
  "@type": "ProductGroup",
  "name": "Heavyweight Organic Cotton Crewneck Tee",
  "description": "...",
  "url": "https://store.com/products/heavyweight-tee",
  "brand": { "@type": "Brand", "name": "BrandName" },
  "productGroupID": "HWT-001",
  "variesBy": ["https://schema.org/color", "https://schema.org/size"],
  
  "hasVariant": [
    {
      "@type": "Product",
      "name": "Heavyweight Tee - Black / XL",
      "sku": "HWT-BLK-XL",
      "gtin13": "0012345678901",
      "color": "Black",
      "size": "XL",
      "image": "https://store.com/images/tee-black.jpg",
      "offers": {
        "@type": "Offer",
        "price": "49.95",
        "priceCurrency": "AUD",
        "availability": "https://schema.org/InStock",
        "url": "https://store.com/products/heavyweight-tee?variant=blk-xl"
      }
    },
    {
      "@type": "Product",
      "name": "Heavyweight Tee - White / M",
      "sku": "HWT-WHT-M",
      "gtin13": "0012345678902",
      "color": "White",
      "size": "M",
      "image": "https://store.com/images/tee-white.jpg",
      "offers": {
        "@type": "Offer",
        "price": "49.95",
        "priceCurrency": "AUD",
        "availability": "https://schema.org/InStock",
        "url": "https://store.com/products/heavyweight-tee?variant=wht-m"
      }
    }
  ],
  
  "aggregateRating": { "...": "shared across group" },
  "review": ["..."]
}
```

**Key:** Each variant gets its own `sku`, `gtin`, `color`, `size`, `image`, and `offers`. The parent ProductGroup holds shared properties (brand, description, reviews, category attributes).

---

### Template 2: FAQPage (LLM Citation Booster)

FAQ schema boosts LLM citation probability by 89%. Generate questions a real shopper would type into ChatGPT.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What material is the Heavyweight Tee made from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "300gsm 100% organic cotton, GOTS certified. Ethically manufactured in Portugal. Pre-shrunk with minimal shrinkage after first wash (<2%)."
      }
    },
    {
      "@type": "Question",
      "name": "What sizes are available for the Heavyweight Tee?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Available in XS, S, M, L, XL, 2XL, and 3XL. Relaxed fit. Body length for size M is 74cm. Size chart available on the product page."
      }
    },
    {
      "@type": "Question",
      "name": "How do I wash the Heavyweight Tee?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Machine wash cold at 30°C. Tumble dry low. Do not bleach. Iron on low heat if needed. The tee is pre-shrunk and will maintain its shape."
      }
    },
    {
      "@type": "Question",
      "name": "What is the return policy?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Free returns within 30 days of purchase. Extended to 60 days during holiday season (November through January). Return by mail with prepaid label."
      }
    },
    {
      "@type": "Question",
      "name": "How does this compare to Carhartt WIP tees?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "The Heavyweight Tee is 300gsm compared to Carhartt WIP Chase Tee at approximately 280gsm. Both are relaxed fit. The Heavyweight Tee uses GOTS-certified organic cotton while Carhartt uses conventional cotton. Price is comparable."
      }
    }
  ]
}
```

**Rules for FAQ generation:**
- Questions must be phrased as a real person would ask ChatGPT (natural language, not keyword-stuffed)
- Answers must contain concrete, extractable facts (numbers, measurements, comparisons)
- Include at least one comparison question ("How does this compare to X?")
- Include at least one care/maintenance question
- Include at least one sizing/fit question
- Every answer should be 2-4 sentences max — concise and factual

---

### Template 3: Organization / LocalBusiness

For the store's homepage or about page. Establishes the entity in knowledge graphs.

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://store.com/#organization",
  "name": "StoreName",
  "legalName": "StoreName Pty Ltd",
  "url": "https://store.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://store.com/logo.png",
    "width": 512,
    "height": 512
  },
  "description": "Australian-made heavyweight basics. 100% organic cotton, ethically manufactured.",
  "foundingDate": "2020-06-15",
  "founder": {
    "@type": "Person",
    "name": "Founder Name"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Example Street",
    "addressLocality": "Perth",
    "addressRegion": "WA",
    "postalCode": "6000",
    "addressCountry": "AU"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "-31.9505",
    "longitude": "115.8605"
  },
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+61-8-1234-5678",
    "contactType": "customer service",
    "email": "hello@store.com",
    "availableLanguage": "English",
    "contactOption": "TollFree"
  },
  "sameAs": [
    "https://www.instagram.com/storename",
    "https://www.tiktok.com/@storename",
    "https://www.facebook.com/storename",
    "https://www.linkedin.com/company/storename"
  ],
  "paymentAccepted": ["Credit Card", "PayPal", "Apple Pay", "Google Pay", "Afterpay"],
  "currenciesAccepted": "AUD",
  "areaServed": {
    "@type": "Country",
    "name": "Australia"
  },
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Products",
    "itemListElement": [
      {
        "@type": "OfferCatalog",
        "name": "T-Shirts",
        "url": "https://store.com/collections/tees"
      },
      {
        "@type": "OfferCatalog",
        "name": "Hoodies",
        "url": "https://store.com/collections/hoodies"
      }
    ]
  }
}
```

**For LocalBusiness with physical store, add:**
```json
{
  "@type": "ClothingStore",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "17:30"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "10:00",
      "closes": "16:00"
    }
  ],
  "priceRange": "$$"
}
```

Use the most specific `@type` available: `ClothingStore`, `ElectronicsStore`, `HomeGoodsStore`, `SportingGoodsStore`, `FurnitureStore`, etc. More specific = higher confidence from AI agents.

---

### Template 4: BreadcrumbList

Shows product categorization hierarchy. Helps agents understand where this product fits in your catalog.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://store.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Men's",
      "item": "https://store.com/collections/mens"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "T-Shirts",
      "item": "https://store.com/collections/mens-tees"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "Heavyweight Black Tee",
      "item": "https://store.com/products/heavyweight-black-tee"
    }
  ]
}
```

---

### Template 5: WebSite + SearchAction (Sitelinks Search Box)

For the homepage. Tells agents the site is searchable.

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://store.com/#website",
  "name": "StoreName",
  "url": "https://store.com",
  "publisher": { "@id": "https://store.com/#organization" },
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://store.com/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

---

## Category-Specific Attribute Reference

When generating `additionalProperty` entries, use this reference to ensure category-relevant attributes are included:

### Apparel
```
Fabric Weight (gsm), Fit (Slim/Regular/Relaxed/Oversized), 
Body Length, Chest Width, Sleeve Length, Neckline, 
Closure Type, Care Instructions, Certification, 
Country of Manufacture, Season, Occasion
```

### Electronics
```
Screen Size, Resolution, Processor, RAM, Storage,
Battery Life, Connectivity (WiFi/Bluetooth/USB-C),
Operating System, Dimensions (L×W×H), Weight,
Warranty Period, Certification (CE/FCC/UL),
Compatibility, Included Accessories
```

### Footwear
```
Sole Material, Upper Material, Closure Type,
Heel Height, Arch Support, Waterproof (Yes/No),
Width (Narrow/Regular/Wide), Drop (mm),
Weight Per Shoe, Terrain Type, Break-In Period
```

### Furniture
```
Dimensions (W×D×H), Weight, Weight Capacity,
Material (Frame), Material (Upholstery),
Assembly Required (Yes/No), Assembly Time,
Number of Pieces, Style, Indoor/Outdoor,
Certification (FSC/CARB), Warranty
```

### Beauty / Skincare
```
Volume/Weight, Skin Type (All/Dry/Oily/Combination/Sensitive),
Key Ingredients, Active Ingredients, SPF,
Fragrance (Yes/No/Fragrance-Free), Vegan (Yes/No),
Cruelty-Free (Yes/No), Certification (Organic/EWG),
Application Method, Shelf Life After Opening
```

### Food & Beverage
```
Net Weight, Serving Size, Servings Per Container,
Calories Per Serving, Ingredients List,
Allergens (Contains/May Contain), Dietary (Vegan/GF/Keto),
Certification (Organic/Non-GMO/Kosher/Halal),
Country of Origin, Storage Instructions, Best Before
```

---

## AEO Description Writing Rules

When generating or rewriting product descriptions for the `description` field in JSON-LD, follow these rules strictly:

### Structure
```
Sentence 1: "[Brand] [Product Name] is a [key spec] [material] [product type]."
Sentence 2-3: List remaining attributes (dimensions, weight, colors, sizes).
Sentence 4: "Best for: [use case 1], [use case 2], [use case 3]."
Sentence 5: Care/maintenance instruction (if applicable).
Sentence 6: "Similar to: [Competitor Product 1], [Competitor Product 2]."
```

### Rules
1. First sentence MUST define what the product IS — not what it "offers" or how it "elevates"
2. Every sentence must contain at least one concrete, measurable fact
3. BANNED words: premium, luxury, amazing, incredible, elevate, experience, crafted, curated, artisanal, bespoke, revolutionary, game-changing, best-in-class, world-class, unparalleled
4. Include at least 10 extractable attributes in total
5. Include comparison anchors ("Similar to:") with real competitor product names
6. An LLM reading this description must be able to answer: What is it? What's it made of? What size? What color? Who's it for? How to care for it? What's it comparable to?
7. Maximum 150 words. Dense and factual.

---

## Multiple Schema Blocks Per Page

A product page should have MULTIPLE JSON-LD blocks in separate `<script>` tags:

```html
<!-- Block 1: Product (primary) -->
<script type="application/ld+json">
{ "@type": "Product", ... }
</script>

<!-- Block 2: BreadcrumbList -->
<script type="application/ld+json">
{ "@type": "BreadcrumbList", ... }
</script>

<!-- Block 3: FAQPage -->
<script type="application/ld+json">
{ "@type": "FAQPage", ... }
</script>

<!-- Block 4: Organization (site-wide, on every page) -->
<script type="application/ld+json">
{ "@type": "Organization", "@id": "https://store.com/#organization", ... }
</script>

<!-- Block 5: WebSite (site-wide, on every page) -->
<script type="application/ld+json">
{ "@type": "WebSite", "@id": "https://store.com/#website", ... }
</script>
```

Use `@id` references to link entities across blocks without duplicating data.

---

## Validation Checklist

Before outputting any JSON-LD, verify:

- [ ] Valid JSON syntax (no trailing commas, proper escaping)
- [ ] `@context` is `"https://schema.org"` (HTTPS, not HTTP)
- [ ] `@type` uses exact Schema.org type names (case-sensitive)
- [ ] All URLs are absolute (start with `https://`)
- [ ] All dates use ISO 8601 format (`YYYY-MM-DD`)
- [ ] All prices are strings with decimal points (`"49.95"` not `49.95`)
- [ ] Currency codes are ISO 4217 (`"AUD"` not `"$"` or `"Australian Dollar"`)
- [ ] Availability uses full Schema.org URL (`"https://schema.org/InStock"`)
- [ ] No duplicate Product schemas on the same page
- [ ] Price in schema matches price visible on page
- [ ] Availability in schema matches stock status visible on page
- [ ] Images resolve (valid URLs, HTTPS)
- [ ] `priceValidUntil` is not in the past
- [ ] Weight uses proper `unitCode` (GRM, KGM, LBR, OZA)
- [ ] Dimensions use proper `unitCode` (CMT, MTR, INH)
- [ ] Phone numbers include country code
- [ ] `sameAs` URLs are valid and point to actual profiles
- [ ] No marketing language in `description` (factual, attribute-dense only)
- [ ] FAQ questions are phrased as natural language queries
- [ ] FAQ answers contain concrete facts, not vague statements

---

## Anti-Patterns (Never Do This)

```json
// ❌ Generic name with no specificity
"name": "T-Shirt"

// ✅ Specific, attribute-rich name
"name": "Heavyweight Black Organic Cotton Crewneck Tee"
```

```json
// ❌ Marketing fluff description
"description": "Experience the ultimate comfort with our premium tee."

// ✅ Factual, extractable description
"description": "300gsm 100% organic cotton crewneck t-shirt. Relaxed fit. Pre-shrunk. GOTS certified."
```

```json
// ❌ Missing nested types
"brand": "BrandName"

// ✅ Proper nested entity
"brand": { "@type": "Brand", "name": "BrandName" }
```

```json
// ❌ Price as number
"price": 49.95

// ✅ Price as string
"price": "49.95"
```

```json
// ❌ Relative URL
"image": "/images/product.jpg"

// ✅ Absolute URL
"image": "https://store.com/images/product.jpg"
```

```json
// ❌ Custom availability value
"availability": "Available"

// ✅ Schema.org enum URL
"availability": "https://schema.org/InStock"
```

```json
// ❌ Flat weight with no unit
"weight": "300g"

// ✅ QuantitativeValue with unit code
"weight": { "@type": "QuantitativeValue", "value": "300", "unitCode": "GRM" }
```

---

## OpenAI ACP Feed Alignment

When generating JSON-LD that will also be used to populate an ACP feed, ensure these fields map correctly:

| JSON-LD Property | ACP Feed Field | Notes |
|---|---|---|
| `name` | `product.title` | Must be factual, not marketing |
| `description` | `product.description` | OpenAI rejects marketing language |
| `brand.name` | `product.brand` | Consistent across all surfaces |
| `category` | `product.category` | Google Product Category taxonomy |
| `url` | `product.url` | Canonical product page URL |
| `sku` | `variant.id` or `variant.sku` | Unique per variant |
| `gtin13` | `variant.gtin` | Required for physical goods |
| `offers.price` | `variant.price.amount` | Must match exactly |
| `offers.priceCurrency` | `variant.price.currency` | ISO 4217 |
| `offers.availability` | `variant.availability` | in_stock / out_of_stock / preorder |
| `image` | `variant.image_url` | Primary variant image |
| `shippingDetails` | `shipping.methods[]` | Rate + delivery estimate |
| `hasMerchantReturnPolicy` | `policies.return_policy` | URL to policy page |

**Critical:** The ACP spec requires `group_id` to link variants. Map this to the parent product ID in your schema's `ProductGroup`.

---

## Google UCP Alignment

For Google's Universal Commerce Protocol, ensure:

- Google Merchant Center feed is active with products approved
- `native_commerce` attribute set to `true` on eligible listings
- JSON capability manifest published (declares supported commerce actions)
- Return policies defined in Merchant Center
- `structured_title` and `structured_description` used if content is AI-generated
- All Schema.org Product markup on page matches Merchant Center feed exactly

---

## Testing

Validate all generated JSON-LD with:
1. **Google Rich Results Test:** https://search.google.com/test/rich-results
2. **Schema.org Validator:** https://validator.schema.org/
3. **JSON-LD Playground:** https://json-ld.org/playground/
4. Manual review: paste into ChatGPT and ask "Based on this structured data, describe this product" — if it can accurately describe the product, the schema is working.
