# Production Google Drive Link Audit

Audit date: 2026-09-04 (Europe/Paris)
Mode: read-only. No database, link, Player, Google Auth, permission, commit, or push changes were made.

## Final counts

- TOTAL_VIDEO_LINKS: 186
- VALID_LINKS: 160
- STALE_BROKEN_LINKS: 2
- MISSING_LINKS: 24
- DUPLICATE_MATCHES: 8
- LINKS_SAFE_TO_REPLACE: 0
- EXACT_DUPLICATE_ALTERNATIVES_FOR_STILL_VALID_LINKS: 7
- UNIQUE_OLD_FILE_IDS_WITH_EXACT_ALTERNATIVE: 6
- LINKS_NEED_MANUAL_REVIEW: 26
- NULL_DRIVE_PART_ENTRIES: 7
- TOTAL_ACTIONABLE_ROWS: 33
- UNIQUE_FILE_IDS: 156
- UNIQUE_EXISTING_FILE_IDS: 132
- UNIQUE_MISSING_FILE_IDS: 24

Interpretation: TOTAL_VIDEO_LINKS counts non-null URLs only. The 7 null driveParts rows are listed separately and are not included in the 186 links.
DUPLICATE_MATCHES is the number of byte-identical MD5 groups. Seven Production URL occurrences (six unique old File IDs) have an exact unreferenced alternative, but all seven current old links still exist. LINKS_SAFE_TO_REPLACE therefore remains 0: no broken or missing link has an automatic safe replacement.

## Method

- Re-read Production immediately before generating this report.
- Extracted File IDs from all driveEmbedUrl and driveParts URLs; query suffixes such as usp were ignored.
- Checked each unique File ID through Google Drive API with supportsAllDrives=true.
- Enumerated 424 accessible Drive video files and compared MD5, size, duration, dimensions, and names.
- For the 24 missing Drive IDs, compared the preserved Production object-storage copies by MD5 and probed duration/dimensions. No trustworthy replacement was found.
- Duration-only candidates with unrelated names/topics were rejected.

## Explicitly stale/broken links

| VIDEO_ID | TITLE | SOURCE | OLD_FILE_ID | OLD_URL | RESULT |
|---:|---|---|---|---|---|
| 15 | فك حماية Google Account لهواتف Honor عبر السيرفر + Fastboot وقراءة IMEI | driveEmbedUrl | 1Qn5Nrfaq1-ZKRuNb-dGkzcTD3wJJIRpI | https://drive.google.com/file/d/1Qn5Nrfaq1-ZKRuNb-dGkzcTD3wJJIRpI/view?usp=drive_link | User-confirmed broken in iframe; Drive API metadata still exists |
| 15 | فك حماية Google Account لهواتف Honor عبر السيرفر + Fastboot وقراءة IMEI | driveParts / الجزء 1 | 1Qn5Nrfaq1-ZKRuNb-dGkzcTD3wJJIRpI | https://drive.google.com/file/d/1Qn5Nrfaq1-ZKRuNb-dGkzcTD3wJJIRpI/view?usp=drive_link | User-confirmed broken in iframe; Drive API metadata still exists |

The provided control file 1AZWBR9vxgSzVe4QdcEN_Ipo6oeA3R5NJ is not the same video as 1Qn5Nrfaq1-ZKRuNb-dGkzcTD3wJJIRpI: different filename, size, MD5, and duration (2542.566 s vs 441.466 s). It is not a replacement candidate.

## Exact alternative candidates found

These are 100% content matches by identical MD5 and size. They are not fixes for missing/broken links because each OLD_FILE_ID below still exists. No replacement was executed.

