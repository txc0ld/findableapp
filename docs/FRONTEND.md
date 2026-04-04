# FINDABLE — Frontend UI/UX Master Prompt

## Use this prompt when building any FINDABLE frontend component, page, or feature.

---

## IDENTITY

**Product:** FINDABLE — AI Commerce Readiness Scanner
**Domain:** getfindable.au
**Tagline:** "AI agents are shopping for your customers. Can they find you?"
**Audience:** E-commerce store owners, Shopify merchants, digital agencies. Mix of technical and non-technical. Aged 25-50. Primarily mobile-first browsing but desktop for dashboard work.
**Tone:** Confident, sharp, slightly urgent. Not corporate. Not playful. Think: a smart friend who works in tech telling you something important you've been missing. Direct without being aggressive. Premium without being pretentious.

---

## COLOR SYSTEM

### Psychology-Driven Palette

The color system is built on psychological triggers: urgency (you're missing out), trust (we know what we're doing), achievement (your score improved), and clarity (easy to understand at a glance).

**Primary — Electric Indigo**
`#4F46E5` (Indigo-600)
Use: Primary buttons, active states, links, brand accents, score highlights
Why: Indigo conveys intelligence, authority, and innovation. It separates FINDABLE from the sea of blue SaaS products and green "growth" tools. It feels premium and technological without being cold.

**Secondary — Signal Cyan**
`#06B6D4` (Cyan-500)
Use: Secondary actions, data visualizations, progress indicators, hover states
Why: Cyan is associated with scanning, data, and digital intelligence. It pairs with indigo to create a "smart technology" feeling.

**Accent — Amber Warning**
`#F59E0B` (Amber-500)
Use: Warnings, medium-severity issues, attention-grabbing elements, score gauges in the "needs work" range
Why: Amber triggers caution without alarm. It says "pay attention" without saying "panic."

**Danger — Crimson Alert**
`#EF4444` (Red-500)
Use: Critical issues, failing scores (0-30), error states, urgent CTAs
Why: Red creates urgency. When a merchant sees red on their score, they feel compelled to act.

**Success — Emerald Achieved**
`#10B981` (Emerald-500)
Use: Passing scores (70+), fixed issues, success states, positive trends
Why: Green = good. Universal. No learning curve.

**Score Gradient:**
```css
--score-critical: #EF4444;    /* 0-25: Red */
--score-poor: #F97316;        /* 26-40: Orange */
--score-fair: #F59E0B;        /* 41-55: Amber */
--score-good: #84CC16;        /* 56-70: Lime */
--score-great: #10B981;       /* 71-85: Emerald */
--score-excellent: #06B6D4;   /* 86-100: Cyan (rare, aspirational) */
```

**Neutrals:**
```css
--bg-primary: #0F0F13;        /* Near-black with slight purple undertone — dark mode base */
--bg-secondary: #1A1A24;      /* Card backgrounds, elevated surfaces */
--bg-tertiary: #25253A;       /* Hover states, active surfaces */
--border: #2E2E45;            /* Subtle borders, dividers */
--text-primary: #F5F5FF;      /* Primary text — warm white with slight blue */
--text-secondary: #A0A0BC;    /* Secondary text, labels, metadata */
--text-muted: #6B6B85;        /* Disabled, placeholder, tertiary info */
```

**Light mode variant (accessible toggle):**
```css
--bg-primary: #FAFAFE;
--bg-secondary: #FFFFFF;
--bg-tertiary: #F0F0F8;
--border: #E2E2EE;
--text-primary: #0F0F13;
--text-secondary: #55556A;
--text-muted: #9090A5;
```

**Default to dark mode.** It's the standard for developer and tech tools in 2026. It signals sophistication, reduces eye strain, and makes the colorful score data pop. Offer light mode toggle for preference.

---

## TYPOGRAPHY

**Primary Font:** Inter Variable
Why: Variable font (single file, all weights). Designed for screens. Excellent readability at all sizes. Industry standard for SaaS/tech products. Free.

**Mono Font:** JetBrains Mono
Why: For code snippets, JSON-LD previews, technical data. Clean and recognizable as "code."

**Display Font (hero headlines only):** Inter Variable at 800 weight
Or if you want more personality: **Cabinet Grotesk** (bold, geometric, modern — stands out from Inter without clashing)

