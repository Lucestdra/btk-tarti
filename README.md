# Thundrly

[![CI](https://github.com/Lucestdra/btk-thundrly/actions/workflows/ci.yml/badge.svg)](https://github.com/Lucestdra/btk-thundrly/actions/workflows/ci.yml)

**Satın almadan önce 5 saniyelik akıllı kontrol.**

Thundrly, "Sepete Ekle"ye basmadan önce yapay indirimleri, manipüle edilmiş
yorumları, bütçe aşımını ve dürtüsel alışveriş riskini tek ekranda yakalayan
Türkçe AI alışveriş asistanıdır. Chrome eklentisi olarak çalışır, FastAPI
backend'i üzerinde **LangGraph + Gemini 2.5 Flash** tabanlı 5 ajanlı bir
orkestrasyon koşar ve **yeşil / sarı / kırmızı** bir karar üretir.

- **Canlı**: <https://thundrly.com>
- **Mimari**: <https://thundrly.com/mimari>

---

## Repo Yapısı

```
Btk/
├── landing/      Next.js 15 (App Router) tanıtım sitesi · canlı demo · /mimari · /api/contact
├── extension/    Chrome eklentisi (Manifest V3) — buton yakalama + shadow-DOM panel
├── backend/      FastAPI · LangGraph · Gemini 2.5 Flash · PostgreSQL
├── shared/       AnalyzeRequest / AnalyzeResponse TS tipleri + demo payload'ları
├── docs/         Mimari, API kontratı, ürün vizyonu, güvenlik raporu
├── deploy/       Nginx config + sistemd birim örnekleri
└── docker-compose.yml   postgres + backend + landing (prod stack)
```

Her klasör bağımsız çalıştırılabilir. Monorepo aracı kullanılmıyor; `shared/`
TypeScript path alias ile tüketilir, backend Pydantic v2'de aynalanır.

---

## Mimari — Tek Bakışta

```
┌─ Landing (Next.js) ─┐    ┌─ Extension (MV3) ──┐    ┌─ Backend (FastAPI) ────┐
│  /             demo │    │  contentScript     │    │  /api/analyze-purchase │
│  /mimari       arch │    │  productExtractor  │───▶│  graph.py (LangGraph)  │
│  /#iletisim    form │    │  shadow-DOM panel  │    │   ├ review  (Gemini)   │
│  /api/contact  mail │    │  background.ts     │    │   ├ price   (PG hist.) │
└─────────────────────┘    └────────────────────┘    │   ├ budget  (PG limits)│
                                                     │   ├ impulse (heuristic)│
                                                     │   └ decision (Gemini)  │
                                                     └────────────────────────┘
```

Üç bileşen aynı sözleşme (`AnalyzeRequest` / `AnalyzeResponse`) etrafında konuşur.
Tam diyagram, veri akışı, karar mantığı, cache + dayanıklılık katmanları,
veritabanı şeması ve dağıtım topolojisi için: [**docs/architecture.md**](docs/architecture.md)
veya canlı sürüm: <https://thundrly.com/mimari>.

---

## Hızlı Başlangıç

### Tek komut (Docker Compose)

```bash
cp .env.example .env       # POSTGRES_PASSWORD, GEMINI_API_KEY/OPENROUTER_API_KEY, RESEND_API_KEY
docker compose up -d --build
```

→ landing `127.0.0.1:3000`, backend `127.0.0.1:8000`, postgres compose ağına izole.
Üretimde nginx host'ta TLS sonlandırır ve `thundrly.com` / `api.thundrly.com`
adreslerini bu portlara proxy'ler.

### Landing

```bash
cd landing
npm install
npm run dev          # http://localhost:3000
```

İletişim formunun gerçekten mail göndermesi için `landing/.env.local`:
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
# isteğe bağlı; varsayılanlar Resend onboarding + agdemirhalim4@gmail.com
MAIL_FROM=
CONTACT_TO=
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload     # http://localhost:8000  ·  Swagger /docs
pytest
```

LLM sağlayıcısı için iki seçenek (en az biri olmalı):
```env
OPENROUTER_API_KEY=sk-or-...                         # önerilen
OPENROUTER_MODEL=google/gemini-2.5-flash
# veya
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
```
İkisi de yoksa LLM ajanları heuristik fallback'e düşer; karar yine üretilir.

### Extension

```bash
cd extension
npm install
npm run build
```

Chrome'da `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş öğe yükle**
→ `extension/dist/`. Trendyol, Hepsiburada veya N11 ürün sayfasında "Sepete Ekle"
panel açar. Backend ulaşılamazsa [shared/demo](shared/demo) fallback fixture'ı
devreye girer ve eklenti yine çalışır.

---

## Üretim Durumu

| Bileşen | Durum | Detay |
|---|---|---|
| **Landing** | ✅ canlı | Next.js 15 standalone build · 10 bölüm + /mimari (11 bölüm) + /api/contact (Resend) |
| **Extension** | ✅ canlı | Manifest V3 · Shadow-DOM panel · capture-phase yakalama · platform seçici paketleri |
| **Backend orkestrasyon** | ✅ canlı | `services/graph.py` — LangGraph `StateGraph`, 4 paralel node + decision fan-in |
| **Review Agent** | ✅ canlı | Gemini 2.5 Flash + heuristik tekrar/burst/jenerik tespiti |
| **Price Agent** | ✅ canlı | 30/90 günlük geçmiş, fake-discount tespiti, Akakçe ikincil kaynak (opt-in) |
| **Budget Agent** | ✅ canlı | PostgreSQL `user_budgets` (PK: user_id, category) |
| **Impulse Agent** | ✅ canlı | Sayfa süresi, tıklama hızı, saat, günlük alım kural seti |
| **Decision Agent** | ✅ canlı | Ağırlıklı toplam + eskalasyon kuralı + Gemini narration |
| **PostgreSQL** | ✅ canlı | `price_observations`, `user_budgets` · Alembic migration |
| **Cache + resilience** | ✅ canlı | TTL+LRU, retry + circuit breaker, hedefli invalidation, admin purge |
| **İletişim formu** | ✅ canlı | Resend API + Zod doğrulama + honeypot + IP rate-limit |
| **pgvector / review embeddings** | ⏳ planlı | review_agent halen heuristik kümeleme; vektör DB sonraki sprint |
| **Yorum vektör DB** | ⏳ planlı | pgvector tablosu hazır, ingestion pipeline planda |

---

## Karar Mantığı

```
risk = 0.30·price + 0.25·review + 0.25·budget + 0.20·impulse
```

| Risk | Karar | Önerilen aksiyon |
|---|---|---|
| 0–39 | **yeşil** | Satın almaya devam et |
| 40–69 | **sarı** | Birkaç noktayı tekrar gözden geçir |
| 70–100 | **kırmızı** | 30 saniye düşün veya vazgeç |

**Eskalasyon kuralı** — Tek ajanın güçlü sinyali ağırlıklı toplamda
kaybolmasın diye:
- `single_max ≥ 80` → risk en az 70 (kırmızı zorunlu)
- `single_max ≥ 45` → risk en az 42 (sarı zorunlu)

---

## API Sözleşmesi

| Method | Path | Açıklama |
|---|---|---|
| `POST` | `/api/analyze-purchase` | Tam analiz; eklenti ana çağrısı. SSE upgrade desteklenir. |
| `POST` | `/api/price-observation` | Eklentinin sayfa yüklemelerinde fiyat ping'i. 60/dk/IP rate-limit. |
| `PUT`  | `/api/user-budgets` | Kullanıcı bütçesini günceller; ilgili cache anahtarları purge edilir. |
| `GET`  | `/api/user-budgets` | Bütçe + harcama özeti. |
| `GET`  | `/api/cache/stats` | Hit/miss telemetri (admin token guard). |
| `POST` | `/api/cache/purge` | Manuel cache temizleme (admin token guard). |
| `GET`  | `/api/health` · `/api/ready` | Liveness + readiness probe. |
| `GET`  | `/docs` | Swagger UI (üç kanonik payload örneği: red / yellow / green). |
| `POST` | `landing /api/contact` | İletişim formu → Resend → agdemirhalim4@gmail.com |

Şema: [backend/app/models/schemas.py](backend/app/models/schemas.py) (Pydantic v2).
TS tarafıyla aynalanır: [shared/types/analysis.ts](shared/types/analysis.ts).
Tam dokümantasyon: [docs/api-contract.md](docs/api-contract.md).

---

## Sözleşme Değişiklikleri

`AnalyzeRequest` / `AnalyzeResponse` değişirse **üç yer birden** güncellenmeli:

1. `shared/types/analysis.ts`
2. `backend/app/models/schemas.py`
3. `docs/api-contract.md`

Test güvenliği: `backend/tests/test_analyze.py` üç kanonik fixture'ın doğru
eşiğe düştüğünü doğrular; PR'ı kırmadan sözleşmeyi değiştiremezsin.

---

## Dağıtım

Üretim stack'i tek `docker-compose.yml` ile gelir:

- **nginx** (host) — TLS sonlandırma, `thundrly.com` → landing:3000, `api.thundrly.com` → backend:8000
- **thundrly-landing** — Next.js standalone, `127.0.0.1:3000` bind
- **thundrly-backend** — FastAPI + LangGraph, `127.0.0.1:8000` bind, `/api/ready` healthcheck
- **thundrly-postgres** — `postgres:16-alpine`, sadece compose ağında erişilebilir

Detay + güncelleme komutları: [docs/architecture.md](docs/architecture.md) ·
nginx örnek konfig: [deploy/](deploy/).

---

## Geliştirici Notları

- **Tek dil**: Tüm UI ve LLM çıktıları Türkçe. Tasarım gereği; çok dil hedef değil.
- **Shadow DOM izolasyonu**: Eklenti paneli host sayfa CSS'inden tamamen izole;
  hiçbir e-ticaret stilinden etkilenmez.
- **Cache TTL'leri**: review 300s, decision 900s, akakçe 1800s — `core/cache.py`
  içinde env override'lanır (`GEMINI_REVIEW_CACHE_TTL_SECONDS` vb.).
- **Circuit breaker**: 3 ardışık Gemini hatasında 30s devre açık; bu sürede
  ajanlar heuristik fallback verir, karar yine üretilir.
- **PII**: Yorumlar Gemini'a gönderilmeden önce kullanıcı adı vb. maskeleme
  listesinden geçer. Backend'e kişisel bilgi gönderilmez (anonim userId).

---

## Lisans

Lisans dosyası henüz eklenmedi. Ürün ekibi: <agdemirhalim4@gmail.com>