| VIDEO_ID | TITLE | SOURCE | OLD_FILE_ID | OLD_URL | NEW_FILE_ID | NEW_URL | MATCH_CONFIDENCE |
|---:|---|---|---|---|---|---|---|
| 10 | شرح تفليش هواتف Redmi و MediaTek باستخدام Unlock Tool + تصحيح IMEI وفتح البوتلودر | driveEmbedUrl | 1Tx8yWK0Fshsj-UUWNsQL2EjET1mqTQjK | https://drive.google.com/file/d/1Tx8yWK0Fshsj-UUWNsQL2EjET1mqTQjK/view?usp=drive_link | 1LZtPYHoRObQZtj-aByFbfZnoNByMjE38 | https://drive.google.com/file/d/1LZtPYHoRObQZtj-aByFbfZnoNByMjE38/view | 100% — byte-identical (same MD5 and size) |
| 21 | تفعيل برنامج Oxygen لإزالة كلمة المرور بدون فقدان البيانات / شرح احترافي | driveEmbedUrl | 1KKtXqm1EMAj4gYhXf95owKtDXNhx8Rkh | https://drive.google.com/file/d/1KKtXqm1EMAj4gYhXf95owKtDXNhx8Rkh/view?usp=drive_link | 1UT37sTC72TR1VspwMpRMfb1H_NYhdlZI | https://drive.google.com/file/d/1UT37sTC72TR1VspwMpRMfb1H_NYhdlZI/view | 100% — byte-identical (same MD5 and size) |
| 33 | قراءة معلومات أجهزة MacBook M1 / M2 / M3 / M4 / Get Info شرح كامل | driveEmbedUrl | 1hhls7j1AmYy6WX6wVOjDt_x2qPUnRDHA | https://drive.google.com/file/d/1hhls7j1AmYy6WX6wVOjDt_x2qPUnRDHA/view?usp=drive_link | 1xj1I56UZz-9AR2qN0P6-Q5Wg410FwWo8 | https://drive.google.com/file/d/1xj1I56UZz-9AR2qN0P6-Q5Wg410FwWo8/view | 100% — byte-identical (same MD5 and size) |
| 52 | ReBypass iPhone بعد Erase + تفعيل الجهاز باستخدام Tool / شرح كامل | driveEmbedUrl | 10juH8g8zE3SJaViKYqKxsVoFzOjP2hr- | https://drive.google.com/file/d/10juH8g8zE3SJaViKYqKxsVoFzOjP2hr-/view?usp=drive_link | 1ti2kmvAtBggLYzf1Q04KILkMr-ukk6Ra | https://drive.google.com/file/d/1ti2kmvAtBggLYzf1Q04KILkMr-ukk6Ra/view | 100% — byte-identical (same MD5 and size) |
| 52 | ReBypass iPhone بعد Erase + تفعيل الجهاز باستخدام Tool / شرح كامل | driveParts / الجزء 1 | 10juH8g8zE3SJaViKYqKxsVoFzOjP2hr- | https://drive.google.com/file/d/10juH8g8zE3SJaViKYqKxsVoFzOjP2hr-/view?usp=drive_link | 1ti2kmvAtBggLYzf1Q04KILkMr-ukk6Ra | https://drive.google.com/file/d/1ti2kmvAtBggLYzf1Q04KILkMr-ukk6Ra/view | 100% — byte-identical (same MD5 and size) |
| 58 | Bypass iPad Air 2 باستخدام GAB Tools / أرخص سعر في العالم (5DA فقط) | driveEmbedUrl | 1vYTbVohPEjPPhFLyv2PoXiOBD644Ef75 | https://drive.google.com/file/d/1vYTbVohPEjPPhFLyv2PoXiOBD644Ef75/view?usp=drive_link | 1e-EVQ-0y276Mwt-xPlFIanDuj8gGRAde | https://drive.google.com/file/d/1e-EVQ-0y276Mwt-xPlFIanDuj8gGRAde/view | 100% — byte-identical (same MD5 and size) |
| 101 | 1 مبتدأ | driveParts / تغيير كونيكتور | 1V-MVSSuciuxR7NMHUrjh3RxnHA5oacFv | https://drive.google.com/file/d/1V-MVSSuciuxR7NMHUrjh3RxnHA5oacFv/view?usp=drive_link | 1nouRZQkcJs58UVOsLSK5a9hPlEFafp2J | https://drive.google.com/file/d/1nouRZQkcJs58UVOsLSK5a9hPlEFafp2J/view | 100% — byte-identical (same MD5 and size) |

