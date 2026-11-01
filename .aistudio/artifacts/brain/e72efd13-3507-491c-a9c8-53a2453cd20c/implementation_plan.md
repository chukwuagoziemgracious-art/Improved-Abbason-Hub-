# Implementation Plan: Vivid Nigerian Flag Black-Water Canvas, All-Gold Purge, Softened Curves, and Horizontal Book-Album Categories

This revision makes the rippling Nigerian flag prominently visible in the living liquid background, eliminates all residual purple colors in favor of champagne gold, softens shape geometry across all UI surfaces (16px–24px radii), and transforms the 8 departments into a compact, swipeable editorial photo book album with curated imagery.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following confirmed user choices govern this implementation:

- **Confirmed Decision 1: Category Album Photography**: Pre-populate curated, high-resolution luxury editorial photos from Unsplash for all 8 campus departments (Laptops & Tech, Fashion & Style, Groceries & Food, Beauty & Personal Care, Books & Stationery, Hostel Furniture & Home, Gadgets & Repairs, Student Services).
- **Confirmed Decision 2: Background Visibility & Luminous Ripples**: Boost the subsurface Nigerian flag emerald green (`#008751` with luminous caustic wave highlights) and crisp ivory white bands, lift background opacity from pitch black to deep oceanic dark teal (`#040d0a`), and increase touch/mouse ripple responsiveness so wavefronts are immediately visible. Ensure all parent DOM wrappers (`body`, `#root`, `App`, `main`) use transparent or semi-translucent backdrops so the background canvas is never blocked.
- **Confirmed Decision 3: Shape Softness**: Implement a soft rounded luxury aesthetic across the site (16px to 24px corner radii: `rounded-2xl` and `rounded-3xl` for cards, modals, and drawers; `rounded-xl` for buttons and inputs).
- **Confirmed Decision 4: Purple-to-Gold Color Purge**: Search and replace all lingering purple color classes (`purple-900`, `purple-950`, `purple-800`, `purple-700`, `purple-300`, etc.) across all components, replacing them with champagne gold (`#C8A96A`, `border-[#C8A96A]/30`, `bg-[#C8A96A]/10`, etc.).

---

### 1. Overview & Core Concept

- **Living Flag & Ambient Liquid Canvas**: Rework the procedural shader on `<canvas id="water">` with vibrant green channels (`#008751`), higher light reflection exponents, and responsive cursor/touch ripple amplitudes. Remove opaque solid backgrounds on foreground elements so the fluid reflection clearly shows through.
- **Swipeable Editorial Category Book Album**: Replace the vertical 8-card grid with a compact, horizontal photo album carousel. Users can swipe smoothly across department picture cards like browsing an editorial lookbook, complete with prev/next navigation buttons, snap-scroll points, category subtitle tags, and active state indicators.
- **Unified Soft Luxury Visual System**: Replace sharp 6px radii with smooth 16px–24px curvatures, and ensure every border, badge, and glow carries the champagne gold palette.

---

### 2. User Experience & Visual Design

#### A. Living Liquid Canvas & Flag Visibility Overhaul
- **Base Canvas Tone**: Shift from `#020406` (pitch opaque black) to deep ocean water `#030c08` with subtle dark cyan undertones.
- **Flag Tricolor Intensity**:
  - Left & Right Green Bands: Pure Nigerian emerald (`#008751` RGB `0, 135, 81`), with dynamic caustic wave highlights rising to 180–220 on ripples.
  - Middle White Band: Luminous ivory white (`#F2F4EE`) at 55% intensity with wave refraction.
- **Ripple Dynamics**: Enhanced pointer tracking with decayed wave damping ($e^{-3d} \cdot \sin(28d - 3.5t)$) for crisp, ripples deforming the flag in real-time.
- **DOM Transparency**: Ensure `body`, `#root`, `App`, and `<main>` have transparent or faint obsidian tints (`bg-transparent` / `bg-[#020406]/35`) so the canvas at `z-index: -1` is directly visible.