**Type Scale:**
```css
--text-xs: 0.75rem;      /* 12px — metadata, timestamps */
--text-sm: 0.875rem;     /* 14px — secondary labels, small body */
--text-base: 1rem;       /* 16px — body text */
--text-lg: 1.125rem;     /* 18px — emphasized body */
--text-xl: 1.25rem;      /* 20px — card titles */
--text-2xl: 1.5rem;      /* 24px — section headers */
--text-3xl: 1.875rem;    /* 30px — page titles */
--text-4xl: 2.25rem;     /* 36px — hero subheading */
--text-5xl: 3rem;        /* 48px — hero headline mobile */
--text-6xl: 3.75rem;     /* 60px — hero headline desktop */
--text-7xl: 4.5rem;      /* 72px — the BIG score number */
--text-8xl: 6rem;        /* 96px — score number on report hero */
```

**Rules:**
- Headlines: Inter 700-800 weight. Tight letter-spacing (-0.02em). Tight line-height (1.1).
- Body: Inter 400 weight. Default letter-spacing. Line-height 1.6.
- Labels/metadata: Inter 500 weight. Slightly loose letter-spacing (0.02em). Uppercase for category labels only.
- Max content width: 680px for readable paragraphs. Score reports can go wider (1200px).

---

## MOTION & ANIMATION

### Philosophy

Motion serves three purposes: **confirm** (user action was received), **guide** (draw attention to what matters), and **reveal** (progressive disclosure of content). Motion that doesn't serve one of these purposes gets cut.

### Core Animation Library