## Missing Drive files — manual review

| VIDEO_ID | TITLE | OLD_FILE_ID | OLD_URL | RESULT |
|---:|---|---|---|---|
| 69 | 2-المواقع لي نحتاجوهم | 1dy7lUOZ-sU5N18t2ksK91Ew64QpOwy_Z | https://drive.google.com/file/d/1dy7lUOZ-sU5N18t2ksK91Ew64QpOwy_Z/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 70 | 3-انشاء حساب paypal | 1KUi-La5ICjqpy-wkNQtv1xf0Kc39ytoi | https://drive.google.com/file/d/1KUi-La5ICjqpy-wkNQtv1xf0Kc39ytoi/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 71 | 4-ربط البطاقة مع paypal | 1nOL7PiaNTLZqWu0aI2ozpSwoK9uTx0-g | https://drive.google.com/file/d/1nOL7PiaNTLZqWu0aI2ozpSwoK9uTx0-g/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 72 | 5-خطوة إلزامية لازم ديرها | 1Go9nWpv6kww3ruiuitw1scfFsDR7Gjee | https://drive.google.com/file/d/1Go9nWpv6kww3ruiuitw1scfFsDR7Gjee/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 73 | 6-Netflix 30 days  | 1gCMuxbhHOzRspfQnqnfo7P-Gi-kIS_6R | https://drive.google.com/file/d/1gCMuxbhHOzRspfQnqnfo7P-Gi-kIS_6R/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 74 | 7-Final Orepation | 1jzSDNe7a6U0PsiVoowREgaJMOkkcpzZd | https://drive.google.com/file/d/1jzSDNe7a6U0PsiVoowREgaJMOkkcpzZd/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 75 | 8-ملاحظة مهمة | 1ihp4ltFLBpCNPKqdyOJou4YQdr6Kms_d | https://drive.google.com/file/d/1ihp4ltFLBpCNPKqdyOJou4YQdr6Kms_d/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 76 | 9-method 2 and final | 18iqTRrENqABLcLwmEFIR247kRTGIpNuD | https://drive.google.com/file/d/18iqTRrENqABLcLwmEFIR247kRTGIpNuD/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 77 | 1-مقدمة | 1d118TAZ01utXxeeMFo1armGysIMDdQBl | https://drive.google.com/file/d/1d118TAZ01utXxeeMFo1armGysIMDdQBl/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 78 | 2-واش نحتاجو باش نخدمو أول حساب | 1oC1Gtl4QcuCMOfO0RXawgqq-DKeLmoFs | https://drive.google.com/file/d/1oC1Gtl4QcuCMOfO0RXawgqq-DKeLmoFs/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 79 | 3-طريقة التحميل الصحيحة | 1pFoStDM5lFpUKboBe0LwL3BWYp0Qjj1P | https://drive.google.com/file/d/1pFoStDM5lFpUKboBe0LwL3BWYp0Qjj1P/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 80 | 4-الحصول على العرض offer | 1FXn8_xmCfb9YJiGjIFbdZek_vV3bS4qn | https://drive.google.com/file/d/1FXn8_xmCfb9YJiGjIFbdZek_vV3bS4qn/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 81 | 5-تفعيل الحساب | 1NhFNnPpTrcVHaOuWUiXbRCWieE8HS6qP | https://drive.google.com/file/d/1NhFNnPpTrcVHaOuWUiXbRCWieE8HS6qP/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 82 | 6-ملاحظة مهمة لازم ديرها | 1izrCI-SwEFtfxJEAz2_42lEppfXnoiIW | https://drive.google.com/file/d/1izrCI-SwEFtfxJEAz2_42lEppfXnoiIW/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 83 | 7-الخطوة الأخيرة قبل بيع الحساب | 1zU6-9rhxA9Hn0YCLc2JETIGL85fxyLff | https://drive.google.com/file/d/1zU6-9rhxA9Hn0YCLc2JETIGL85fxyLff/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 84 | 1الجزء الأول | 1p-IKEih9d6fyG19ydkcmEsfNd7S_-G62 | https://drive.google.com/file/d/1p-IKEih9d6fyG19ydkcmEsfNd7S_-G62/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 94 | 2- الجزء الثاني | 1SRbpF2oOnx6hfQG7HBfyDNz8XarKKXXS | https://drive.google.com/file/d/1SRbpF2oOnx6hfQG7HBfyDNz8XarKKXXS/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 95 | 3-الجزء الأخير | 18eNp0DPadOTEkT2nQJqTSI_YmJKvx5Y2 | https://drive.google.com/file/d/18eNp0DPadOTEkT2nQJqTSI_YmJKvx5Y2/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 96 | 4-ملاحظة مهمة | 1exirIozBxftX_QZemRQQeMlQf9tX9IbD | https://drive.google.com/file/d/1exirIozBxftX_QZemRQQeMlQf9tX9IbD/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 97 | 1-creat account + bin generate | 1Bt0SyjOlt3pXX5c9hpu4aYnYJVZ7YO3Q | https://drive.google.com/file/d/1Bt0SyjOlt3pXX5c9hpu4aYnYJVZ7YO3Q/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 98 | 2-Account Actived Done | 1qE936g6MO9McaJ9lxzxifDuqh0cfeBtP | https://drive.google.com/file/d/1qE936g6MO9McaJ9lxzxifDuqh0cfeBtP/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 99 | Full Method | 14fLruHcB3mWJ0CbR75Q87lsE3jLdT01g | https://drive.google.com/file/d/14fLruHcB3mWJ0CbR75Q87lsE3jLdT01g/view?usp=sharing | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 102 | Full Method in this Video | 1ZueweqAaPs1CEbSGLIXGTkO1ZJloiwhv | https://drive.google.com/file/d/1ZueweqAaPs1CEbSGLIXGTkO1ZJloiwhv/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |
| 103 | Full Method 4 month Adobe Creative Cloud Pro | 1DAVt7yxLruMwu39u_4QQqLDWyAXdjGfN | https://drive.google.com/file/d/1DAVt7yxLruMwu39u_4QQqLDWyAXdjGfN/view?usp=drive_link | MISSING_FILE; no trustworthy Drive replacement among 424 accessible video files |

