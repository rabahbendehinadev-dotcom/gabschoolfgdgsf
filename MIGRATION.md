# دليل الهجرة من Replit إلى VPS (Dokploy + Docker)

> **الهدف:** نقل التطبيق بالكامل إلى خادم VPS دون أي فقدان بيانات أو انقطاع في الخدمة.

---

## نظرة عامة على التغييرات المُجراة

تم تعديل الكودبيس لدعم بيئتين في نفس الوقت:

| المورد | Replit | VPS |
|--------|--------|-----|
| **Object Storage** | Replit GCS Sidecar (`STORAGE_PROVIDER=replit`) | أي S3-compatible: MinIO / AWS / R2 (`STORAGE_PROVIDER=s3`) |
| **Google Drive Auth** | Replit Connectors (`REPLIT_CONNECTORS_HOSTNAME`) | OAuth2 Refresh Token (`GOOGLE_DRIVE_REFRESH_TOKEN`) |
| **Frontend** | `@replit/vite-plugin-*` في dev فقط | Nginx يخدم static files |
| **قاعدة البيانات** | Replit PostgreSQL | External PostgreSQL (Dokploy أو managed) |

---

## المتطلبات

- VPS بـ Docker + Docker Compose v2
- Dokploy مثبّت (أو أي docker orchestrator)
- PostgreSQL خارجي (Supabase / Neon / RDS / قاعدة بيانات محلية)
- S3-compatible bucket (MinIO على نفس الـ VPS، أو AWS S3، أو Cloudflare R2)
- `pg_dump` على جهازك المحلي

---

## خطوات الهجرة — بالترتيب

### 1. تصدير قاعدة البيانات من Replit

```bash
# على Replit — من Shell
export DATABASE_URL="<Replit PostgreSQL URL>"
./scripts/backup-db.sh backups/pre-migration.dump.gz
```

نسخ الملف:
```bash
# من جهازك المحلي
scp replit-user@repl.co:/home/runner/workspace/backups/pre-migration.dump.gz ./
```

---

### 2. تصدير ملفات Object Storage من Replit

```bash
# على Replit — من Shell
./scripts/export-storage.sh ./storage-export
```

نسخ المجلد إلى الـ VPS:
```bash
rsync -avz --progress ./storage-export/ vps-user@your-vps:/app/storage-export/
```

---

### 3. إعداد S3-compatible Storage على الـ VPS

#### خيار A: MinIO (مستضاف على الـ VPS)

```bash
# تثبيت MinIO عبر Docker
docker run -d \
  --name minio \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /data/minio:/data \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=STRONG_PASSWORD \
  minio/minio server /data --console-address ":9001"

# إنشاء bucket
docker exec minio mc alias set local http://localhost:9000 admin STRONG_PASSWORD
docker exec minio mc mb local/gabschool
```

#### خيار B: Cloudflare R2 (مجاني حتى 10 GB)

من Cloudflare Dashboard → R2 → Create Bucket → اضبط الـ S3 API credentials.

#### خيار C: AWS S3

أنشئ bucket وـ IAM user مع صلاحيات `s3:*` على الـ bucket.

---

### 4. استيراد الملفات إلى S3

```bash
# على الـ VPS
export S3_BUCKET=gabschool
export S3_ENDPOINT=http://localhost:9000   # للـ MinIO
export S3_ACCESS_KEY_ID=admin
export S3_SECRET_ACCESS_KEY=STRONG_PASSWORD

./scripts/import-storage-s3.sh /app/storage-export
```

---

### 5. إعداد PostgreSQL

إذا استخدمت Dokploy، أنشئ قاعدة بيانات PostgreSQL من الـ Dashboard.
وإلا:
```bash
psql -c "CREATE DATABASE gabschool;"
psql -c "CREATE USER gabuser WITH PASSWORD 'STRONG_PASSWORD';"
psql -c "GRANT ALL ON DATABASE gabschool TO gabuser;"
```

استعادة البيانات:
```bash
export DATABASE_URL="postgresql://gabuser:STRONG_PASSWORD@localhost:5432/gabschool"
./scripts/restore-db.sh backups/pre-migration.dump.gz
```

---

