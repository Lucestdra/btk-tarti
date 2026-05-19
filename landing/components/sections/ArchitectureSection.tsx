"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  Globe,
  Puzzle,
  Server,
  MessageSquareText,
  ChartNoAxesCombined,
  WalletCards,
  MousePointerClick,
  Scale,
  Database,
  Cpu,
  ShieldCheck,
  Layers,
  Network,
  Container as ContainerIcon,
  Lock,
  Activity,
  RefreshCw,
  Clock,
  Zap,
  GitBranch,
  FileCode2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Container } from "@/components/shell/Container";
import { fadeUp, stagger, viewportOnce } from "@/lib/motion";
import { cn } from "@/lib/cn";

type LayerCard = {
  key: string;
  title: string;
  subtitle: string;
  desc: string;
  Icon: LucideIcon;
  bullets: string[];
};

const layers: LayerCard[] = [
  {
    key: "landing",
    title: "Landing",
    subtitle: "Next.js 15 · App Router",
    desc: "Tanıtım sayfası ve sentetik demo. Backend olmadan da çalışan canlı bir gösterim.",
    Icon: Globe,
    bullets: [
      "Sentetik fixture'lar (shared/demo)",
      "Framer Motion + Tailwind",
      "Statik SSR build (standalone)",
    ],
  },
  {
    key: "extension",
    title: "Chrome Extension",
    subtitle: "Manifest V3 · Shadow DOM",
    desc: "Sepete Ekle tıklamalarını yakalar, ürün payload'ı oluşturur, paneli render eder.",
    Icon: Puzzle,
    bullets: [
      "Capture-phase tıklama yakalama",
      "5 katmanlı productExtractor",
      "Shadow DOM izole panel (React)",
    ],
  },
  {
    key: "backend",
    title: "FastAPI Backend",
    subtitle: "Python · Pydantic · LangGraph",
    desc: "5 ajanı paralel çalıştıran orkestratör; karar ağırlıklı toplam + eskalasyon kuralı.",
    Icon: Server,
    bullets: [
      "4 paralel sinyal ajanı + karar ajanı",
      "TTL+LRU cache, retry + circuit breaker",
      "SQLAlchemy + Alembic (pgvector planlı)",
    ],
  },
];

const moduleTrees = [
  {
    key: "landing",
    title: "Landing",
    Icon: Globe,
    accent: "text-cerulean",
    nodes: [
      { label: "app/", type: "dir", note: "Next.js App Router; / ve /mimari" },
      { label: "components/sections/", type: "dir", note: "Hero, Demo, Mimari, Footer" },
      { label: "components/demo/", type: "dir", note: "AgentFlow, ExtensionPanelMock, ProductPageMock" },
      { label: "lib/runDemo.ts", type: "file", note: "Sentetik akış simülatörü" },
      { label: "lib/streamAnalyze.ts", type: "file", note: "Backend SSE bağlantısı" },
      { label: "shared/demo/", type: "dir", note: "Backend yokken kullanılan fixture'lar" },
    ],
  },
  {
    key: "extension",
    title: "Chrome Extension",
    Icon: Puzzle,
    accent: "text-cerulean",
    nodes: [
      { label: "manifest.json", type: "file", note: "MV3 izinleri, contentScript glob'ları" },
      { label: "src/contentScript.ts", type: "file", note: "Capture-phase click yakalama" },
      { label: "src/utils/productExtractor.ts", type: "file", note: "5 katmanlı çıkarım: JSON-LD → og: → DOM" },
      { label: "src/utils/platformSelectors.ts", type: "file", note: "Trendyol / Hepsiburada / N11 seçici paketleri" },
      { label: "src/background.ts", type: "file", note: "Service worker; backend HTTP isteği" },
      { label: "src/panel/mount.tsx", type: "file", note: "Shadow DOM içine React mount" },
      { label: "src/panel/App.tsx", type: "file", note: "Karar paneli, agent chips" },
      { label: "src/api/client.ts", type: "file", note: "Demo fallback fixture'ı" },
    ],
  },
  {
    key: "backend",
    title: "FastAPI Backend",
    Icon: Server,
    accent: "text-cerulean",
    nodes: [
      { label: "app/main.py", type: "file", note: "FastAPI app + lifecycle hooks" },
      { label: "app/api/", type: "dir", note: "REST + SSE rotaları, admin guard" },
      { label: "app/services/graph.py", type: "file", note: "LangGraph StateGraph: 4 paralel + decision" },
      { label: "app/services/orchestrator.py", type: "file", note: "Senkron fallback orkestratör" },
      { label: "app/agents/review_agent.py", type: "file", note: "Gemini + heuristik tekrar tespiti" },
      { label: "app/agents/price_agent.py", type: "file", note: "30/90 günlük geçmiş + dış kaynak" },
      { label: "app/agents/budget_agent.py", type: "file", note: "Aylık + kategori limitleri" },
      { label: "app/agents/impulse_agent.py", type: "file", note: "Sayfa süresi + tıklama hızı" },
      { label: "app/agents/decision_agent.py", type: "file", note: "Ağırlıklı toplam + Gemini özet" },
      { label: "app/core/cache.py", type: "file", note: "TTL + LRU + telemetri" },
      { label: "app/core/_gemini_resilience.py", type: "file", note: "Retry + circuit breaker" },
      { label: "app/db/models.py", type: "file", note: "PriceObservation, UserBudgetRow" },
    ],
  },
];

const agents = [
  {
    key: "review",
    label: "Yorum",
    weight: "25%",
    weightNum: 25,
    desc: "Jaccard token tekrar + jenerik ifade + burst tespiti. Üretim: Gemini embeddings + DBSCAN.",
    Icon: MessageSquareText,
    inputs: ["reviews[]", "ratingHistogram"],
    output: "0–100 + clusters[]",
  },
  {
    key: "price",
    label: "Fiyat",
    weight: "30%",
    weightNum: 30,
    desc: "30/90 günlük fiyat geçmişi; indirim öncesi yapay yükseliş tespiti.",
    Icon: ChartNoAxesCombined,
    inputs: ["price", "priceHistory[]", "akakce?"],
    output: "0–100 + fakeDiscount",
  },
  {
    key: "budget",
    label: "Bütçe",
    weight: "25%",
    weightNum: 25,
    desc: "Aylık + kategori limitleri, kalan harcanabilir tutar; PostgreSQL kalıcı durum.",
    Icon: WalletCards,
    inputs: ["userId", "category", "amount"],
    output: "0–100 + remaining",
  },
  {
    key: "impulse",
    label: "Dürtü",
    weight: "20%",
    weightNum: 20,
    desc: "Sayfa süresi, tıklama hızı, saat ve günlük alım kural seti.",
    Icon: MousePointerClick,
    inputs: ["sessionMs", "clicks", "hourLocal"],
    output: "0–100 + reasons",
  },
];

const verdicts = [
  {
    label: "Yeşil",
    range: "0–39",
    tone: "border-verdict-green/45 bg-verdict-green/12 text-verdict-green",
    dot: "bg-verdict-green",
    desc: "Risk düşük. Devam edebilirsin.",
  },
  {
    label: "Sarı",
    range: "40–69",
    tone: "border-verdict-yellow/45 bg-verdict-yellow/12 text-verdict-yellow",
    dot: "bg-verdict-yellow",
    desc: "Şüpheli sinyal. 30 saniye düşün.",
  },
  {
    label: "Kırmızı",
    range: "70–100",
    tone: "border-verdict-red/45 bg-verdict-red/12 text-verdict-red",
    dot: "bg-verdict-red",
    desc: "Yüksek risk. İptal etmen öneriliyor.",
  },
];

