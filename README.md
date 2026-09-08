# Warranty Tracker (IT Asset Warranty Manager)

IT ekipleri için cihaz garanti takip aracı. Cloudflare Workers + D1 üzerinde çalışır,
Dell ve HP için resmi üretici garanti API'lerine bağlanır (kendi API key'lerinizi
eklemeniz gerekir), CSV toplu içe aktarma destekler, ve garanti süresi dolmadan
e-posta/Slack bildirimi gönderir.

## Özellikler

- **Seri no ile ekleme**: Kullanıcı sadece seri numarasını girer, Dell/HP connector'ı
  satın alma ve garanti bitiş tarihini otomatik çeker (manuel ürün girişi yok).
- **CSV toplu import**: Mevcut envanter tablonuzu (manufacturer, serial_number, ...)
  tek seferde yükleyin.
- **Seri no / fatura no ile sorgulama**: Tek satırlık arama.
- **Dashboard**: Aktif / yakında bitecek / süresi dolmuş cihaz sayıları.
- **Günlük cron**: Garanti durumu günlük yeniden hesaplanır, 30 gün kala e-posta/Slack
  bildirimi gönderilir.
- **Çoklu tenant**: Her organizasyon (şirket) kendi kullanıcı ve cihazlarını görür.

## Klasör Yapısı

```
warranty-tracker/
  wrangler.toml       # Cloudflare Worker + D1 + cron config
  schema.sql           # D1 veritabanı şeması
  src/
    index.ts           # Ana Worker giriş noktası + cron handler
    types.ts
    connectors/
      dell.ts           # Dell TechDirect OAuth2 + warranty lookup
      hp.ts             # HP Warranty API OAuth2 + warranty lookup
      index.ts           # Connector registry + durum hesaplama
    routes/
      auth.ts            # Kayıt / giriş (JWT)
      devices.ts          # Cihaz CRUD + sorgu
      import.ts            # CSV toplu import
      dashboard.ts          # Özet istatistikler
      middleware.ts          # JWT auth middleware
    utils/
      auth.ts                # JWT + parola hashleme (Web Crypto, harici bağımlılık yok)
      csv.ts                   # CSV parse
      notify.ts                 # E-posta (Resend) + Slack bildirimleri
  public/               # Statik frontend (aynı Worker'dan servis edilir)
    index.html
    css/style.css
    js/app.js
```

## Kurulum

### 1. Gereksinimler
- Node.js 18+
- Cloudflare hesabı (ücretsiz plan yeterli, D1 + Workers dahil)
- `npm install -g wrangler` (veya `npx wrangler` kullanın)

### 2. Bağımlılıkları yükleyin
```bash
cd warranty-tracker
npm install
```

### 3. D1 veritabanı oluşturun
```bash
npx wrangler login
npx wrangler d1 create warranty-tracker-db
```
Komut çıktısındaki `database_id` değerini `wrangler.toml` içindeki
`REPLACE_WITH_YOUR_D1_DATABASE_ID` yerine yapıştırın.

### 4. Şemayı uygulayın
```bash
# Yerel geliştirme için:
npm run db:migrate:local

# Cloudflare'a deploy sonrası (uzak veritabanı) için:
npm run db:migrate:remote
```

### 5. Secret'ları ayarlayın
```bash
npx wrangler secret put JWT_SECRET
# rastgele uzun bir string girin, örn: openssl rand -hex 32

npx wrangler secret put DELL_CLIENT_ID
npx wrangler secret put DELL_CLIENT_SECRET
npx wrangler secret put HP_CLIENT_ID
npx wrangler secret put HP_CLIENT_SECRET

# Opsiyonel (bildirimler için):
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put SLACK_WEBHOOK_URL
```

Dell ve HP anahtarları hazır değilse sorun değil — connector'lar credentials
olmadan sadece o markanın otomatik sorgusunu atlar, cihaz yine de manuel
olarak eklenir/CSV ile içeri alınır.

### 6. Yerel geliştirme
```bash
npm run dev
```
`http://localhost:8787` adresinde hem API hem frontend (public/) çalışır.

### 7. Cloudflare'a deploy
```bash
npm run deploy
```

## Dell ve HP API Anahtarı Nasıl Alınır

**Dell TechDirect (Warranty API)**
1. https://techdirect.dell.com adresinden kurumsal Dell hesabınızla kayıt olun/giriş yapın.
2. Services > APIs > Manage API Keys > Request API Key.
3. "Warranty" API tipi seçin, başvuru formunu doldurun (günlük tahmini istek sayısı sorulacak).
4. Onay birkaç iş günü sürebilir. Onaylandıktan sonra Client ID / Client Secret'ı alırsınız.

**HP Warranty API**
1. https://developers.hp.com adresinden şirket e-postanızla kayıt olun.
2. HP hesap yöneticinizden (account manager) "HP Warranty API" / "HP Proactive Insights"
   tech grubuna erişim talep etmesi gerekiyor — bu adım genelde `warrantyapi.customers@hp.com`
   adresine e-posta ile başlatılır.
3. Erişim onaylandıktan sonra Developer Portal'da Client ID / Secret oluşturabilirsiniz.

Not: HP'nin süreci Dell'e göre daha bürokratik — bir HP hesap yöneticisi olmadan
erişim almak zor olabilir. MVP'de Dell ile başlayıp HP'yi paralel başvurarak
ilerletmeniz önerilir.

## Cesa / Proset ve Diğer Markalar

Bu iki firma için herkese açık bir garanti API'si bulunamadı. Şu an için bu
markalardaki cihazlar manuel/CSV import ile eklenebilir (garanti tarihi kullanıcı
tarafından girilir). İleride bu markalar için:
- Resmi bir B2B/bayi API'si varsa `src/connectors/` altına yeni bir dosya
  (örn. `cesa.ts`) eklenip `connectors/index.ts`'e kaydedilerek entegre edilebilir.
- Resmi API yoksa Cloudflare Browser Rendering API (headless browser) ile bir
  scraper connector'ı yazılabilir — bakım yükü daha yüksektir.

## API Uç Noktaları (özet)

| Method | Path | Açıklama |
|---|---|---|
| POST | `/api/auth/register` | Yeni organizasyon + admin kullanıcı |
| POST | `/api/auth/login` | Giriş, JWT döner |
| GET | `/api/devices` | Cihaz listesi (`?status=` filtre) |
| GET | `/api/devices/lookup?serial_number=` veya `?invoice_number=` | Tekil sorgu |
| POST | `/api/devices` | Cihaz ekle (seri no ile, otomatik garanti sorgusu) |
| POST | `/api/devices/:id/refresh` | Garanti bilgisini yeniden çek |
| DELETE | `/api/devices/:id` | Cihaz sil |
| POST | `/api/import/csv` | CSV toplu import (body: ham CSV metni) |
| GET | `/api/dashboard/summary` | Durum sayıları + yakında bitecekler |

## Notlar / Sonraki Adımlar

- Fatura fotoğrafından OCR ile veri çıkarımı (Claude API görsel input ile) henüz
  eklenmedi — `devices.ts`'e bir `/ocr` route'u eklenerek görsel yüklenip
  yapılandırılmış JSON'a çevrilebilir.
- Rol yönetimi (admin/viewer) şemada var ama route'larda henüz zorunlu kılınmıyor.
- Bildirim eşiği şu an sabit 30 gün — istenirse `notifications_log` ve
  `runDailyCheck` fonksiyonu üzerinden 7 gün gibi ikinci bir eşik kolayca eklenebilir.