#### B. Department / Category "Book Photo Album" Carousel
- **Spatial Footprint**: Compact, single-row horizontal album carousel that saves significant vertical page space while offering tactile delight.
- **Card Geometry & Aspect Ratio**: 3:4 portrait photo album cards with `rounded-2xl` (16px) corners, subtle 1px champagne gold borders, soft vignette bottom overlays, and smooth hover elevation.
- **8 Curated Editorial Photos**:
  1. *Laptops & Tech*: Minimalist workspace with MacBook & sleek headphones (`https://images.unsplash.com/photo-1517336714731-489689fd1ca8`)
  2. *Fashion & Style*: Modern African urban fashion and designer tailoring (`https://images.unsplash.com/photo-1509631179647-0177331693ae`)
  3. *Groceries & Food*: Artisanal campus kitchen essentials & snacks (`https://images.unsplash.com/photo-1542838132-92c53300491e`)
  4. *Beauty & Fragrance*: Minimalist luxury skincare & amber bottles (`https://images.unsplash.com/photo-1570172619644-dfd03ed5d881`)
  5. *Books & Stationery*: Bound notebooks, study guides, and brass pen (`https://images.unsplash.com/photo-1497633762265-9d179a990aa6`)
  6. *Hostel Living & Home*: Cozy hostel room desk lamp and storage (`https://images.unsplash.com/photo-1513694203232-719a280e022f`)
  7. *Gadgets & Repairs*: Precision smartphone electronics workbench (`https://images.unsplash.com/photo-1581092160607-ee22621dd758`)
  8. *Campus Student Services*: Creative digital camera and workspace (`https://images.unsplash.com/photo-1492691527719-9d1e07e534b4`)
- **Interaction**: Horizontal swipe (`snap-x snap-mandatory`), touch drag, mouse wheel horizontal scroll, and desktop Chevron Left/Right navigation buttons.

#### C. Edge Softening & Complete Purple-to-Gold Purge
- **Softer Corners**:
  - Cards & Modals: `rounded-2xl` (16px) and `rounded-3xl` (24px)
  - Buttons & Form Inputs: `rounded-xl` (12px)
  - Badges & Pills: `rounded-full`
- **Color Unification**:
  - Convert remaining purple accents in `Header`, `Hero`, `ProductCard`, `BasketDrawer`, `SellerDashboard`, `AuthModal`, etc., to champagne gold (`#C8A96A`) and warm ivory (`#E9E6DF`).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Curated High-Res Unsplash Images in Store Seed Data**
  - *Chosen Approach*: Associate high-quality photography URLs with each category in `src/services/store.ts` and `src/data/seedData.ts`.
  - *Why*: Provides instant visual richness matching the luxury aesthetic without requiring user manual upload, while allowing category cards to look like magazine plates.
- **Decision 2: Horizontal Carousel with Native Scroll & Snap vs Third-Party Slider**
  - *Chosen Approach*: Implement a zero-dependency CSS flex snap carousel (`overflow-x-auto snap-x snap-mandatory scroll-smooth`) with React ref controls for Previous/Next buttons.
  - *Why*: 60fps native swipe on touch devices, zero bundle bloat, zero layout shifts, and accessible keyboard navigation.
- **Decision 3: Background Transparency Calibration**
  - *Chosen Approach*: Keep foreground card surfaces as frosted translucent glass (`bg-[#020406]/70 backdrop-blur-md border border-white/[0.08]`) while removing solid pitch black backgrounds from root layout wrappers.
  - *Why*: Allows the green-and-white rippling water to be clearly seen surrounding and between cards without degrading text contrast.

---

### 4. Technical Architecture & System Layout

```
┌────────────────────────────────────────────────────────┐
│                   BROWSER VIEWPORT                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ #water Living Canvas (z-index: -1)               │  │
│  │ - Oceanic dark emerald base tone (#030c08)       │  │
│  │ - Clearly visible Green/White/Green reflection   │  │
│  │ - Interactive touch/mouse fluid ripples          │  │
│  │ - Calibrated contrast vignette                   │  │
│  └──────────────────────────────────────────────────┘  │
│                           ▲                            │
│  ┌────────────────────────┴─────────────────────────┐  │
│  │ APPLICATION UI SHELL (Transparent / Soft Glass)  │  │
│  │ ┌──────────────────────────────────────────────┐ │  │
│  │ │ Luxury Header (Gold buttons & badges)        │ │  │
│  │ └──────────────────────────────────────────────┘ │  │
│  │ ┌──────────────────────────────────────────────┐ │  │
│  │ │ Hero Section (Soft rounded 24px glass card)  │ │  │
│  │ └──────────────────────────────────────────────┘ │  │
│  │ ┌──────────────────────────────────────────────┐ │  │
│  │ │ Department Album (Horizontal Swipeable Book) │ │  │
│  │ │ [Tech] [Fashion] [Food] [Beauty] [Books] ... │ │  │
│  │ └──────────────────────────────────────────────┘ │  │
│  │ ┌──────────────────────────────────────────────┐ │  │
│  │ │ Verified Product Catalog (16px rounded cards)│ │  │
│  │ └──────────────────────────────────────────────┘ │  │
│  │ ┌──────────────────────────────────────────────┐ │  │
│  │ │ Modals & Drawers (24px softened corners)     │ │  │
│  │ └──────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```