type WorkedExample = {
  title: string;
  decision: "green" | "yellow" | "red";
  breakdown: { price: number; review: number; budget: number; impulse: number };
  risk: number;
  summary: string;
};

const workedExamples: WorkedExample[] = [
  {
    title: "Yorum Kitabı",
    decision: "green",
    breakdown: { price: 12, review: 18, budget: 6, impulse: 22 },
    risk: 14,
    summary: "Yorumlar organik, fiyat tutarlı, bütçede bol yer var.",
  },
  {
    title: "Kablosuz Kulaklık",
    decision: "yellow",
    breakdown: { price: 62, review: 48, budget: 30, impulse: 55 },
    risk: 51,
    summary: "Fiyat son 90 günde 2 kez yükselip indirilmiş; yorumlarda burst.",
  },
  {
    title: "Oversize Hoodie",
    decision: "red",
    breakdown: { price: 84, review: 72, budget: 88, impulse: 70 },
    risk: 79,
    summary: "Yapay indirim, jenerik yorum kümeleri, kategori limiti aşılıyor.",
  },
];

const stack = [
  {
    title: "Frontend",
    Icon: Globe,
    items: [
      { name: "Next.js", v: "15" },
      { name: "React", v: "18" },
      { name: "Tailwind CSS", v: "3.4" },
      { name: "Framer Motion", v: "11" },
      { name: "TypeScript", v: "5.6" },
    ],
  },
  {
    title: "Eklenti",
    Icon: Puzzle,
    items: [
      { name: "Manifest", v: "V3" },
      { name: "Vite + React", v: "—" },
      { name: "Shadow DOM panel", v: "—" },
      { name: "chrome.runtime", v: "—" },
    ],
  },
  {
    title: "Backend",
    Icon: Server,
    items: [
      { name: "FastAPI", v: "—" },
      { name: "Pydantic", v: "v2" },
      { name: "LangGraph", v: "—" },
      { name: "Google Gemini", v: "2.5 Flash" },
      { name: "SQLAlchemy + Alembic", v: "—" },
    ],
  },
  {
    title: "Veri & Altyapı",
    Icon: Database,
    items: [
      { name: "PostgreSQL", v: "16" },
      { name: "pgvector (planlı)", v: "—" },
      { name: "TTL + LRU cache", v: "—" },
      { name: "Docker Compose", v: "—" },
    ],
  },
];

const flowSteps = [
  {
    step: "01",
    title: "Yakalama",
    timing: "T+0ms",
    desc: "Eklenti `contentScript` capture-phase listener'ı Trendyol/Hepsiburada/N11 sayfasında \"Sepete Ekle\" tıklamasını yakalar.",
    code: "event.preventDefault();\nevent.stopImmediatePropagation();",
  },
  {
    step: "02",
    title: "Ürün Çıkarımı",
    timing: "T+12ms",
    desc: "5 katmanlı productExtractor sırasıyla JSON-LD, og:* meta, platforma özel DOM seçicileri ve fallback'leri dener.",
    code: 'extract(): JSON-LD ▸ og: ▸ DOM ▸ data-kg-* ▸ fallback',
  },
  {
    step: "03",
    title: "Panel Mount",
    timing: "T+45ms",
    desc: "Shadow DOM içine React panel mount edilir. Host sayfanın CSS'i panele dokunmaz.",
    code: 'attachShadow({ mode: "closed" })',
  },
  {
    step: "04",
    title: "HTTP İstek",
    timing: "T+120ms",
    desc: "background.ts service worker AnalyzeRequest'i POST eder.",
    code: "POST /api/analyze-purchase  (SSE upgrade)",
  },
  {
    step: "05",
    title: "Paralel Ajanlar",
    timing: "T+260ms",
    desc: "LangGraph orchestrator 4 sinyal ajanını paralel başlatır; her biri 0–100 risk + gerekçe döner.",
    code: "review · price · budget · impulse  →  Promise.allSettled",
  },
  {
    step: "06",
    title: "Karar",
    timing: "T+3100ms",
    desc: "decision_agent ağırlıklı toplam + eskalasyon uygular, Gemini ile özet üretir.",
    code: "risk = 0.30·p + 0.25·r + 0.25·b + 0.20·i",
  },
  {
    step: "07",
    title: "Panel Sonuç",
    timing: "T+3200ms",
    desc: "Panel kararı (renk, özet, 3 gerekçe) gösterir. Kullanıcı eylemi seçer.",
    code: 'response.decision  ∈  { green, yellow, red }',
  },
  {
    step: "08",
    title: "Aksiyon",
    timing: "T+3200ms+",
    desc: "Devam Et → data-kg-bypass=1 ile orijinal click replay; 30 sn düşün / kapat → satın alma iptal.",
    code: "btn.setAttribute('data-kg-bypass','1'); btn.click();",
  },
];

const cacheLayers = [
  {
    title: "Gemini özet cache",
    ttl: "900s",
    Icon: Clock,
    note: "decision_agent narration; aynı (product, user) için 15 dk taze.",
  },
  {
    title: "Review embedding cache",
    ttl: "300s",
    Icon: Clock,
    note: "review_agent kümeleme sonuçları; cluster ID stabil kalır.",
  },
  {
    title: "Fiyat history snapshot",
    ttl: "60s",
    Icon: Activity,
    note: "price_observations son N gün penceresi; sık yazıma karşı kısa TTL.",
  },
  {
    title: "Akakçe karşılaştırma",
    ttl: "1800s",
    Icon: RefreshCw,
    note: "Dış kaynak ağırdır; 30 dk önbellek + force_refresh bypass.",
  },
];

const resiliencePatterns = [
  {
    title: "Retry",
    Icon: RefreshCw,
    desc: "Gemini hatasında 3 deneme: 0.1s → 0.4s → 1.6s + jitter.",
  },
  {
    title: "Circuit Breaker",
    Icon: Zap,
    desc: "3 ardışık hata → 30 saniye devre kapalı. Heuristik fallback devreye girer.",
  },
  {
    title: "Targeted Invalidation",
    Icon: GitBranch,
    desc: "Bütçe veya gözlem yazımında ilgili cache anahtarları temizlenir.",
  },
  {
    title: "Force Refresh",
    Icon: Activity,
    desc: "?force_refresh=true tek çağrı için cache'i atlar.",
  },
];

const dbTables = [
  {
    name: "price_observations",
    Icon: ChartNoAxesCombined,
    desc: "Ürün başına fiyat noktaları; hot path için composite index.",
    fields: [
      { name: "id", type: "PK", note: "" },
      { name: "url", type: "string", note: "kanonik URL" },
      { name: "raw_url", type: "string", note: "debug" },
      { name: "price", type: "float", note: "TRY" },
      { name: "platform", type: "enum", note: "trendyol/n11/hb" },
      { name: "observed_at", type: "datetime", note: "tz=UTC, idx" },
    ],
  },
  {
    name: "user_budgets",
    Icon: WalletCards,
    desc: "Kullanıcı × kategori limit; PK (user_id, category).",
    fields: [
      { name: "user_id", type: "PK", note: "anonim id" },
      { name: "category", type: "PK", note: "" },
      { name: "monthly_limit", type: "float", note: "denormalize" },
      { name: "category_limit", type: "float", note: "" },
      { name: "category_spent", type: "float", note: "period reset" },
      { name: "period_start", type: "date", note: "ay başı" },
    ],
  },
  {
    name: "analyses (planlı)",
    Icon: Activity,
    desc: "Her analiz sonucu loglanır → fine-tuning + A/B testi.",
    fields: [
      { name: "id", type: "PK", note: "" },
      { name: "user_id", type: "fk", note: "" },
      { name: "url_hash", type: "string", note: "idx" },
      { name: "decision", type: "enum", note: "g/y/r" },
      { name: "risk_score", type: "int", note: "0–100" },
      { name: "agents_json", type: "jsonb", note: "ham çıktı" },
    ],
  },
  {
    name: "review_vectors (pgvector)",
    Icon: Database,
    desc: "Yorum embedding'leri; ANN sorgu ile küme eşleştirme.",
    fields: [
      { name: "review_id", type: "PK", note: "" },
      { name: "url", type: "string", note: "idx" },
      { name: "embedding", type: "vector(768)", note: "gemini" },
      { name: "cluster_id", type: "int", note: "DBSCAN" },
      { name: "is_suspicious", type: "bool", note: "" },
    ],
  },
];