**1. Page entrance — Fade Up**
Every section fades in from 20px below as it enters the viewport. Staggered by 80ms per element within a section.
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Trigger: Intersection Observer, threshold: 0.1 */
/* Duration: 600ms, easing: cubic-bezier(0.16, 1, 0.3, 1) */
```

**2. Score counter — Animated Count**
When the score appears, it counts up from 0 to the actual number. Fast at first, decelerating as it approaches the final value.
```
Duration: 1.5s
Easing: cubic-bezier(0.34, 1.56, 0.64, 1) — slight overshoot for drama
The number should be massive (text-8xl) and the color transitions through the score gradient as it counts up (red → orange → amber → green → cyan)
```

**3. Score ring — Circular progress**
An SVG circle that draws itself from 0 to the score percentage. Starts 300ms after the counter begins so they finish together.
```
Duration: 1.8s
Easing: cubic-bezier(0.65, 0, 0.35, 1)
Stroke color matches score gradient
Ring background: subtle dark track
Glow effect on the leading edge of the stroke
```

**4. Button hover — Lift + Glow**
```css
.btn-primary {
  transition: all 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 20px rgba(79, 70, 229, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
}
.btn-primary:active {
  transform: translateY(0px);
  box-shadow: 0 0 10px rgba(79, 70, 229, 0.2);
}
```

**5. Input focus — Border glow**
```css
input:focus {
  border-color: #4F46E5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
  transition: all 150ms ease;
}
```

**6. Issue cards — Slide in from left, stagger**
Issues in the report slide in from the left, staggered by 60ms. Critical issues appear first (fastest), low severity last.
```css
/* stagger-delay: index * 60ms */
/* duration: 400ms */
/* easing: cubic-bezier(0.16, 1, 0.3, 1) */
```

**7. Scan progress — Pulse + Step**
During the scan loading state, a progress indicator pulses with step labels:
"Scanning page 1 of 3..." → "Extracting structured data..." → "Analyzing LLM readiness..." → "Calculating score..."
Each step fades in/out with a 300ms crossfade. A subtle horizontal progress bar advances underneath.

**8. Score comparison — Bar race**
When comparing 3 products, their score bars animate simultaneously like a bar chart race. The highest score wins visually.

**9. CTA pulse — Subtle attention grab**
The primary CTA button has a very subtle pulse animation (box-shadow breathing) that triggers when it enters the viewport. Not annoying — just alive.
```css
@keyframes ctaPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.3); }
  50% { box-shadow: 0 0 0 8px rgba(79, 70, 229, 0); }
}
/* animation: ctaPulse 3s infinite; */
/* Only plays once when entering viewport, then stops */
```

**10. Glassmorphism cards (subtle)**
Cards use a frosted glass effect with backdrop blur. Not heavy — just enough to create depth layers.
```css
.card {
  background: rgba(26, 26, 36, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
}
```

### Motion Rules

- Always respect `prefers-reduced-motion`. If set, disable all animations instantly.
- Never animate layout (no width/height transitions — use transform and opacity only).
- Never block interaction. Animations run while the user can still click/scroll.
- Max animation duration: 800ms for UI elements, 2s for data visualizations (score counter).
- Easing: never use `linear`. Default to `cubic-bezier(0.16, 1, 0.3, 1)` (smooth decel).
- Stagger delays: 50-80ms between elements in a list. Never more than 100ms.

---

## LAYOUT SYSTEM

### Grid

12-column grid. Max width 1280px. Gutters 24px. Responsive breakpoints:

```css
--mobile: 0-639px        /* 1 column, 16px padding */
--tablet: 640-1023px      /* 2 columns, 24px padding */
--desktop: 1024-1279px    /* 3 columns, 24px padding */
--wide: 1280px+           /* 4 columns, centered, 32px padding */
```

### Spacing Scale (8px base)

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
--space-32: 128px;
```

### Section Spacing
- Between major page sections: 96-128px (space-24 to space-32)
- Between cards/elements within a section: 24-32px
- Card internal padding: 24-32px
- Generous whitespace is mandatory. When in doubt, add more space.

---

## COMPONENT DESIGN

### Buttons

```
Primary: bg-indigo-600, text-white, rounded-xl, px-6 py-3, font-semibold
  Hover: bg-indigo-500, lift -2px, glow shadow
  Active: bg-indigo-700, drop back to 0
  
Secondary: bg-transparent, border border-white/10, text-white, rounded-xl
  Hover: bg-white/5, border-white/20

Ghost: bg-transparent, text-indigo-400, no border
  Hover: text-indigo-300, underline
  
Danger: bg-red-600/10, text-red-400, border border-red-500/20
  Hover: bg-red-600/20
  
Size Large: text-lg, px-8 py-4 (for hero CTAs)
Size Default: text-base, px-6 py-3
Size Small: text-sm, px-4 py-2
```

All buttons: `transition-all duration-200`, `font-medium`, `cursor-pointer`.
Never flat. Always have at least a subtle shadow or border to indicate interactability.

### Input Fields

```
Default: bg-bg-secondary, border border-border, rounded-xl, px-4 py-3, text-base
  Placeholder: text-muted
  Focus: border-indigo-500, ring-2 ring-indigo-500/20
  Error: border-red-500, ring-2 ring-red-500/20
  
URL inputs: monospace font (JetBrains Mono), slightly smaller text
Email input: standard Inter font
```

### Cards

```
Default: bg-bg-secondary/70, backdrop-blur-md, border border-white/5, rounded-2xl, p-6
  Hover (if interactive): border-white/10, bg-bg-secondary/90, translate-y -2px
  
Score Card: Same base + colored left border (4px) matching score severity
Issue Card: Same base + severity icon + colored badge (critical/high/medium/low)
```

### Score Display

The score is the centerpiece of the entire product. It must feel impactful, like a speedometer or health check result.

```
┌─────────────────────────────────┐
│                                 │
│          ┌─────────┐            │
│         │  ╭─────╮  │           │
│         │ │  34  │  │  ← massive number, animated counter
│         │  ╰─────╯  │           │
│          └─────────┘            │
│       circular progress ring    │
│                                 │
│   Your Findable Score           │
│   "Needs significant work"     │
│                                 │
│   Schema: 41  LLM: 28          │
│   Protocol: 15  Comp: --       │
│                                 │
└─────────────────────────────────┘
```

- Score number: text-8xl (96px), font-weight 800, color matches score gradient
- Ring: SVG, 200px diameter, 8px stroke width, animated draw
- Ring track: rgba(255,255,255,0.05)
- Ring fill: gradient matching score color
- Glow: subtle radial glow behind the score matching its color
- Label below: text-lg, text-secondary, with verbal assessment:
  - 0-25: "Critical — invisible to AI" (red)
  - 26-40: "Poor — major gaps" (orange)
  - 41-55: "Fair — needs work" (amber)
  - 56-70: "Good — on the right track" (lime)
  - 71-85: "Great — competitive" (emerald)
  - 86-100: "Excellent — fully optimized" (cyan)

### Issue List

```
┌─ CRITICAL ─────────────────────────────────────┐
│ ● 847 products missing Schema.org markup       │
│   +25 points if fixed  •  Auto-fixable ✓      │
├─ CRITICAL ─────────────────────────────────────┤
│ ● Price mismatch on 12 SKUs                   │
│   +5 points if fixed   •  Manual fix required  │
├─ HIGH ─────────────────────────────────────────┤
│ ● No machine-readable return policy            │
│   +5 points if fixed   •  Auto-fixable ✓      │
├─ MEDIUM ───────────────────────────────────────┤
│ ● Descriptions are marketing copy, not AEO     │
│   +8 points if fixed   •  Auto-fixable ✓      │
└────────────────────────────────────────────────┘
```

- Severity badges: colored pills (red/orange/amber/gray) with severity text
- Points impact: emerald text showing potential score improvement
- Fix type: pill badge — "Auto-fixable ✓" in emerald, "Manual" in amber
- Slide-in animation, staggered by severity (critical first)

---

## LANDING PAGE STRUCTURE

### Section 1: Hero

Full viewport height. Dark background with subtle radial gradient (indigo glow from center, fading to near-black). No image — pure typography and the scanner form.

```
[Nav: Logo | How It Works | Pricing | Login]

       AI agents are shopping
       for your customers.

          Can they find you?

  58% of consumers now use AI to find products.
  Fewer than 2% of stores are ready.

  ┌──────────────────────────────────┐
  │ https://your-store.com/product1  │
  ├──────────────────────────────────┤
  │ https://your-store.com/product2  │
  ├──────────────────────────────────┤
  │ https://               optional  │
  ├──────────────────────────────────┤
  │ your@email.com                   │
  └──────────────────────────────────┘
  
       [ Get Your Findable Score ]
       
  ☁ Protected by Cloudflare  •  Free  •  15 seconds
```

- Headline: text-6xl on desktop, text-4xl on mobile. Font-weight 800. Tight leading. White.
- "Can they find you?" on its own line, slightly smaller, in indigo-400 gradient text.
- Stats line: text-lg, text-secondary. The "58%" and "2%" in white/bold for emphasis.
- Form: glassmorphism card, centered, max-width 520px
- CTA button: full width within card, large size, indigo-600, with ctaPulse animation
- Trust signals below CTA: small text, text-muted, with Cloudflare logo mark

### Section 2: What We Scan (Bento Grid)

4-card bento grid showing the four scoring dimensions. Each card has an icon, title, score preview, and 3-4 bullet items.

```
┌──────────────────────┬──────────────────────┐
│                      │                      │
│  Schema Intelligence │  LLM Discoverability │
│  "Can agents read    │  "Will ChatGPT       │
│   your products?"    │   recommend you?"    │
│                      │                      │
│  • JSON-LD markup    │  • AEO optimization  │
│  • Product IDs       │  • Review signals    │
│  • Shipping schema   │  • FAQ structure     │
│  • Data consistency  │  • Content freshness │
│                      │                      │
├──────────────────────┼──────────────────────┤
│                      │                      │
│  Protocol Compliance │  Competitive Position│
│  "Are you on the     │  "How do you compare │
│   new AI shelves?"   │   to competitors?"   │
│                      │                      │
│  • OpenAI ACP feed   │  • Side-by-side scan │
│  • Google UCP        │  • Gap analysis      │
│  • Merchant programs │  • Trend tracking    │
│  • Feed freshness    │  • Win/loss signals  │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

- Bento grid with varying card sizes (2 larger on top, 2 on bottom, or staggered)
- Each card: glassmorphism background, subtle border, icon top-left
- Icons: Lucide icons in indigo-400 (Search, Brain, Plug, BarChart3)
- Cards fade-up on scroll with 100ms stagger
- On hover: card lifts 4px, border brightens

### Section 3: The Score Experience (Social Proof via Example)

Show an anonymized example of a real scan result. "Here's what a typical Shopify store looks like:"

Large score ring (34/100) animates when scrolled into view. Below it, the dimension breakdown and top 3 issues.

This section does the selling. When the visitor sees a realistic low score with specific issues, they immediately project that onto their own store and want to scan it.

### Section 4: The Fix (Before/After)

Split screen or toggle showing:
- LEFT/BEFORE: Raw product page HTML with no structured data → "What AI agents see: nothing"
- RIGHT/AFTER: Same page with FINDABLE's JSON-LD injected → "What AI agents see: everything"

The JSON-LD preview uses syntax highlighting (JetBrains Mono, colored tokens). It should look beautiful and technical — it signals "we know what we're doing."

Toggle animation: smooth horizontal slide or fade crossfade.

### Section 5: Stats Bar

Full-width section with 4 key stats in a horizontal row. Numbers animate (count up) when scrolled into view.

```
50M+              2.47%             3.6x              89%
daily AI          LLM conversion    more reviews =     FAQ schema
shopping queries  rate              recommended        citation boost
```

- Numbers: text-5xl, font-weight 800, indigo-400
- Labels: text-sm, text-secondary, below numbers
- Subtle indigo glow behind each number
- Count-up animation with easeOutExpo timing

### Section 6: How It Works

3-step horizontal flow:

```
  ①                    ②                    ③
  Scan                 Score                Fix

  Paste your           See your             Auto-inject
  product URLs         Findable Score       Schema, AEO,
                       across 4             feeds — one
                       dimensions           click
```

- Steps connected by a subtle animated line/arrow
- Each step: icon, title, description
- Numbers in large indigo circles

### Section 7: Pricing

Clean pricing cards. Dark background. 4 tiers side by side (Starter, Growth, Pro, Agency). Growth tier highlighted as "Most Popular."

- Annual toggle with discount shown ("Save 25%")
- Feature lists with checkmarks (emerald) and x-marks (muted)
- CTA per card: "Start Free Scan" for all tiers (funnel everything through the scan first)
- Enterprise/Agency card: "Contact Us" CTA

### Section 8: Logos / Trust (If Available)

"Trusted by X stores" or "Powered by" section with Firecrawl, Cloudflare, Stripe, Shopify logos in muted white/gray.

### Section 9: Footer CTA

Repeat the scanner form. Same design as hero but with the headline:
"Your competitors might already be ahead. Find out."

### Section 10: Footer

Minimal. Logo, nav links, social links, copyright. Dark. Clean.

---

## DASHBOARD DESIGN (Post-Login)

### Navigation

Left sidebar, collapsible. Dark bg-primary. Icon + label nav items:
- Dashboard (home/overview)
- Products (all products with scores)
- Issues (filterable issue list)
- Fixes (auto-fix center)
- Feeds (ACP/GMC feed management)
- Competitors (comparison view)
- Settings

Active state: indigo-500 left border + bg-bg-tertiary + white text
Inactive: text-secondary
Hover: bg-bg-tertiary

### Dashboard Home

Top row: 4 metric cards (Overall Score, Schema Score, LLM Score, Protocol Score) each with sparkline trend chart.

Below: Recent issues (5 most recent), Fix suggestions, Score history chart (line chart, 30-day view).

### Products Page

Table/list view of all products. Columns: Product Name, Image (tiny), Schema Score, LLM Score, Issues Count, Status (fixed/unfixed).

Sortable by any column. Filterable by score range, issue severity, category.
Click a product → detail view with full scoring breakdown.

### Report Page (post-scan)

This is the hero moment. The page that makes or breaks conversion.

Full-width, centered layout. Score ring at top, massive. Dimension breakdown below. Product-by-product comparison (if 3 products scanned). Issue list with fix CTAs. Sample JSON-LD preview. Sample AEO rewrite preview. "Connect Shopify to fix everything" persistent bottom bar CTA.

---

## INTERACTION PATTERNS

### Loading States

Never use generic spinners. Use contextual loading:
- Scan in progress: step-by-step progress with descriptive labels + horizontal bar
- Data loading: skeleton screens matching the layout shape (pulsing rectangles)
- Button loading: button text replaced with small spinner + "Scanning..." text, button stays same width

### Empty States

When no data exists yet (no products, no scans, no competitors):
- Illustration or icon (muted)
- Clear headline: "No products scanned yet"
- Subtext: "Run your first scan to see results here"
- CTA button to trigger the action

### Error States

- Inline validation on form fields (red border + message below field)
- Toast notifications for system errors (top-right, auto-dismiss 5s)
- Full-page error for scan failures (with retry button)

### Success States

- Green checkmark animation (draws itself) for fixed issues
- Score improvement: old score → new score with count-up animation and confetti particles (subtle, not obnoxious)
- Toast: "Schema injected successfully" with emerald accent

---

## PSYCHOLOGICAL PERSUASION TECHNIQUES

### 1. Loss Aversion (Primary Driver)
The score inherently triggers loss aversion. "You're at 34/100" implies you're LOSING potential sales to AI shopping. Frame everything as what they're missing, not what they could gain.

### 2. Social Proof via Competition
"Your competitor scores 67" is more powerful than "You could score 67." Always reference the competitive frame.

### 3. Commitment Escalation
Free scan (micro-commitment) → email captured → report delivered → drip sequence → Shopify install (medium commitment) → paid plan (full commitment). Each step is small and justified by the previous.

### 4. Progress + Achievement
Score improvement is gamified. Going from 34 → 67 feels like achievement. Show progress bars, before/after comparisons, "issues fixed" counts. The dashboard should feel like leveling up.

### 5. Specificity = Credibility
"847 products missing Schema.org markup" is 10x more persuasive than "Your structured data needs work." Always show specific numbers, specific product names, specific issues.

### 6. Urgency (Genuine)
"58% of consumers already use AI for product discovery" — this isn't manufactured urgency. It's real. Frame it as "the shift is happening now, not in 2 years."

### 7. Anchoring
Show the highest-impact fix first. "Fix this one issue and gain +25 points." Anchors their expectation that improvement is fast and significant.

---

## TECHNICAL IMPLEMENTATION

### Stack
- **React 19** + **Vite**
- **TailwindCSS v4** (latest) for all styling
- **Framer Motion** for animations (intersection observer triggers, layout animations, gesture support)
- **Recharts** or **Tremor** for dashboard charts
- **Lucide React** for icons (consistent, clean, lightweight)
- **Inter Variable** via Google Fonts or self-hosted (single variable font file)
- **JetBrains Mono** via Google Fonts for code/technical elements

### Performance Requirements
- Lighthouse Performance: >90
- First Contentful Paint: <1.5s
- Largest Contentful Paint: <2.5s
- Cumulative Layout Shift: <0.1
- Total page weight: <500KB (landing page)
- No layout shift from font loading (use `font-display: swap` + preload)
- All animations use `transform` and `opacity` only (GPU-accelerated)
- Lazy load all below-fold images and heavy components
- Preload hero fonts and critical CSS

### Accessibility
- WCAG 2.1 AA minimum
- All interactive elements keyboard accessible
- Focus visible styles (indigo ring, never hidden)
- `prefers-reduced-motion`: disable all animations, show static states
- `prefers-color-scheme`: respect system preference for dark/light
- Color contrast: 4.5:1 minimum for all text
- Aria labels on all icon-only buttons
- Semantic HTML (nav, main, section, article, aside)
- Screen reader announcements for dynamic content (score results, scan progress)

### Mobile
- Touch targets: minimum 44x44px
- Thumb zone: primary CTAs in bottom 60% of screen
- No horizontal scroll
- Scan form: stack vertically, full-width inputs
- Score display: responsive — ring scales, number stays large
- Dashboard: bottom tab navigation on mobile, not sidebar

---

## REFERENCE SITES FOR VISUAL INSPIRATION

Study these for tone, motion, and quality (not to copy — to match the caliber):

- **linear.app** — dark mode SaaS done perfectly. Motion, typography, spacing.
- **vercel.com** — clean, developer-focused, high-contrast dark theme.
- **raycast.com** — premium feel, beautiful animations, dark mode.
- **cal.com** — open source SaaS with excellent dashboard design.
- **posthog.com** — playful but professional, great data visualization.
- **resend.com** — minimalist, fast, dark mode, beautiful typography.

---

## THE GOLDEN RULE

Every pixel must answer: **does this help the merchant understand their score and feel compelled to fix it?**

If a design element doesn't serve comprehension or conversion, remove it. Beauty in FINDABLE comes from clarity, not decoration. The score IS the design. The issues ARE the content. The fix IS the product. Everything else is scaffolding.