## Null driveParts entries (not URLs)

| VIDEO_ID | TITLE | PART | RESULT |
|---:|---|---|---|
| 16 | شرح شامل لتفليش جميع أجهزة MediaTek (MTK) لكل المعالجات خطوة بخطوة | الجزء 6 | NO_URL_IN_DRIVE_PART |
| 20 | طريقة شحن البرامج وفك FRP لجميع أجهزة Xiaomi / شرح شامل لكل الموديلات | الجزء 5 | NO_URL_IN_DRIVE_PART |
| 22 | طريقة شحن حسابك عبر البريد المباشر على السيرفر / شرح خطوة بخطوة | الجزء 3 | NO_URL_IN_DRIVE_PART |
| 23 | تفليش أجهزة Qualcomm باستخدام Test Point / الدخول إلى EDL وشرح كامل | الجزء 4 | NO_URL_IN_DRIVE_PART |
| 26 | حذف FRP لأجهزة Huawei باستخدام Test Point / الدخول إلى وضع التفليش بسهولة | الجزء 4 | NO_URL_IN_DRIVE_PART |
| 27 | تفليش أجهزة Huawei باستخدام Sigma Box عبر Test Point / شرح احترافي | الجزء 4 | NO_URL_IN_DRIVE_PART |
| 46 | إزالة MDM من iPhone / التخلص من القيود وفتح الجهاز بالكامل | الجزء 3 | NO_URL_IN_DRIVE_PART |

## Duplicate byte-identical groups