const securityPoints = [
  {
    title: "Shadow DOM izolasyonu",
    Icon: ShieldCheck,
    desc: "Panel kapalı shadow tree içinde; host sayfa CSS/JS'i değiştiremez, XSS host'a sızmaz.",
  },
  {
    title: "Pydantic doğrulama",
    Icon: FileCode2,
    desc: "Her API girişi Field bound'larıyla normalize edilir; aşağı katmanlar tipli girişe güvenir.",
  },
  {
    title: "Sıkı CORS",
    Icon: Lock,
    desc: "Sadece thundrly.com ve chrome-extension://* origin'leri kabul edilir.",
  },
  {
    title: "Admin token guard",
    Icon: ShieldCheck,
    desc: "/api/cache/purge gibi yönetim rotaları THUNDRLY_ADMIN_TOKEN ile korunur.",
  },
  {
    title: "PII minimizasyonu",
    Icon: Lock,
    desc: "Yorumlar Gemini'a gönderilmeden önce kullanıcı adı vb. alanlar maskeleme listesinden geçer.",
  },
  {
    title: "Anonim kullanıcı kimliği",
    Icon: Cpu,
    desc: "MVP'de userId yereldir; e-posta veya kişisel bilgi backend'e iletilmez.",
  },
];

const deployment = [
  { name: "nginx (host)", Icon: Network, desc: "TLS sonlandırma; thundrly.com → 3000, api.thundrly.com → 8000." },
  { name: "thundrly-landing", Icon: Globe, desc: "Next.js standalone; 127.0.0.1:3000 bind, ~150 MB image." },
  { name: "thundrly-backend", Icon: Server, desc: "FastAPI; 127.0.0.1:8000 bind, /api/ready healthcheck." },
  { name: "thundrly-postgres", Icon: Database, desc: "postgres:16-alpine; sadece compose ağında erişilebilir." },
];

const mockVsReal = [
  {
    dim: "Yorum analizi",
    mock: "Jaccard token tekrar + jenerik ifade + burst",
    real: "Gemini embeddings + DBSCAN + LLM özeti",
  },
  {
    dim: "Fiyat geçmişi",
    mock: "İstek payload'ındaki fiyat geçmişi",
    real: "PriceObservation tablosu + Akakçe ikincil kaynak",
  },
  {
    dim: "Bütçe",
    mock: "Payload içinden çıkarılır",
    real: "PostgreSQL user_budgets (PK uid+cat)",
  },
  {
    dim: "Dürtü",
    mock: "Sayfa süresi + tıklama hızı + saat",
    real: "Davranışsal model + tarayıcı geçmişi (yerel)",
  },
  {
    dim: "Orkestrasyon",
    mock: "Senkron orchestrator.analyze()",
    real: "LangGraph StateGraph; 4 paralel node, decision fan-in",
  },
  {
    dim: "Yorum vektörleri",
    mock: "Yok",
    real: "pgvector + Gemini embeddings",
  },
];

const principles = [
  {
    title: "Shadow DOM izolasyonu",
    Icon: ShieldCheck,
    desc: "Eklenti paneli host sayfanın CSS'inden tamamen izole; hiçbir e-ticaret stilinden etkilenmez.",
  },
  {
    title: "Deterministik mock + canlı LLM",
    Icon: Cpu,
    desc: "Demo modu Gemini olmadan tekrarlanabilir çıktı verir. Üretim modunda retry + circuit breaker arkasında.",
  },
  {
    title: "Tek sözleşme, üç bileşen",
    Icon: Database,
    desc: "AnalyzeRequest / AnalyzeResponse shared/types ile TypeScript ve Pydantic'te aynalanır.",
  },
];