### 6. تجهيز ملف `.env`

```bash
cp .env.example .env
```

عدّل `.env` بالقيم الصحيحة:
```env
DATABASE_URL=postgresql://gabuser:STRONG_PASSWORD@your-db-host:5432/gabschool
JWT_SECRET=<openssl rand -hex 64>
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret

STORAGE_PROVIDER=s3
S3_BUCKET=gabschool
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=admin
S3_SECRET_ACCESS_KEY=STRONG_PASSWORD
S3_ENDPOINT=http://minio:9000   # إذا استخدمت MinIO داخل Docker network

PRIVATE_OBJECT_DIR=gabschool/private
PUBLIC_OBJECT_SEARCH_PATHS=gabschool/public

VAPID_PUBLIC_KEY=<your VAPID public key>
VAPID_PRIVATE_KEY=<your VAPID private key>
VAPID_SUBJECT=mailto:you@yourdomain.com
```

---

### 7. البناء والتشغيل

```bash
# بناء الـ Docker image
docker compose build

# تشغيل الخدمات
docker compose up -d

# مراقبة اللوغز
docker compose logs -f api
```

---

### 8. إعداد Google Drive للـ VPS (اختياري)

> **ملاحظة:** إذا انتهت هجرة جميع الفيديوهات من Drive إلى Object Storage، تخطَّ هذه الخطوة.

احصل على Refresh Token:

1. من Google Cloud Console → OAuth 2.0 Credentials → أضف `http://localhost` كـ Authorized redirect URI مؤقتاً
2. شغّل:
```bash
npx tsx scripts/get-drive-refresh-token.ts
```
3. انتبه: يجب أن يُفعَّل Drive API في Google Cloud Console

ثم أضف إلى `.env`:
```env
GOOGLE_DRIVE_REFRESH_TOKEN=1//your-token
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

---

## ربط Dokploy بـ GitHub

في Dokploy Dashboard:
1. **Services** → **Create Application**
2. اختر **Docker Compose** → أشر إلى `docker-compose.yml`
3. أضف جميع الـ environment variables من `.env`
4. فعّل **Auto Deploy** على الـ main branch

---

## التحقق بعد الهجرة

```bash
# التحقق من صحة الـ API
curl https://yourdomain.com/api/health

# التحقق من قاعدة البيانات
curl https://yourdomain.com/api/categories

# تسجيل دخول المدير وفحص لوحة التحكم
# https://yourdomain.com/admin
```

---

## إيقاف Replit (بعد التحقق)

بعد التحقق من عمل كل شيء على الـ VPS:
1. وقف workflows على Replit
2. احتفظ بالـ Replit كـ backup لمدة أسبوع على الأقل
3. احذف أو أوقف الـ Replit Deployment

---

## ملاحظات مهمة

### حول هجرة الفيديوهات إلى S3

الفيديوهات المخزنة في Object Storage (`objectParts` في قاعدة البيانات) ستُنسخ تلقائياً ضمن ملفات الـ storage export. بعد الاستيراد إلى S3، تعمل مباشرة.

الفيديوهات التي لم تُهاجَر بعد (تلك التي لا تزال على Drive — `objectParts IS NULL`) ستستمر في العمل عبر Drive proxy إذا أعددت `GOOGLE_DRIVE_REFRESH_TOKEN`.

### حول `PRIVATE_OBJECT_DIR` و `PUBLIC_OBJECT_SEARCH_PATHS`

في Replit كانت قيمتها مسارات GCS مثل `gs://bucket/private`.
في S3 mode، استخدم الصيغة `bucket-name/prefix`:
```env
PRIVATE_OBJECT_DIR=gabschool/private
PUBLIC_OBJECT_SEARCH_PATHS=gabschool/public
```

### HLS Transcoding على الـ VPS

لتشغيل HLS transcode على الـ VPS، يحتاج الـ container إلى `ffmpeg`:
```dockerfile
# أضف هذا إلى الـ Dockerfile إذا أردت التحويل على الـ VPS
RUN apk add --no-cache ffmpeg
```

ثم شغّل:
```bash
docker compose exec api npx tsx scripts/transcode-hls.ts --all
```