### Group 1 — MD5 330159677617c6aed9892547306f71cf
- Production File ID 10juH8g8zE3SJaViKYqKxsVoFzOjP2hr- — part 1.mp4 — Video 52 driveEmbedUrl; Video 52 driveParts (الجزء 1)
- Unreferenced Drive alternative 1ti2kmvAtBggLYzf1Q04KILkMr-ukk6Ra — part 1.mp4 — https://drive.google.com/file/d/1ti2kmvAtBggLYzf1Q04KILkMr-ukk6Ra/view

### Group 2 — MD5 0ae3a86406008fc61b79362838a7119c
- Production File ID 1hhls7j1AmYy6WX6wVOjDt_x2qPUnRDHA — 2024-10-15 19-51-55.mkv — Video 33 driveEmbedUrl
- Unreferenced Drive alternative 1xj1I56UZz-9AR2qN0P6-Q5Wg410FwWo8 — 2024-10-15 19-51-55.mkv — https://drive.google.com/file/d/1xj1I56UZz-9AR2qN0P6-Q5Wg410FwWo8/view

### Group 3 — MD5 2815fbdc2b760168fb026229909e2f03
- Production File ID 1vYTbVohPEjPPhFLyv2PoXiOBD644Ef75 — 2025-04-17 13-33-52.mp4 — Video 58 driveEmbedUrl
- Unreferenced Drive alternative 1e-EVQ-0y276Mwt-xPlFIanDuj8gGRAde — 2025-04-17 13-33-52.mp4 — https://drive.google.com/file/d/1e-EVQ-0y276Mwt-xPlFIanDuj8gGRAde/view

### Group 4 — MD5 74eec4c2f8b7d7cf035f43d956355409
- Production File ID 1oAw3Xd9lDp5D4b933W20igHGoLDMxPup — PART 2 FRP .mp4 — Video 41 driveParts (الجزء 2)
- Production File ID 1je6kx5kZIuGfSTgaCYiLTxQnwUT5El2J — 2025-03-02 16-36-18.mp4 — Video 36 driveEmbedUrl

### Group 5 — MD5 17c7a0c41ea65ecf63b424d5bb613bb0
- Production File ID 1KKtXqm1EMAj4gYhXf95owKtDXNhx8Rkh — Activation Oxygen.mp4 — Video 21 driveEmbedUrl
- Unreferenced Drive alternative 1UT37sTC72TR1VspwMpRMfb1H_NYhdlZI — Activation Oxygen.mp4 — https://drive.google.com/file/d/1UT37sTC72TR1VspwMpRMfb1H_NYhdlZI/view

### Group 6 — MD5 f57c6195763dd5d0bf67786033a4904e
- Production File ID 1C1i0c0kuvAwm3Rx5ep5p3OgShD-9qeTu — PART 4.mp4 — Video 20 driveParts (الجزء 4)
- Production File ID 1JOOUhuiFPx4zFYbEFyhv-Tmz45fT38Qg — frp xiaomi.mp4 — Video 60 driveEmbedUrl

### Group 7 — MD5 97993dd85de303e04db531768e4a0057
- Production File ID 1V-MVSSuciuxR7NMHUrjh3RxnHA5oacFv — تغيير كونيكتور 3.mp4 — Video 101 driveParts (تغيير كونيكتور)
- Unreferenced Drive alternative 1nouRZQkcJs58UVOsLSK5a9hPlEFafp2J — تغيير كونيكتور 3.mp4 — https://drive.google.com/file/d/1nouRZQkcJs58UVOsLSK5a9hPlEFafp2J/view

### Group 8 — MD5 b86478a6222508fbd36d5d9a246aea3e
- Production File ID 1Tx8yWK0Fshsj-UUWNsQL2EjET1mqTQjK — part 1.mp4 — Video 10 driveEmbedUrl
- Unreferenced Drive alternative 1LZtPYHoRObQZtj-aByFbfZnoNByMjE38 — part 1.mp4 — https://drive.google.com/file/d/1LZtPYHoRObQZtj-aByFbfZnoNByMjE38/view