export function ArchitectureSection() {
  return (
    <main className="pb-24">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative border-b border-line pt-16 pb-16 md:pt-24 md:pb-24 overflow-hidden">
        <BackgroundGrid />
        <Container className="relative">
          <div className="grid lg:grid-cols-[1.2fr_1fr] items-center gap-12 lg:gap-16">
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              <motion.div variants={fadeUp} className="kicker mb-4">
                Mimari
              </motion.div>
              <motion.h1
                variants={fadeUp}
                className="font-display text-4xl md:text-6xl lg:text-7xl font-light leading-[1.04] tracking-tightest text-balance text-ink"
              >
                Üç bileşen,{" "}
                <span className="italic font-normal">tek sözleşme</span>.
              </motion.h1>
              <motion.p
                variants={fadeUp}
                className="mt-7 lead max-w-2xl text-pretty"
              >
                Thundrly; landing, Chrome eklentisi ve FastAPI backend olmak üzere üç
                bağımsız bileşenden oluşur. Hepsi aynı{" "}
                <code className="px-1.5 py-0.5 rounded-sm bg-bg-tertiary/60 text-[14px]">
                  AnalyzeRequest / AnalyzeResponse
                </code>{" "}
                sözleşmesi etrafında konuşur. Aşağıda her katmanın görevi, veri
                akışı, dayanıklılık katmanları, veritabanı şeması ve dağıtım
                topolojisi net olarak anlatılıyor.
              </motion.p>
              <motion.ul
                variants={fadeUp}
                className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] text-ink-muted"
              >
                <li className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cerulean" />
                  12 bölüm
                </li>
                <li className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cerulean" />
                  8 adımlı zaman çizelgesi
                </li>
                <li className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-cerulean" />
                  4 paralel ajan + 1 karar
                </li>
              </motion.ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="hidden lg:block"
            >
              <HeroPulseDiagram />
            </motion.div>
          </div>
        </Container>
      </section>

      {/* ── 01 · Yüksek seviye ───────────────────────────── */}
      <SectionHeader
        eyebrow="01 · Yüksek seviye"
        title={
          <>
            Üç katman, paylaşılan{" "}
            <span className="italic">tip sözleşmesi</span>.
          </>
        }
        intro="Landing ve eklenti hem AnalyzeRequest'i üretir hem de AnalyzeResponse'u tüketir; backend bu sözleşmenin tek sahibidir."
      />
      <Container>
        <SystemDiagram />
      </Container>

      {/* ── 02 · Bileşen detayları ───────────────────────── */}
      <SectionHeader
        eyebrow="02 · Bileşen detayları"
        title={
          <>
            Her katmanın{" "}
            <span className="italic">iç modülleri</span>.
          </>
        }
        intro="Repo bağımsız üç klasör halinde organize: landing/, extension/, backend/ — paylaşılan tipler shared/ altında."
      />
      <Container>
        <div className="grid lg:grid-cols-3 gap-4 md:gap-5">
          {moduleTrees.map((tree, i) => {
            const Icon = tree.Icon;
            return (
              <motion.div
                key={tree.key}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.08, duration: 0.55 }}
                className="card-elevated p-5 md:p-6"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70">
                    <Icon className={cn("h-4 w-4", tree.accent)} strokeWidth={1.7} />
                  </div>
                  <div className="font-display text-base font-medium text-ink tracking-tight">
                    {tree.title}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {tree.nodes.map((node, j) => (
                    <motion.li
                      key={node.label}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={viewportOnce}
                      transition={{ delay: 0.1 + j * 0.04 }}
                      className="group flex items-start gap-2.5"
                    >
                      <span
                        className={cn(
                          "mt-2 h-1 w-1 rounded-full shrink-0",
                          node.type === "dir"
                            ? "bg-cerulean"
                            : "bg-ink-faint",
                        )}
                      />
                      <div className="min-w-0">
                        <div className="font-mono text-[12.5px] text-ink leading-tight">
                          {node.label}
                        </div>
                        <div className="text-[11.5px] text-ink-muted leading-snug mt-0.5">
                          {node.note}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </Container>

      {/* ── 03 · Veri akışı zaman çizelgesi ──────────────── */}
      <SectionHeader
        eyebrow="03 · Veri akışı"
        title={
          <>
            Sepete Ekle'den{" "}
            <span className="italic">karara</span>, 8 adım.
          </>
        }
        intro="Her adım için ölçülen ortalama gecikme ve ilgili kod satırı. Toplam yol: ~3.2 saniye."
      />
      <Container>
        <FlowTimeline />
      </Container>

      {/* ── 04 · LangGraph orkestrasyonu ─────────────────── */}
      <SectionHeader
        eyebrow="04 · Orkestrasyon"
        title={
          <>
            LangGraph: dört paralel sinyal,{" "}
            <span className="italic">tek karar</span>.
          </>
        }
        intro="Sinyal ajanları birbirinden bağımsız; karar ajanı fan-in node olarak çalışır, ağırlıklı toplamı ve eskalasyon kurallarını uygular."
      />
      <Container>
        <AgentGraph />

        <div className="grid md:grid-cols-2 gap-4 md:gap-5 mt-10 md:mt-14">
          {agents.map((a, i) => {
            const Icon = a.Icon;
            return (
              <motion.div
                key={a.key}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.06, duration: 0.5 }}
                whileHover={{ y: -3 }}
                className="card-elevated p-5 md:p-6"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70">
                    <Icon className="h-4 w-4 text-cerulean" strokeWidth={1.7} />
                  </div>
                  <div className="font-display text-lg font-normal text-ink tracking-tight">
                    {a.label} Ajanı
                  </div>
                  <div className="ml-auto text-[12px] text-ink-muted tabular-nums">
                    {a.weight}
                  </div>
                </div>

                <WeightBar value={a.weightNum} />

                <div className="text-[13.5px] text-ink-soft leading-relaxed mt-4">
                  {a.desc}
                </div>

                <div className="hairline my-4" />

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11.5px]">
                  <div>
                    <span className="kicker mr-2">Input</span>
                    <span className="font-mono text-ink-soft">
                      {a.inputs.join(" · ")}
                    </span>
                  </div>
                  <div>
                    <span className="kicker mr-2">Output</span>
                    <span className="font-mono text-ink-soft">{a.output}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </Container>

      {/* ── 05 · Karar mantığı + örnekler ───────────────── */}
      <SectionHeader
        eyebrow="05 · Karar"
        title={
          <>
            Ağırlıklı toplam +{" "}
            <span className="italic">eskalasyon</span>.
          </>
        }
        intro="Risk skoru 0–100 arası; eşik bantları ve eskalasyon kuralı tek bir güçlü sinyalin kaybolmamasını sağlar."
      />
      <Container>
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-12 items-start">
          <div className="card-elevated p-7 md:p-9">
            <div className="kicker mb-3">Ağırlıklı toplam</div>
            <div className="font-mono text-[14.5px] md:text-[15.5px] text-ink leading-relaxed bg-bg-tertiary/40 rounded-md px-4 py-4 border border-line">
              risk = 0.30·price + 0.25·review + 0.25·budget + 0.20·impulse
            </div>

            <div className="hairline my-6" />

            <div className="kicker mb-3">Eskalasyon kuralı</div>
            <p className="text-[14px] text-ink-soft leading-relaxed">
              Tek bir ajan çok güçlü sinyal veriyorsa ağırlıklı toplam düşük olsa
              bile karar yükseltilir — sinyal kaybolmasın diye.
            </p>
            <ul className="mt-3 space-y-2 text-[14px] text-ink-soft">
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-verdict-red shrink-0" />
                <span>
                  <span className="font-mono">single_max ≥ 80</span> → risk en az{" "}
                  <span className="font-mono">70</span> (kırmızı zorunlu)
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="mt-1.5 h-1 w-1 rounded-full bg-verdict-yellow shrink-0" />
                <span>
                  <span className="font-mono">single_max ≥ 45</span> → risk en az{" "}
                  <span className="font-mono">42</span> (sarı zorunlu)
                </span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            {verdicts.map((v, i) => (
              <motion.div
                key={v.label}
                initial={{ opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.08 }}
                className={cn(
                  "rounded-xl border px-5 py-4 flex items-start gap-4",
                  v.tone,
                )}
              >
                <div className="flex items-center gap-3 min-w-[120px]">
                  <motion.span
                    animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.5 }}
                    className={cn("h-2 w-2 rounded-full", v.dot)}
                  />
                  <span className="font-display text-base font-medium tracking-tight">
                    {v.label}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-between gap-3">
                  <span className="text-[13.5px] opacity-90">{v.desc}</span>
                  <span className="font-mono text-[12.5px] opacity-80 tabular-nums">
                    {v.range}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Worked examples */}
        <div className="mt-12 md:mt-16">
          <div className="kicker mb-5">Üç örnek, çalışan matematik</div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-5">
            {workedExamples.map((ex, i) => (
              <WorkedExampleCard key={ex.title} ex={ex} delay={i * 0.1} />
            ))}
          </div>
        </div>
      </Container>

      {/* ── 06 · Cache & Resilience ──────────────────────── */}
      <SectionHeader
        eyebrow="06 · Cache & dayanıklılık"
        title={
          <>
            TTL kademesi +{" "}
            <span className="italic">devre kesici</span>.
          </>
        }
        intro="Gemini gibi dış servisler ne yavaşlatır, ne de düşürür: her sinyal tipi için ayrı TTL, retry/jitter, circuit breaker ve hedefli invalidation."
      />
      <Container>
        <div className="grid md:grid-cols-2 gap-8 lg:gap-10">
          <div>
            <div className="kicker mb-3">Cache katmanları</div>
            <div className="space-y-3">
              {cacheLayers.map((c, i) => {
                const Icon = c.Icon;
                return (
                  <motion.div
                    key={c.title}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={viewportOnce}
                    transition={{ delay: i * 0.06 }}
                    className="card-elevated p-4 md:p-5 flex items-center gap-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70">
                      <Icon className="h-4 w-4 text-cerulean" strokeWidth={1.7} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-[15px] font-normal text-ink leading-tight">
                        {c.title}
                      </div>
                      <div className="text-[12.5px] text-ink-muted mt-0.5">
                        {c.note}
                      </div>
                    </div>
                    <div className="font-mono text-[12px] text-cerulean tabular-nums shrink-0">
                      {c.ttl}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="kicker mb-3">Dayanıklılık desenleri</div>
            <div className="grid sm:grid-cols-2 gap-3">
              {resiliencePatterns.map((p, i) => {
                const Icon = p.Icon;
                return (
                  <motion.div
                    key={p.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={viewportOnce}
                    transition={{ delay: i * 0.06 }}
                    className="card-elevated p-4 md:p-5"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70 mb-3">
                      <Icon className="h-4 w-4 text-cerulean" strokeWidth={1.7} />
                    </div>
                    <div className="font-display text-[15px] font-normal text-ink mb-1.5 tracking-tight">
                      {p.title}
                    </div>
                    <div className="text-[12.5px] text-ink-soft leading-relaxed">
                      {p.desc}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Circuit breaker state machine mini */}
            <div className="mt-4 card-elevated p-5">
              <div className="kicker mb-3">Circuit breaker durumları</div>
              <CircuitBreakerStates />
            </div>
          </div>
        </div>
      </Container>

      {/* ── 07 · Veritabanı şeması ───────────────────────── */}
      <SectionHeader
        eyebrow="07 · Veritabanı"
        title={
          <>
            PostgreSQL şeması +{" "}
            <span className="italic">pgvector</span>.
          </>
        }
        intro="Mevcut: PriceObservation, UserBudgetRow. Planlı: analyses log tablosu, review_vectors (pgvector)."
      />
      <Container>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {dbTables.map((t, i) => {
            const Icon = t.Icon;
            return (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.06 }}
                className="card-elevated p-5"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <Icon className="h-4 w-4 text-cerulean shrink-0" strokeWidth={1.7} />
                  <div className="font-mono text-[13px] text-ink truncate">
                    {t.name}
                  </div>
                </div>
                <div className="text-[12px] text-ink-muted mb-3 leading-snug">
                  {t.desc}
                </div>
                <div className="rounded-md border border-line bg-bg-primary/40 divide-y divide-line/60">
                  {t.fields.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-3 px-3 py-1.5 text-[11.5px]"
                    >
                      <span className="font-mono text-ink truncate">{f.name}</span>
                      <span className="font-mono text-ink-muted shrink-0">
                        {f.type}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </Container>

      {/* ── 08 · Güvenlik ────────────────────────────────── */}
      <SectionHeader
        eyebrow="08 · Güvenlik"
        title={
          <>
            İzolasyon, doğrulama,{" "}
            <span className="italic">minimum veri</span>.
          </>
        }
        intro="Eklenti her sayfada çalışan en agresif yüzey; izolasyon ve sıkı doğrulama ön planda."
      />
      <Container>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {securityPoints.map((p, i) => {
            const Icon = p.Icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.05 }}
                className="card-elevated p-5 md:p-6"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70 mb-3">
                  <Icon className="h-4.5 w-4.5 text-cerulean" strokeWidth={1.7} />
                </div>
                <div className="font-display text-base font-medium text-ink mb-1.5 tracking-tight">
                  {p.title}
                </div>
                <div className="text-[12.5px] text-ink-soft leading-relaxed">
                  {p.desc}
                </div>
              </motion.div>
            );
          })}
        </div>
      </Container>

      {/* ── 09 · Dağıtım topolojisi ──────────────────────── */}
      <SectionHeader
        eyebrow="09 · Dağıtım"
        title={
          <>
            Docker Compose,{" "}
            <span className="italic">nginx önünde</span>.
          </>
        }
        intro="Üç container + host nginx; her servis 127.0.0.1'e bind olduğu için public yüzey sadece nginx'in açtığı kadar."
      />
      <Container>
        <DeploymentDiagram />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {deployment.map((d, i) => {
            const Icon = d.Icon;
            return (
              <motion.div
                key={d.name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.05 }}
                className="card-elevated p-4"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <Icon className="h-4 w-4 text-cerulean" strokeWidth={1.7} />
                  <div className="font-mono text-[12.5px] text-ink">{d.name}</div>
                </div>
                <div className="text-[12px] text-ink-soft leading-snug">
                  {d.desc}
                </div>
              </motion.div>
            );
          })}
        </div>
      </Container>

      {/* ── 10 · Teknoloji yığını ────────────────────────── */}
      <SectionHeader
        eyebrow="10 · Teknoloji yığını"
        title={
          <>
            Üç klasör,{" "}
            <span className="italic">paylaşılan tipler</span>.
          </>
        }
        intro="pnpm / Turbo gibi monorepo aracı yok — hackathon ölçeğinde ekstra yüzey alanı yaratmamak için."
      />
      <Container>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {stack.map((s, i) => {
            const Icon = s.Icon;
            return (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                className="card-elevated p-5 md:p-6"
              >
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70">
                    <Icon className="h-4 w-4 text-cerulean" strokeWidth={1.7} />
                  </div>
                  <div className="font-display text-base font-medium text-ink tracking-tight">
                    {s.title}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {s.items.map((it) => (
                    <li
                      key={it.name}
                      className="flex items-center justify-between gap-2 text-[12.5px]"
                    >
                      <span className="text-ink-soft truncate">{it.name}</span>
                      <span className="font-mono text-[11px] text-ink-muted tabular-nums">
                        {it.v}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </Container>

      {/* ── 11 · Mock vs gerçek ──────────────────────────── */}
      <SectionHeader
        eyebrow="11 · Mock vs gerçek"
        title={
          <>
            Demo ne yapıyor,{" "}
            <span className="italic">üretim ne yapacak</span>.
          </>
        }
        intro="Hackathon kapsamında deterministik mock'lar; üretim sprintinde her boyut canlı veri kaynağına bağlanıyor."
      />
      <Container>
        <div className="card-elevated overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-bg-tertiary/30">
                <th className="text-left px-5 py-3.5 text-[12px] kicker">Boyut</th>
                <th className="text-left px-5 py-3.5 text-[12px] kicker">
                  MVP (mock)
                </th>
                <th className="text-left px-5 py-3.5 text-[12px] kicker">
                  Üretim (planlanan)
                </th>
              </tr>
            </thead>
            <tbody>
              {mockVsReal.map((row, i) => (
                <motion.tr
                  key={row.dim}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={viewportOnce}
                  transition={{ delay: i * 0.04 }}
                  className="border-b border-line/60 last:border-b-0"
                >
                  <td className="px-5 py-3.5 text-[13px] text-ink font-medium">
                    {row.dim}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-ink-soft">
                    {row.mock}
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-ink-soft">
                    {row.real}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>

      {/* ── 12 · Prensipler ──────────────────────────────── */}
      <SectionHeader
        eyebrow="12 · Prensipler"
        title={
          <>
            Neden{" "}
            <span className="italic">böyle kurduk</span>.
          </>
        }
      />
      <Container>
        <div className="grid md:grid-cols-3 gap-4 md:gap-5">
          {principles.map((p, i) => {
            const Icon = p.Icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={viewportOnce}
                transition={{ delay: i * 0.06 }}
                className="card-elevated p-6 md:p-7"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70 mb-4">
                  <Icon className="h-4.5 w-4.5 text-cerulean" strokeWidth={1.7} />
                </div>
                <div className="font-display text-lg font-normal text-ink tracking-tight mb-2">
                  {p.title}
                </div>
                <p className="text-[13.5px] text-ink-soft leading-relaxed">
                  {p.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </Container>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────
   Section header
   ───────────────────────────────────────────────────────── */
function SectionHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: string;
}) {
  return (
    <section className="border-b border-line pt-16 pb-10 md:pt-20 md:pb-12">
      <Container>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={stagger}
          className="max-w-3xl"
        >
          <motion.div variants={fadeUp} className="kicker mb-3">
            {eyebrow}
          </motion.div>
          <motion.h2
            variants={fadeUp}
            className="font-display text-3xl md:text-4xl lg:text-5xl font-light leading-[1.08] tracking-tighter text-ink"
          >
            {title}
          </motion.h2>
          {intro && (
            <motion.p
              variants={fadeUp}
              className="mt-5 text-[15px] text-ink-soft leading-relaxed max-w-2xl"
            >
              {intro}
            </motion.p>
          )}
        </motion.div>
      </Container>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   Background grid (hero)
   ───────────────────────────────────────────────────────── */
function BackgroundGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 opacity-[0.55]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <pattern
            id="arch-grid"
            x="0"
            y="0"
            width="64"
            height="64"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 64 0 L 0 0 0 64"
              fill="none"
              stroke="rgba(0,50,73,0.07)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#arch-grid)" />
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Hero pulse diagram — animated mini system
   ───────────────────────────────────────────────────────── */
function HeroPulseDiagram() {
  const NODES: { x: number; y: number; label: string; Icon: LucideIcon }[] = [
    { x: 50, y: 70, label: "Landing", Icon: Globe },
    { x: 200, y: 70, label: "Extension", Icon: Puzzle },
    { x: 350, y: 70, label: "Backend", Icon: Server },
    { x: 200, y: 200, label: "5 Ajan", Icon: Layers },
    { x: 200, y: 320, label: "Karar", Icon: Scale },
  ];

  return (
    <div className="relative w-full aspect-[4/3.5] max-w-[440px] mx-auto">
      <svg
        viewBox="0 0 420 380"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        {/* Static connection paths */}
        <path
          d="M 50 70 L 200 70"
          stroke="rgba(0,126,167,0.28)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          fill="none"
        />
        <path
          d="M 200 70 L 350 70"
          stroke="rgba(0,126,167,0.28)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          fill="none"
        />
        <path
          d="M 350 70 C 350 140, 240 140, 200 200"
          stroke="rgba(0,126,167,0.28)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          fill="none"
        />
        <path
          d="M 200 200 L 200 320"
          stroke="rgba(0,126,167,0.28)"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          fill="none"
        />
        <path
          d="M 200 320 C 100 320, 50 200, 50 70"
          stroke="rgba(0,126,167,0.22)"
          strokeWidth="1.2"
          strokeDasharray="2 5"
          fill="none"
        />

        {/* Animated traveling packet (extension → backend → ajan → karar → landing loop) */}
        <motion.circle
          r="4"
          fill="#007ea7"
          animate={{
            offsetDistance: ["0%", "100%"],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            offsetPath:
              "path('M 50 70 L 200 70 L 350 70 C 350 140, 240 140, 200 200 L 200 320 C 100 320, 50 200, 50 70')",
            offsetRotate: "0deg",
          }}
        />
        <motion.circle
          r="3"
          fill="#80ced7"
          animate={{
            offsetDistance: ["0%", "100%"],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "linear",
            delay: 2,
          }}
          style={{
            offsetPath:
              "path('M 50 70 L 200 70 L 350 70 C 350 140, 240 140, 200 200 L 200 320 C 100 320, 50 200, 50 70')",
          }}
        />
      </svg>

      {NODES.map((n) => {
        const Icon = n.Icon;
        return (
          <div
            key={n.label}
            className="absolute"
            style={{
              left: `${(n.x / 420) * 100}%`,
              top: `${(n.y / 380) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(0,126,167,0)",
                  "0 0 0 6px rgba(0,126,167,0.18)",
                  "0 0 0 0 rgba(0,126,167,0)",
                ],
              }}
              transition={{
                duration: 2.6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-bg-secondary"
            >
              <Icon className="h-4.5 w-4.5 text-cerulean" strokeWidth={1.7} />
            </motion.div>
            <div className="mt-1 text-center text-[11px] font-medium text-ink-soft tracking-wide">
              {n.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   System (3 layer) diagram
   ───────────────────────────────────────────────────────── */
function SystemDiagram() {
  return (
    <div className="relative">
      <div className="grid md:grid-cols-3 gap-4 md:gap-6">
        {layers.map((layer, i) => {
          const Icon = layer.Icon;
          return (
            <motion.div
              key={layer.key}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={viewportOnce}
              transition={{ delay: i * 0.08, duration: 0.55 }}
              whileHover={{ y: -4 }}
              className="card-elevated p-6 md:p-7 relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <motion.div
                  animate={{
                    boxShadow: [
                      "0 0 0 0 rgba(0,126,167,0)",
                      "0 0 0 4px rgba(0,126,167,0.12)",
                      "0 0 0 0 rgba(0,126,167,0)",
                    ],
                  }}
                  transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    delay: i * 0.6,
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong bg-bg-primary/70"
                >
                  <Icon className="h-5 w-5 text-cerulean" strokeWidth={1.7} />
                </motion.div>
                <div className="min-w-0">
                  <div className="font-display text-xl font-medium text-ink tracking-tight">
                    {layer.title}
                  </div>
                  <div className="text-[12px] text-ink-muted">{layer.subtitle}</div>
                </div>
              </div>
              <p className="text-[13.5px] text-ink-soft leading-relaxed mb-4">
                {layer.desc}
              </p>
              <ul className="space-y-1.5">
                {layer.bullets.map((b) => (
                  <li key={b} className="text-[12.5px] text-ink-soft flex gap-2">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-cerulean/70 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>

              {i < layers.length - 1 && (
                <div className="hidden md:flex absolute top-1/2 -right-3.5 -translate-y-1/2 z-10">
                  <ArrowRight className="h-4 w-4 text-cerulean/70" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={viewportOnce}
        transition={{ delay: 0.3 }}
        className="mt-6 md:mt-8 rounded-xl border border-cerulean/30 bg-cerulean/[0.06] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5"
      >
        <div className="kicker text-cerulean">Paylaşılan sözleşme</div>
        <div className="font-mono text-[13px] text-ink-soft">
          shared/types/*.ts ↔ backend/app/models/schemas.py
        </div>
        <div className="sm:ml-auto text-[12px] text-ink-muted">
          AnalyzeRequest · AnalyzeResponse · DemoPayloads
        </div>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Flow timeline (vertical with animated rail)
   ───────────────────────────────────────────────────────── */
function FlowTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <div ref={ref} className="relative">
      <div className="absolute left-[18px] md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-px bg-line">
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: inView ? 1 : 0 }}
          transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ originY: 0 }}
          className="absolute inset-0 bg-cerulean/60"
        />
      </div>

      <ol className="space-y-5 md:space-y-7">
        {flowSteps.map((s, i) => (
          <motion.li
            key={s.step}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={viewportOnce}
            transition={{ delay: i * 0.06, duration: 0.5 }}
            className={cn(
              "relative md:grid md:grid-cols-2 md:gap-10 pl-12 md:pl-0",
              i % 2 === 1 && "md:[&>div:first-child]:col-start-2",
            )}
          >
            <div
              className={cn(
                "card-elevated p-5 md:p-6 relative",
                i % 2 === 1 ? "md:text-left" : "md:text-right",
              )}
            >
              <div
                className={cn(
                  "flex items-baseline gap-3 mb-2",
                  i % 2 === 1 ? "md:flex-row" : "md:flex-row-reverse md:justify-start",
                )}
              >
                <span className="font-mono text-[12px] text-cerulean tabular-nums">
                  {s.step}
                </span>
                <h3 className="font-display text-lg font-normal text-ink tracking-tight">
                  {s.title}
                </h3>
                <span className="ml-auto md:ml-0 text-[11px] text-ink-muted tabular-nums">
                  {s.timing}
                </span>
              </div>
              <p className="text-[13.5px] text-ink-soft leading-relaxed mb-3">
                {s.desc}
              </p>
              <div className="font-mono text-[11.5px] text-ink-soft bg-bg-tertiary/40 rounded px-3 py-2 border border-line whitespace-pre-wrap">
                {s.code}
              </div>
            </div>

            <span
              className="absolute left-[12px] md:left-1/2 top-7 md:-translate-x-1/2 flex h-3 w-3 items-center justify-center"
              aria-hidden
            >
              <motion.span
                animate={{ scale: [1, 1.6, 1], opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.2 }}
                className="absolute inset-0 rounded-full bg-cerulean/40"
              />
              <span className="relative h-2 w-2 rounded-full bg-cerulean" />
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Agent graph (LangGraph fan-out / fan-in)
   ───────────────────────────────────────────────────────── */
function AgentGraph() {
  return (
    <div className="card-elevated p-6 md:p-10">
      {/* Mobile stack */}
      <div className="lg:hidden space-y-3">
        <CenterPill label="POST /api/analyze-purchase" mono pulse />
        <ArrowDown />
        <CenterPill label="orchestrator.analyze" />
        <ArrowDown />
        <div className="grid grid-cols-2 gap-2">
          {agents.map((a) => {
            const Icon = a.Icon;
            return (
              <div
                key={a.key}
                className="rounded-lg border border-line bg-bg-secondary/80 px-3 py-3 flex items-center gap-2"
              >
                <Icon className="h-4 w-4 text-cerulean shrink-0" strokeWidth={1.7} />
                <div className="min-w-0">
                  <div className="text-[13px] text-ink font-medium leading-tight">
                    {a.label}
                  </div>
                  <div className="text-[10.5px] text-ink-muted tabular-nums">
                    {a.weight}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <ArrowDown />
        <div className="rounded-xl border border-line-strong bg-bg-tertiary px-5 py-5 text-center">
          <Scale className="h-5 w-5 text-deep-space-blue mx-auto mb-2" strokeWidth={1.7} />
          <div className="font-display text-lg font-medium text-ink tracking-tight">
            Karar Ajanı
          </div>
          <div className="text-[11px] text-ink-soft mt-1">
            Ağırlıklı toplam + eskalasyon
          </div>
        </div>
        <ArrowDown />
        <CenterPill label="AnalyzeResponse" mono />
      </div>

      {/* Desktop pipeline */}
      <div className="hidden lg:flex items-stretch gap-6">
        <div className="flex flex-col justify-center gap-2 w-[210px] shrink-0">
          <div className="rounded-md border border-cerulean/30 bg-cerulean/[0.08] px-3 py-2.5">
            <div className="kicker text-cerulean mb-1">Input</div>
            <div className="font-mono text-[12.5px] text-ink leading-tight">
              AnalyzeRequest
            </div>
            <div className="text-[11px] text-ink-muted mt-1">
              POST /api/analyze-purchase
            </div>
          </div>
        </div>

        <AnimatedConnectorOneToMany />

        <div className="flex flex-col gap-2.5 w-[240px] shrink-0 justify-center">
          {agents.map((a, i) => {
            const Icon = a.Icon;
            return (
              <motion.div
                key={a.key}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={viewportOnce}
                transition={{ delay: 0.1 + i * 0.07 }}
                className="rounded-xl border border-line bg-bg-secondary/80 px-3.5 py-3 flex items-center gap-3 shadow-line"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-bg-primary/70">
                  <Icon className="h-4 w-4 text-cerulean" strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[14.5px] font-normal leading-tight text-ink">
                    {a.label} Ajanı
                  </div>
                  <div className="text-[11px] text-ink-muted tabular-nums mt-0.5">
                    ağırlık {a.weight}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <AnimatedConnectorManyToOne />

        <div className="flex items-center w-[200px] shrink-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={viewportOnce}
            transition={{ delay: 0.5 }}
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(0,126,167,0)",
                "0 0 0 8px rgba(0,126,167,0.10)",
                "0 0 0 0 rgba(0,126,167,0)",
              ],
            }}
            style={{ transitionProperty: "box-shadow" }}
            className="w-full rounded-2xl border border-line-strong bg-bg-tertiary px-5 py-6 text-center"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-line-strong bg-bg-primary/70">
              <Scale className="h-5 w-5 text-deep-space-blue" strokeWidth={1.7} />
            </div>
            <div className="font-display text-lg font-medium leading-tight tracking-tight text-ink">
              Karar Ajanı
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-ink-soft">
              Ağırlıklı toplam + eskalasyon
            </div>
          </motion.div>
        </div>

        <AnimatedConnectorOneToOne />

        <div className="flex flex-col justify-center gap-2 w-[210px] shrink-0">
          <div className="rounded-md border border-line-strong bg-bg-primary/70 px-3 py-2.5">
            <div className="kicker mb-1">Output</div>
            <div className="font-mono text-[12.5px] text-ink leading-tight">
              AnalyzeResponse
            </div>
            <div className="text-[11px] text-ink-muted mt-1 leading-snug">
              decision · riskScore · summary · reasons · agents · action
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterPill({
  label,
  mono = false,
  pulse = false,
}: {
  label: string;
  mono?: boolean;
  pulse?: boolean;
}) {
  return (
    <motion.div
      animate={
        pulse
          ? {
              boxShadow: [
                "0 0 0 0 rgba(0,126,167,0)",
                "0 0 0 5px rgba(0,126,167,0.12)",
                "0 0 0 0 rgba(0,126,167,0)",
              ],
            }
          : undefined
      }
      transition={pulse ? { duration: 2.4, repeat: Infinity } : undefined}
      className="rounded-md border border-line-strong bg-bg-primary/70 px-4 py-2.5 text-center"
    >
      <span
        className={cn(
          "text-[13px] text-ink",
          mono && "font-mono text-[12px]",
        )}
      >
        {label}
      </span>
    </motion.div>
  );
}

function ArrowDown() {
  return (
    <div className="flex justify-center">
      <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
        <path
          d="M 7 2 L 7 14 M 2.5 11 L 7 16 L 11.5 11"
          stroke="#007ea7"
          strokeOpacity="0.5"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/* Animated connectors with traveling packets */
function AnimatedConnectorOneToMany() {
  const ys = [12, 36, 64, 88];
  return (
    <div className="w-[64px] shrink-0 self-stretch relative">
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
      >
        {ys.map((y, i) => (
          <motion.path
            key={y}
            d={`M 0 50 C 45 50, 55 ${y}, 100 ${y}`}
            stroke="#007ea7"
            strokeOpacity="0.32"
            strokeWidth="1.4"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={viewportOnce}
            transition={{ duration: 0.9, delay: 0.18 + i * 0.06 }}
          />
        ))}
        {ys.map((y, i) => (
          <motion.circle
            key={`p-${y}`}
            r="2"
            fill="#007ea7"
            animate={{
              offsetDistance: ["0%", "100%"],
            }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.4 + i * 0.18,
              repeatDelay: 1.6,
            }}
            style={{
              offsetPath: `path('M 0 50 C 45 50, 55 ${y}, 100 ${y}')`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function AnimatedConnectorManyToOne() {
  const ys = [12, 36, 64, 88];
  return (
    <div className="w-[64px] shrink-0 self-stretch relative">
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
      >
        {ys.map((y, i) => (
          <motion.path
            key={y}
            d={`M 0 ${y} C 45 ${y}, 55 50, 100 50`}
            stroke="#007ea7"
            strokeOpacity="0.32"
            strokeWidth="1.4"
            strokeDasharray="4 6"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={viewportOnce}
            transition={{ duration: 0.9, delay: 0.3 + i * 0.06 }}
          />
        ))}
        {ys.map((y, i) => (
          <motion.circle
            key={`p-${y}`}
            r="2"
            fill="#007ea7"
            animate={{
              offsetDistance: ["0%", "100%"],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1.8 + i * 0.15,
              repeatDelay: 2,
            }}
            style={{
              offsetPath: `path('M 0 ${y} C 45 ${y}, 55 50, 100 50')`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function AnimatedConnectorOneToOne() {
  return (
    <div className="w-[52px] shrink-0 self-stretch relative">
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
      >
        <motion.path
          d="M 0 50 L 100 50"
          stroke="#007ea7"
          strokeOpacity="0.42"
          strokeWidth="1.4"
          strokeDasharray="4 6"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={viewportOnce}
          transition={{ duration: 0.7, delay: 0.65 }}
        />
        <motion.circle
          r="2.5"
          fill="#007ea7"
          animate={{ offsetDistance: ["0%", "100%"] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 3.6,
            repeatDelay: 2.2,
          }}
          style={{ offsetPath: "path('M 0 50 L 100 50')" }}
        />
      </svg>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Weight bar (animated)
   ───────────────────────────────────────────────────────── */
function WeightBar({ value }: { value: number }) {
  return (
    <div className="relative h-1.5 w-full rounded-full bg-line/60 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${value}%` }}
        viewport={viewportOnce}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="h-full rounded-full bg-cerulean/70"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Worked example card with counter
   ───────────────────────────────────────────────────────── */
function WorkedExampleCard({
  ex,
  delay = 0,
}: {
  ex: {
    title: string;
    decision: "green" | "yellow" | "red";
    breakdown: { price: number; review: number; budget: number; impulse: number };
    risk: number;
    summary: string;
  };
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10%" });

  const tone =
    ex.decision === "green"
      ? "border-verdict-green/45 bg-verdict-green/10 text-verdict-green"
      : ex.decision === "yellow"
        ? "border-verdict-yellow/45 bg-verdict-yellow/10 text-verdict-yellow"
        : "border-verdict-red/45 bg-verdict-red/10 text-verdict-red";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewportOnce}
      transition={{ delay, duration: 0.55 }}
      className="card-elevated p-5 md:p-6"
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="font-display text-lg font-normal text-ink tracking-tight">
          {ex.title}
        </h4>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
            tone,
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              ex.decision === "green" && "bg-verdict-green",
              ex.decision === "yellow" && "bg-verdict-yellow",
              ex.decision === "red" && "bg-verdict-red",
            )}
          />
          risk <CountUp to={ex.risk} active={inView} />
        </span>
      </div>

      <p className="text-[12.5px] text-ink-soft leading-relaxed mb-4">
        {ex.summary}
      </p>

      <div className="space-y-2">
        {(["price", "review", "budget", "impulse"] as const).map((k, i) => {
          const labels: Record<string, string> = {
            price: "Fiyat",
            review: "Yorum",
            budget: "Bütçe",
            impulse: "Dürtü",
          };
          const w: Record<string, number> = {
            price: 30,
            review: 25,
            budget: 25,
            impulse: 20,
          };
          const v = ex.breakdown[k];
          return (
            <div key={k} className="flex items-center gap-3 text-[11.5px]">
              <span className="w-12 text-ink-muted">{labels[k]}</span>
              <div className="flex-1 h-1.5 rounded-full bg-line/60 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: inView ? `${v}%` : 0 }}
                  transition={{
                    duration: 1,
                    delay: 0.2 + i * 0.06,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={cn(
                    "h-full rounded-full",
                    ex.decision === "green" && "bg-verdict-green/70",
                    ex.decision === "yellow" && "bg-verdict-yellow/75",
                    ex.decision === "red" && "bg-verdict-red/70",
                  )}
                />
              </div>
              <span className="w-12 text-right font-mono text-ink-muted tabular-nums">
                <CountUp to={v} active={inView} />
                <span className="opacity-50">·{w[k]}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function CountUp({ to, active }: { to: number; active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1100;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(to * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, active]);
  return <>{n}</>;
}

/* ─────────────────────────────────────────────────────────
   Circuit breaker state machine
   ───────────────────────────────────────────────────────── */
function CircuitBreakerStates() {
  const states = [
    { key: "closed", label: "Closed", color: "bg-verdict-green", note: "Normal akış" },
    { key: "open", label: "Open", color: "bg-verdict-red", note: "3 ardışık hata" },
    { key: "half", label: "Half-open", color: "bg-verdict-yellow", note: "30s sonra deneme" },
  ];
  return (
    <div className="flex items-center gap-2">
      {states.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2 flex-1">
          <div className="flex-1 rounded-md border border-line bg-bg-primary/40 px-3 py-2 flex items-center gap-2">
            <motion.span
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
              className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.color)}
            />
            <div className="min-w-0">
              <div className="font-display text-[12.5px] text-ink leading-tight">
                {s.label}
              </div>
              <div className="text-[10.5px] text-ink-muted leading-snug truncate">
                {s.note}
              </div>
            </div>
          </div>
          {i < states.length - 1 && (
            <ArrowRight className="h-3.5 w-3.5 text-cerulean/60 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Deployment diagram (nginx + 3 containers)
   ───────────────────────────────────────────────────────── */
function DeploymentDiagram() {
  return (
    <div className="card-elevated p-6 md:p-9">
      <div className="grid lg:grid-cols-[1fr_auto_1.4fr] gap-6 lg:gap-10 items-center">
        {/* Public side */}
        <div className="space-y-3">
          <div className="kicker">Public</div>
          <div className="rounded-lg border border-line-strong bg-bg-primary/60 p-4 flex items-center gap-3">
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(0,126,167,0)",
                  "0 0 0 6px rgba(0,126,167,0.14)",
                  "0 0 0 0 rgba(0,126,167,0)",
                ],
              }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-line-strong bg-bg-secondary"
            >
              <Network className="h-4 w-4 text-cerulean" strokeWidth={1.7} />
            </motion.div>
            <div className="min-w-0">
              <div className="font-display text-[14.5px] text-ink">
                nginx (host)
              </div>
              <div className="text-[11px] text-ink-muted leading-snug">
                TLS · thundrly.com · api.thundrly.com
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex flex-col items-center text-cerulean/70">
          <motion.div
            animate={{ x: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          >
            <ArrowRight className="h-5 w-5" />
          </motion.div>
          <div className="font-mono text-[10.5px] mt-1 text-ink-muted">
            127.0.0.1
          </div>
        </div>

        {/* Compose network */}
        <div className="rounded-xl border border-cerulean/30 bg-cerulean/[0.05] p-4 md:p-5">
          <div className="kicker text-cerulean mb-3 flex items-center gap-2">
            <ContainerIcon className="h-3.5 w-3.5" />
            docker compose ağı
          </div>
          <div className="grid sm:grid-cols-3 gap-2.5">
            {[
              { Icon: Globe, name: "landing", port: "3000" },
              { Icon: Server, name: "backend", port: "8000" },
              { Icon: Database, name: "postgres", port: "5432" },
            ].map((c, i) => {
              const Icon = c.Icon;
              return (
                <motion.div
                  key={c.name}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={viewportOnce}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="rounded-md border border-line bg-bg-secondary/70 p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-3.5 w-3.5 text-cerulean" strokeWidth={1.7} />
                    <div className="font-mono text-[12px] text-ink leading-tight">
                      {c.name}
                    </div>
                  </div>
                  <div className="text-[10.5px] text-ink-muted font-mono">
                    :{c.port}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

