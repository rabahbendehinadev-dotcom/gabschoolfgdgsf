import {
  useState, useEffect, useRef, useCallback, useMemo, type CSSProperties,
} from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings,
  PictureInPicture2, RotateCcw, RotateCw, Loader2, ShieldAlert, ShieldCheck,
  AlertTriangle, X, Sun, Check,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type HlsType from "hls.js";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════════════
   CourseVideoPlayer — مشغّل فيديو احترافي (بمستوى YouTube / Netflix)
   - يشغّل الفيديو داخل المنصة فقط عبر عنصر <video> أصلي (لا Google Drive، لا iframe).
   - شاشة كاملة داخل الصفحة، Picture-in-Picture، دوران تلقائي، إيماءات لمس.
   - علامة مائية + تحذيرات أمان + تسجيل المخالفات (نفس حماية المشغّل السابق).
   ════════════════════════════════════════════════════════════════════════ */

const SECURITY_WARNING_TEXT =
  "هذا المحتوى محمي ومخصص لحسابك فقط. أي محاولة تصوير أو مشاركة قد تؤدي إلى إيقاف حسابك.";

/* ── علامة مائية بمواقع عشوائية: يصعب قصّها أو تغطيتها لأنها لا تثبت في مكان ──
   المواقع تُولَّد عشوائياً ضمن حدود آمنة (لا تغطي أزرار التحكم أعلى/أسفل الشاشة). */
interface WmPos { top: number; left: number; rot: number }
function randWmPos(): WmPos {
  return {
    top: 8 + Math.random() * 64,   // 8% .. 72%
    left: 4 + Math.random() * 56,  // 4% .. 60%
    rot: -18 + Math.random() * 26, // -18deg .. +8deg
  };
}
/* موقع ثانٍ بعيد عن الأول (مسافة لا تقل عن ~25% قطرياً) */
function randWmPosAway(other: WmPos): WmPos {
  for (let i = 0; i < 8; i++) {
    const p = randWmPos();
    const d = Math.hypot(p.top - other.top, p.left - other.left);
    if (d > 25) return p;
  }
  return randWmPos();
}
const WM_INTERVAL_MS = 5000;

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/* تفضيل الجودة المحفوظ: "low" (720p الافتراضية) أو "original" */
const QUALITY_PREF_KEY = "gab-video-quality";

type Warning = "first" | "second" | "blocked" | null;
type Fit = "cover" | "contain";

interface CourseVideoPlayerProps {
  /** رابط بثّ آمن من خادم المنصة (mp4) — ليس رابط Google Drive. */
  src: string;
  /** رابط قائمة HLS الرئيسية (بثّ تكيّفي) — إن توفّر يُفضَّل على mp4، مع بقاء mp4 احتياطاً. */
  hlsSrc?: string | null;
  /** رابط نسخة 720p الأخف (نسخة Drive منسوخة) — إن توفّرت تُشغَّل افتراضياً مع زر للجودة الأصلية. */
  lowSrc?: string | null;
  poster?: string | null;
  title?: string;
  /** معرّف الدرس — لحفظ موضع المشاهدة وتسجيل المخالفات. */
  videoId?: number;
  username?: string;
  email?: string;
  /** معرّف المستخدم — يظهر في العلامة المائية لتتبّع مصدر أي تسريب. */
  userId?: number;
  onViolation?: (count: number) => void;
  /** عند النقر على "إعادة المحاولة" — يُستخدم لتجديد رابط البثّ من الخادم */
  onRetry?: () => string | undefined | Promise<string | undefined>;
}

const HLS_MIME = "application/vnd.apple.mpegurl";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ── الحصول على نهاية نطاق البفر المتصل بالموضع الحالي ── */
function maxBufferedEnd(v: HTMLVideoElement): number {
  const b = v.buffered;
  const t = v.currentTime;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= t + 0.5 && b.end(i) > t) return b.end(i);
  }
  return t;
}

function qualityLabel(height: number): string {
  if (!height) return "تلقائي";
  if (height >= 2000) return "4K";
  if (height >= 1400) return "1440p";
  if (height >= 1000) return "1080p";
  if (height >= 700) return "720p";
  if (height >= 460) return "480p";
  if (height >= 340) return "360p";
  return `${height}p`;
}

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
type PipVideo = HTMLVideoElement & {
  webkitSetPresentationMode?: (mode: string) => void;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
};

export function CourseVideoPlayer({
  src, hlsSrc, lowSrc, poster, title, videoId, username, email, userId, onViolation, onRetry,
}: CourseVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  /* ── HLS: تفضيل البثّ التكيّفي إن توفّر، مع الرجوع التلقائي إلى mp4 عند أي فشل ── */
  const [hlsFailed, setHlsFailed] = useState(false);
  const useHls = !!hlsSrc && !hlsFailed;
  const usingHlsRef = useRef(false); // يقرأه مستمع onError للتمييز بين فشل HLS وفشل mp4
  usingHlsRef.current = useHls;
  /* ── جودة 720p: نسخة Drive أخف يبنيها السيرفر في الخلفية ──
     عند توفّرها تكون الافتراضية (أسرع تحميلاً وأقل تقطيعاً)، مع زر في
     الإعدادات للرجوع إلى الجودة الأصلية. التفضيل محفوظ في localStorage. */
  const [preferLow, setPreferLow] = useState<boolean>(() => {
    try { return localStorage.getItem(QUALITY_PREF_KEY) !== "original"; } catch { return true; }
  });
  const usingLow = !!lowSrc && preferLow;
  const activeSrc = usingLow ? (lowSrc as string) : src;
  /* مفاتيح مستقرة بدون token/توقيع: إعادة جلب /videos/:id (مثلاً عند العودة إلى
     التبويب) تمنح روابط جديدة لنفس الفيديو — يجب ألا تفكّك التشغيل الجاري.
     لاحقة "#low" تميّز نسخة 720p لأن المسار نفسه (يتغيّر ?q=low فقط). */
  const hlsKey = hlsSrc ? hlsSrc.split("?")[0] : null;
  const srcKey = (activeSrc ? activeSrc.split("?")[0] : "") + (usingLow ? "#low" : "");
  const hlsSrcRef = useRef<string | null>(hlsSrc ?? null);
  hlsSrcRef.current = hlsSrc ?? null;
  const srcRef = useRef(activeSrc);
  srcRef.current = activeSrc;
  /* عند تبديل الجودة: نحفظ الموضع والحالة لنستأنف من نفس النقطة بعد إعادة الربط */
  const resumeAfterQualityRef = useRef<{ time: number; wasPlaying: boolean } | null>(null);

  /* currentTokenRef: يحتفظ بآخر token صالح للـ HLS ويُحدَّث كل ~90 دقيقة.
     xhrSetup يستبدل token القديم في كل URL بالقيمة المحدَّثة لحظياً، بدون
     إعادة تحميل المصدر — يتيح ذلك التشغيل المستمر حتى بعد انتهاء التوكن الأصلي. */
  const extractToken = (url: string | null | undefined): string => {
    if (!url) return "";
    try { return new URL(url, window.location.origin).searchParams.get("token") ?? ""; }
    catch { return ""; }
  };
  const currentTokenRef = useRef<string>(extractToken(hlsSrc));
  // المصدر الفعّال — يُدار عبر useEffect (وليس خاصية src في JSX) لأن hls.js يربط MediaSource بنفسه
  const effectiveKey = useHls ? (hlsKey as string) : srcKey;

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [seeking, setSeeking] = useState(false);
  const [seekSpinner, setSeekSpinner] = useState(false);
  const seekSpinnerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [started, setStarted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState<Array<{ start: number; end: number }>>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fit, setFit] = useState<Fit>("contain");
  const [quality, setQuality] = useState("تلقائي");
  const [speed, setSpeed] = useState(1);

  /* ── HLS: مرجع للمثيل لاختيار الجودة يدوياً خارج الـ useEffect ── */
  const hlsRef = useRef<HlsType | null>(null);
  const [hlsLevels, setHlsLevels] = useState<Array<{ height: number; label: string; index: number }>>([]);
  const [manualLevel, setManualLevel] = useState(-1); // -1 = ABR تلقائي
  const manualLevelRef = useRef(-1); // ref لتجنّب الـ stale closure داخل hls events

  /* سطح المكتب = pointer دقيق (ماوس/touchpad). الهاتف = pointer خشن (إصبع). */
  const isDesktop = useMemo(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  , []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theater, setTheater] = useState(false); // بديل ملء الشاشة داخل الصفحة عند عدم دعم Fullscreen
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [brightness, setBrightness] = useState(1); // 1 = full, ↓ dims overlay
  const [pipSupported, setPipSupported] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [errorCode, setErrorCode] = useState<number | null>(null);

  // إيماءات: مؤشّر مؤقت يظهر عند التقديم/الترجيع/الصوت/الإضاءة
  const [gesture, setGesture] = useState<{ kind: "seek" | "vol" | "bright"; text: string; side?: "l" | "r" } | null>(null);

  const [wmMain, setWmMain] = useState<WmPos>(() => randWmPos());
  const [wmSub, setWmSub] = useState<WmPos>(() => randWmPos());
  const [wmTick, setWmTick] = useState(0);
  const [warning, setWarning] = useState<Warning>(null);
  const [videoDisabled, setVideoDisabled] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const violationsRef = useRef(0);
  const reportedRef = useRef<Set<string>>(new Set());
  const lastPlaybackMetricRef = useRef(0);
  const stallStartedRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ t: number; x: number } | null>(null);
  const wmName = username || "مستخدم محمي";
  const wmIdLabel = userId ? `ID: ${userId}` : null;

  /* ── دوران العلامة المائية: موقع عشوائي جديد كل عدة ثوانٍ (يصعب توقّعه أو قصّه) ── */
  useEffect(() => {
    const id = setInterval(() => {
      const main = randWmPos();
      setWmMain(main);
      setWmSub(randWmPosAway(main));
      setWmTick(t => t + 1);
    }, WM_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  /* ── كشف دعم Picture-in-Picture ── */
  useEffect(() => {
    const v = videoRef.current as PipVideo | null;
    const supported =
      (typeof document !== "undefined" && "pictureInPictureEnabled" in document &&
        document.pictureInPictureEnabled) ||
      Boolean(v?.webkitSupportsPresentationMode?.("picture-in-picture"));
    setPipSupported(Boolean(supported));
  }, []);

  /* ── تسجيل حدث أمني (مرة واحدة لكل نوع) ── */
  const reportSecurity = useCallback(async (eventType: string, details?: string) => {
    if (!videoId || reportedRef.current.has(eventType)) return;
    reportedRef.current.add(eventType);
    try {
      await fetch(`/api/videos/${videoId}/security-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ eventType, details }),
      });
    } catch { /* الحماية يجب ألا تكسر التشغيل */ }
  }, [videoId]);

  const reportPlaybackMetric = useCallback((
    event: "waiting" | "stalled" | "recovered",
    stallMs?: number,
  ) => {
    const v = videoRef.current;
    if (!videoId || !v) return;
    const now = Date.now();
    if (event !== "recovered" && now - lastPlaybackMetricRef.current < 15_000) return;
    lastPlaybackMetricRef.current = now;
    const connection = (navigator as Navigator & {
      connection?: { downlink?: number };
    }).connection;
    void fetch(`/api/videos/${videoId}/playback-metric`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        event,
        currentTime: v.currentTime,
        bufferAhead: Math.max(0, maxBufferedEnd(v) - v.currentTime),
        readyState: v.readyState,
        networkState: v.networkState,
        paused: v.paused,
        stallMs,
        downlinkMbps: connection?.downlink,
      }),
    }).catch(() => {});
  }, [videoId]);

  const logViolation = useCallback(async (count: number) => {
    try {
      if (videoId) {
        await fetch(`/api/videos/${videoId}/violation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ count }),
        });
      }
    } catch { /* silent */ }
    onViolation?.(count);
  }, [videoId, onViolation]);

  const handleSuspicious = useCallback(() => {
    if (videoDisabled) return;
    violationsRef.current += 1;
    const c = violationsRef.current;
    if (c === 1) setWarning("first");
    else if (c === 2) { setWarning("second"); logViolation(c); }
    else { setWarning("blocked"); setVideoDisabled(true); logViolation(c); videoRef.current?.pause(); }
  }, [logViolation, videoDisabled]);

  /* ── إظهار/إخفاء التحكم تلقائياً ── */
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !settingsOpen) setControlsVisible(false);
    }, 3200);
  }, [settingsOpen]);

  const flashGesture = useCallback((g: NonNullable<typeof gesture>) => {
    setGesture(g);
    if (gestureTimer.current) clearTimeout(gestureTimer.current);
    gestureTimer.current = setTimeout(() => setGesture(null), 650);
  }, []);

  /* ── أزرار التشغيل ── */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || videoDisabled) return;
    if (v.paused) v.play().catch(() => { /* تجاهل رفض autoplay */ });
    else v.pause();
    showControls();
  }, [videoDisabled, showControls]);

  /* اسمح دائماً بالـseek: إذا لم تكن النقطة محمّلة يصدر عنصر video طلب Range
     جديداً فوراً. منع القفز خارج البفر كان يؤخر الوصول ويمنع الاستفادة من Range. */
  const seekTo = useCallback((time: number, _fromUser = false) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const clamped = Math.min(Math.max(0, time), v.duration);
    v.currentTime = clamped;
    setCurrent(clamped);
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const target = Math.min(Math.max(0, v.currentTime + delta), v.duration);
    seekTo(target, true);
    flashGesture({ kind: "seek", text: `${delta > 0 ? "+" : ""}${Math.round(delta)} ث`, side: delta > 0 ? "r" : "l" });
    showControls();
  }, [seekTo, flashGesture, showControls]);

  const setVol = useCallback((val: number) => {
    const v = videoRef.current;
    const nv = Math.min(1, Math.max(0, val));
    setVolume(nv);
    setMuted(nv === 0);
    if (v) { v.volume = nv; v.muted = nv === 0; }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const nm = !v.muted;
    v.muted = nm;
    setMuted(nm);
    if (!nm && v.volume === 0) { v.volume = 0.5; setVolume(0.5); }
  }, []);

  const changeSpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s);
  }, []);

  /* ── اختيار جودة HLS يدوياً (أو إعادة ABR التلقائي بـ level = -1) ── */
  const setHlsLevel = useCallback((level: number) => {
    manualLevelRef.current = level;
    setManualLevel(level);
    const h = hlsRef.current;
    if (h) {
      h.currentLevel = level; // -1 يعيد تفعيل ABR؛ 0..n يثبّت مستوى محدد
    }
    if (level === -1) {
      setQuality("تلقائي");
    } else {
      const lev = hlsRef.current?.levels?.[level] as { height?: number } | undefined;
      if (lev?.height) setQuality(qualityLabel(lev.height));
    }
    setSettingsOpen(false);
  }, []);

  /* ── تبديل جودة mp4 (نسخة 720p ↔ الأصلية) مع الاستئناف من نفس الموضع ── */
  const setLowQuality = useCallback((low: boolean) => {
    try { localStorage.setItem(QUALITY_PREF_KEY, low ? "low" : "original"); } catch { /* */ }
    const v = videoRef.current;
    if (v && Number.isFinite(v.currentTime)) {
      resumeAfterQualityRef.current = { time: v.currentTime, wasPlaying: !v.paused };
    }
    setPreferLow(low);
    setSettingsOpen(false);
  }, []);

  /* ── شاشة كاملة: حاوية (سطح المكتب + Android) ← فيديو أصلي (iPhone) ← وضع المسرح ──
     iPhone Safari لا يدعم requestFullscreen للعناصر العادية (DIV)؛ لذلك نجرّب ملء
     شاشة الحاوية أولاً (يحافظ على العلامة المائية والتحكم)، فإن لم تتوفّر ننتقل إلى
     ملء شاشة الفيديو الأصلي webkitEnterFullscreen، وأخيراً وضع المسرح داخل الصفحة. */
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current as FsEl | null;
    const doc = document as FsDoc;
    if (!el) return;

    // وضع المسرح مفعّل → الزر يخرج منه
    if (theater) { setTheater(false); return; }

    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (active) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      try { await exit?.call(doc); } catch { /* */ }
      try { (screen as Screen & { orientation?: { unlock?: () => void } }).orientation?.unlock?.(); } catch { /* */ }
      return;
    }

    // 1) ملء شاشة الحاوية (سطح المكتب + Android Chrome)
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (typeof req === "function") {
      try {
        await req.call(el);
        const orientation = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
        try { await orientation?.lock?.("landscape"); } catch { /* غير مدعوم على الكمبيوتر */ }
        return;
      } catch { /* iPhone لا يدعم ملء شاشة DIV → جرّب ملء شاشة الفيديو الأصلي */ }
    }

    // 2) iPhone Safari: ملء شاشة الفيديو الأصلي (لا يفتح Google Drive، يبقى داخل المنصة)
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (typeof v?.webkitEnterFullscreen === "function") {
      try {
        if (v.paused) v.play().catch(() => { /* */ });
        v.webkitEnterFullscreen();
        return;
      } catch { /* */ }
    }

    // 3) بديل أخير: وضع المسرح داخل الصفحة (حجم كبير دون مغادرة المنصة)
    setTheater(true);
  }, [theater]);

  const togglePip = useCallback(async () => {
    const v = videoRef.current as PipVideo | null;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
      else v.webkitSetPresentationMode?.("picture-in-picture");
    } catch { /* تجاهل */ }
  }, []);

  /* ── أحداث عنصر الفيديو ── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      setWaiting(false); // الميتاداتا جاهزة → أظهر زر التشغيل بدل دوّارة التحميل الدائمة
      setDuration(v.duration || 0);
      setQuality(qualityLabel(v.videoHeight));
      // اختيار object-fit ذكي: ملء الكادر لمقاطع قريبة من 16:9، احتواء لغيرها (بلا تشويه)
      const vAR = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
      const boxAR = 16 / 9;
      setFit(Math.abs(vAR - boxAR) / boxAR < 0.12 ? "cover" : "contain");
    };
    const onTime = () => {
      setCurrent(v.currentTime);
    };
    const onProgress = () => {
      try {
        const b = v.buffered;
        const ranges: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < b.length; i++) ranges.push({ start: b.start(i), end: b.end(i) });
        setBufferedRanges(ranges);
      } catch { /* */ }
    };
    const onPlay = () => { setPlaying(true); setStarted(true); setWaiting(false); showControls(); };
    const onPause = () => { setPlaying(false); setControlsVisible(true); };
    const onWaiting = () => {
      setWaiting(true);
      if (stallStartedRef.current === null) stallStartedRef.current = Date.now();
      reportPlaybackMetric("waiting");
    };
    const onStalled = () => reportPlaybackMetric("stalled");
    const clearSeek = () => {
      setSeeking(false);
      setSeekSpinner(false);
      if (seekSpinnerTimer.current) { clearTimeout(seekSpinnerTimer.current); seekSpinnerTimer.current = null; }
    };
    const onSeeking = () => {
      if (!started) return; // تجاهل seek التلقائي عند استئناف الموضع
      setSeeking(true);
      setSeekSpinner(false);
      if (seekSpinnerTimer.current) clearTimeout(seekSpinnerTimer.current);
      // نُظهر الـ spinner فقط إذا استمر التعليق أكثر من 700ms (شبكة بطيئة)
      seekSpinnerTimer.current = setTimeout(() => setSeekSpinner(true), 700);
    };
    const onSeeked = () => { /* ننتظر playing قبل إخفاء شريط التحميل */ };
    const onPlaying = () => {
      setWaiting(false);
      clearSeek();
      if (stallStartedRef.current !== null) {
        reportPlaybackMetric("recovered", Date.now() - stallStartedRef.current);
        stallStartedRef.current = null;
      }
    };
    const onReady = () => setWaiting(false);
    const onEnded = () => { setPlaying(false); setControlsVisible(true); };
    const onError = () => {
      // فشل HLS الأصلي (iOS) → لا نُظهر خطأ بل نرجع تلقائياً إلى mp4
      if (usingHlsRef.current) { setHlsFailed(true); return; }
      setWaiting(false); setLoadError(true); setErrorCode(v.error?.code ?? null);
    };
    const onVol = () => { setVolume(v.volume); setMuted(v.muted); };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("progress", onProgress);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("loadeddata", onReady);
    v.addEventListener("canplay", onReady);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    v.addEventListener("volumechange", onVol);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("progress", onProgress);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("loadeddata", onReady);
      v.removeEventListener("canplay", onReady);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      v.removeEventListener("volumechange", onVol);
    };
  }, [showControls, reportPlaybackMetric]);

  /* ── إعادة الضبط عند تغيّر المصدر (دون إعادة تركيب العنصر → لا وميض) ── */
  useEffect(() => {
    setLoadError(false);
    setErrorCode(null);
    setStarted(false);
    setWaiting(true);
    setSeeking(false);
    setSeekSpinner(false);
    if (seekSpinnerTimer.current) { clearTimeout(seekSpinnerTimer.current); seekSpinnerTimer.current = null; }
    setCurrent(0);
    setBufferedRanges([]);
    setHlsLevels([]);
    setManualLevel(-1);
    manualLevelRef.current = -1;
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey]);

  /* ── إعادة السماح بتجربة HLS عند تغيّر رابط الـ HLS نفسه (جزء جديد — لا مجرد token مجدَّد) ── */
  useEffect(() => { setHlsFailed(false); }, [hlsKey]);

  /* ── ربط المصدر: hls.js (MSE) ← HLS أصلي (iOS Safari) ← mp4 احتياطاً ──
     يُدار src هنا وليس في JSX لأن hls.js يربط MediaSource بنفسه. أي فشل
     نهائي في مسار HLS يستدعي setHlsFailed → يعيد هذا التأثير الربط على mp4. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    let hls: HlsType | null = null;

    if (!useHls) {
      v.src = srcRef.current;
      // استئناف الموضع بعد تبديل الجودة (720p ↔ الأصلية)
      const resume = resumeAfterQualityRef.current;
      if (resume) {
        resumeAfterQualityRef.current = null;
        const onMeta = () => {
          try { if (resume.time > 0) v.currentTime = resume.time; } catch { /* */ }
          if (resume.wasPlaying) v.play().catch(() => { /* */ });
        };
        v.addEventListener("loadedmetadata", onMeta, { once: true });
      }
      return () => { v.removeAttribute("src"); };
    }

    (async () => {
      try {
        const HlsCtor = (await import("hls.js")).default;
        if (cancelled || !videoRef.current) return;
        if (HlsCtor.isSupported()) {
          hls = new HlsCtor({
            /* ── Buffer ──
               Desktop: أقل مسبقاً → يبدأ أسرع، ABR أقل تقلباً
               Mobile:  أكثر مسبقاً → يعوّض تقطّع الشبكة */
            maxBufferLength:    isDesktop ? 20 : 60,
            maxMaxBufferLength: isDesktop ? 40 : 120,
            backBufferLength: 30,

            /* ── ABR ──
               capLevelToPlayerSize:  لا تحمّل جودة أعلى من حجم المشغّل
               capLevelOnFPSDrop:     خفّض الجودة تلقائياً عند سقوط الإطارات
               startLevel = -1:       ابدأ بأدنى جودة ثم ارفع حسب القياس الفعلي
               abrEwmaDefaultEstimate: تقدير 500kbps مبدئي → يبدأ بـ 360p لا 720p
               abrBandWidthFactor:    استخدم 85% من عرض النطاق (هامش أمان)
               abrBandWidthUpFactor:  ارفع الجودة فقط بعد تأكيد 70% من الرنج الأعلى */
            capLevelToPlayerSize: true,
            capLevelOnFPSDrop: true,
            startLevel: -1,
            abrEwmaDefaultEstimate: 500_000,
            abrBandWidthFactor: 0.85,
            abrBandWidthUpFactor: 0.7,

            /* ── xhrSetup: تجديد token في كل طلب بدون إعادة تحميل المصدر ── */
            xhrSetup: (xhr: XMLHttpRequest, url: string) => {
              const fresh = currentTokenRef.current;
              if (fresh) {
                const updated = url.replace(/([?&]token=)[^&]+/, `$1${encodeURIComponent(fresh)}`);
                if (updated !== url) xhr.open("GET", updated, true);
              }
            },
          });
          hlsRef.current = hls; // نكشف المثيل للـ setHlsLevel خارج الـ useEffect

          let netRetried = false;
          let mediaRecovered = false;

          /* ── MANIFEST_PARSED: نملأ قائمة مستويات الجودة عند تحليل الـ manifest ── */
          hls.on(HlsCtor.Events.MANIFEST_PARSED, (_evt: unknown, data: { levels: Array<{ height: number }> }) => {
            const levels = data.levels
              .map((l, i) => ({ height: l.height, label: qualityLabel(l.height), index: i }))
              .sort((a, b) => b.height - a.height); // من الأعلى للأدنى في القائمة
            setHlsLevels(levels);
          });

          hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
            if (!data.fatal || !hls) return;
            // متصفح بلا دعم H.264 عبر MSE: لا جدوى من recoverMediaError — ارجع فوراً إلى mp4
            if (data.details === HlsCtor.ErrorDetails.MANIFEST_INCOMPATIBLE_CODECS_ERROR) {
              hls.destroy(); hls = null;
              setHlsFailed(true);
              return;
            }
            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && !netRetried) {
              netRetried = true; hls.startLoad(); return; // محاولة واحدة لاستئناف التحميل
            }
            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
              mediaRecovered = true; hls.recoverMediaError(); return;
            }
            hls.destroy(); hls = null;
            setHlsFailed(true); // الرجوع النهائي إلى mp4
          });

          /* LEVEL_SWITCHED: حدّث ملصق الجودة (في وضع ABR أو بعد التثبيت اليدوي) */
          hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_evt, data) => {
            const h = (hls as HlsType | null)?.levels?.[data.level]?.height;
            if (h) setQuality(qualityLabel(h));
          });

          hls.loadSource(hlsSrcRef.current as string);
          hls.attachMedia(v);
        } else if (v.canPlayType(HLS_MIME)) {
          v.src = hlsSrcRef.current as string; // iOS Safari: دعم HLS أصلي بدون MSE
        } else {
          setHlsFailed(true);
        }
      } catch {
        if (!cancelled) setHlsFailed(true); // تعذّر تحميل hls.js نفسه → mp4
      }
    })();

    return () => {
      cancelled = true;
      hlsRef.current = null; // امسح قبل destroy لتجنّب استخدامه في setHlsLevel بعد تفكيك المكوّن
      if (hls) { hls.destroy(); hls = null; }
      else v.removeAttribute("src");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useHls, hlsKey, srcKey]);

  /* ── تجديد الـ token تلقائياً (كل 90 دقيقة) ─────────────────────────────
     يتصل بـ GET /api/videos/:id/token/:part (بالـ cookie) ويُحدِّث
     currentTokenRef. xhrSetup يلتقط القيمة المحدَّثة في الطلب التالي
     دون إعادة تحميل المصدر أو انقطاع التشغيل.
     يعمل فقط عند وجود videoId وعند تشغيل HLS (الحالة الأكثر احتياجاً). */
  useEffect(() => {
    if (!videoId || !useHls) return;
    // استخرج رقم الجزء من رابط HLS (مثال: /api/videos/57/hls/0/master.m3u8?token=...)
    const partMatch = hlsSrcRef.current?.match(/\/hls\/(\d+)\//);
    const part = partMatch ? Number(partMatch[1]) : 0;
    const REFRESH_MS = 90 * 60 * 1000; // 90 دقيقة (قبل انتهاء الـ 2h بنصف ساعة)
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}/token/${part}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json() as { token?: string };
        if (data.token) currentTokenRef.current = data.token;
      } catch { /* best-effort — لا تكسر التشغيل عند فشل التجديد */ }
    }, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, useHls]);

  /* ── مزامنة حالة الشاشة الكاملة ── */
  useEffect(() => {
    const doc = document as FsDoc;
    const onFs = () => setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  /* ── وضع المسرح: قفل تمرير الصفحة + Escape للخروج ── */
  useEffect(() => {
    if (!theater) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTheater(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [theater]);

  /* ── الحماية: منع القائمة/النسخ/السحب + رصد محاولات التصوير وأدوات المطوّر ── */
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44 ||
        (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key))) {
        handleSuspicious(); return;
      }
      const k = e.key.toLowerCase();
      const isDevtools = e.key === "F12" || e.keyCode === 123 ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        ((e.ctrlKey || e.metaKey) && k === "u");
      const isSave = (e.ctrlKey || e.metaKey) && k === "s";
      if (isDevtools) { e.preventDefault(); reportSecurity("devtools_attempt", `key:${e.key}`); }
      else if (isSave) e.preventDefault();

      // اختصارات التشغيل عندما يكون المشغّل نشطاً
      const within = containerRef.current?.contains(document.activeElement) || isFullscreen;
      if (!within) return;
      if (e.code === "Space" || k === "k") { e.preventDefault(); togglePlay(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); seekBy(-10); } // RTL: يمين = ترجيع
      else if (e.key === "ArrowLeft") { e.preventDefault(); seekBy(10); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setVol(volume + 0.1); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setVol(volume - 0.1); }
      else if (k === "f") { e.preventDefault(); toggleFullscreen(); }
      else if (k === "m") { e.preventDefault(); toggleMute(); }
    };
    const handleKeyup = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44) handleSuspicious();
    };
    const c = containerRef.current;
    const onCtx = (e: MouseEvent) => { e.preventDefault(); reportSecurity("copy_link_attempt", "contextmenu"); };
    const onSel = (e: Event) => e.preventDefault();
    const onCopy = (e: Event) => { e.preventDefault(); reportSecurity("copy_link_attempt", "copy"); };
    const onDrag = (e: Event) => e.preventDefault();

    /* اعتراض تسجيل الشاشة عبر المتصفح (getDisplayMedia) ما دام المشغّل مفتوحاً:
       يُسجَّل الحدث في سجل النشاط ويُرفَض الالتقاط. (تسجيل الشاشة على مستوى نظام
       التشغيل لا يمكن للمتصفح رصده — العلامة المائية هي خط الدفاع هناك.) */
    const md: MediaDevices | undefined = navigator.mediaDevices;
    const origGdm = md && typeof md.getDisplayMedia === "function" ? md.getDisplayMedia.bind(md) : null;
    if (md && origGdm) {
      md.getDisplayMedia = (async () => {
        reportSecurity("screen_capture_attempt", "getDisplayMedia");
        handleSuspicious();
        throw new DOMException("التقاط الشاشة غير مسموح أثناء عرض محتوى محمي", "NotAllowedError");
      }) as MediaDevices["getDisplayMedia"];
    }

    /* إخفاء الصفحة أثناء التشغيل (تبديل تطبيق/تبويب) → إيقاف مؤقت للفيديو
       — باستثناء وضع صورة-داخل-صورة (PiP) حيث يُقصَد إخفاء التبويب مع استمرار التشغيل */
    const onVis = () => {
      const v = videoRef.current as (HTMLVideoElement & { webkitPresentationMode?: string }) | null;
      const inPip =
        document.pictureInPictureElement === v ||
        v?.webkitPresentationMode === "picture-in-picture";
      if (document.hidden && !inPip) v?.pause();
    };
    document.addEventListener("visibilitychange", onVis);

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("keyup", handleKeyup);
    if (c) {
      c.addEventListener("contextmenu", onCtx);
      c.addEventListener("selectstart", onSel);
      c.addEventListener("copy", onCopy);
      c.addEventListener("dragstart", onDrag);
    }
    return () => {
      if (md && origGdm) md.getDisplayMedia = origGdm;
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("keyup", handleKeyup);
      if (c) {
        c.removeEventListener("contextmenu", onCtx);
        c.removeEventListener("selectstart", onSel);
        c.removeEventListener("copy", onCopy);
        c.removeEventListener("dragstart", onDrag);
      }
    };
  }, [handleSuspicious, reportSecurity, togglePlay, seekBy, setVol, volume, toggleFullscreen, toggleMute, isFullscreen]);

  /* ── شريط التقدّم: نقر/سحب للتقديم ── */
  const pointerToTime = useCallback((clientX: number): number => {
    const bar = progressRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    // RTL: أقصى اليمين = 0، أقصى اليسار = النهاية
    const ratio = 1 - (clientX - rect.left) / rect.width;
    return Math.min(1, Math.max(0, ratio)) * duration;
  }, [duration]);

  const onProgressDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setScrubbing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekTo(pointerToTime(e.clientX), true);
  }, [pointerToTime, seekTo]);

  const onProgressMove = useCallback((e: React.PointerEvent) => {
    if (!scrubbing) return;
    seekTo(pointerToTime(e.clientX), true);
  }, [scrubbing, pointerToTime, seekTo]);

  const onProgressUp = useCallback(() => setScrubbing(false), []);

  /* ── إيماءات اللمس على مساحة الفيديو ── */
  const dragRef = useRef<{
    x: number; y: number; t: number; mode: "" | "seek" | "vol" | "bright";
    startVal: number; startTime: number; side: "l" | "r";
  } | null>(null);

  const onSurfaceDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return; // الفأرة تستعمل النقر العادي
    const rect = containerRef.current?.getBoundingClientRect();
    const side: "l" | "r" = rect && e.clientX - rect.left < rect.width / 2 ? "l" : "r";
    dragRef.current = {
      x: e.clientX, y: e.clientY, t: Date.now(), mode: "",
      startVal: side === "r" ? volume : brightness,
      startTime: videoRef.current?.currentTime ?? 0, side,
    };
  }, [volume, brightness]);

  const onSurfaceMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === "") {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
      d.mode = Math.abs(dx) > Math.abs(dy) ? "seek" : (d.side === "r" ? "vol" : "bright");
    }
    const h = containerRef.current?.getBoundingClientRect().height || 300;
    if (d.mode === "seek") {
      // RTL: السحب لليمين = ترجيع، لليسار = تقديم
      const delta = -(dx / 6);
      const nt = Math.min(Math.max(0, d.startTime + delta), duration || 0);
      seekTo(nt, true);
      flashGesture({ kind: "seek", text: formatTime(nt), side: dx < 0 ? "l" : "r" });
    } else if (d.mode === "vol") {
      const nv = Math.min(1, Math.max(0, d.startVal - dy / h));
      setVol(nv);
      flashGesture({ kind: "vol", text: `${Math.round(nv * 100)}%` });
    } else if (d.mode === "bright") {
      const nb = Math.min(1, Math.max(0.15, d.startVal - dy / h));
      setBrightness(nb);
      flashGesture({ kind: "bright", text: `${Math.round(nb * 100)}%` });
    }
  }, [duration, seekTo, setVol, flashGesture]);

  const onSurfaceUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) { return; }
    if (d.mode !== "") return; // كانت إيماءة سحب، ليست نقرة
    const v = videoRef.current;
    const now = Date.now();
    const rect = containerRef.current?.getBoundingClientRect();
    const isRight = rect ? e.clientX - rect.left > rect.width / 2 : true;
    const last = lastTapRef.current;

    // نقر مزدوج (أثناء التشغيل فقط): تقديم/ترجيع 10 ثوان — RTL: يمين=ترجيع، يسار=تقديم
    if (last && now - last.t < 300 && Math.abs(e.clientX - last.x) < 60 && v && !v.paused) {
      seekBy(isRight ? -10 : 10);
      lastTapRef.current = null;
      return;
    }

    // الفيديو متوقّف → أي نقرة تشغّله فوراً (تجربة مثل YouTube Mobile: Tap = Play)
    if (v && v.paused && !videoDisabled) {
      togglePlay();
      lastTapRef.current = null;
      return;
    }

    // الفيديو يعمل → نقرة مفردة تُظهر/تُخفي التحكم (مع إتاحة كشف النقر المزدوج)
    lastTapRef.current = { t: now, x: e.clientX };
    setTimeout(() => {
      if (lastTapRef.current && Date.now() - lastTapRef.current.t >= 280) {
        setControlsVisible(vv => !vv);
        if (!controlsVisible) showControls();
        lastTapRef.current = null;
      }
    }, 300);
  }, [seekBy, controlsVisible, showControls, togglePlay, videoDisabled]);

  const progressPct = duration ? (current / duration) * 100 : 0;

  const containerClass = cn(
    "relative w-full overflow-hidden bg-black select-none group/player",
    isFullscreen || theater ? "rounded-none" : "rounded-2xl",
  );
  const containerStyle: CSSProperties = theater
    ? { position: "fixed", inset: 0, width: "100vw", height: "100dvh", zIndex: 9999 }
    : isFullscreen
      ? { width: "100vw", height: "100vh" }
      : { aspectRatio: "16 / 9" };

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className={containerClass}
        style={containerStyle}
        onMouseMove={showControls}
        dir="rtl"
      >
        {/* الفيديو */}
        <video
          ref={videoRef}
          poster={poster || undefined}
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          // MP4 also needs to build a meaningful forward buffer before and
          // during playback; metadata-only loading leaves mobile players with
          // too little media ahead of the playhead.
          preload="auto"
          controlsList="nodownload noremoteplayback nofullscreen"
          disablePictureInPicture={false}
          className={cn("absolute inset-0 h-full w-full", fit === "cover" ? "object-cover" : "object-contain")}
          style={{ filter: brightness < 1 ? `brightness(${brightness})` : undefined }}
          onClick={(e) => { if (e.detail === 0) return; togglePlay(); }}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* طبقة الإيماءات (لمس فقط) */}
        <div
          className="absolute inset-0 z-10 touch-none"
          onPointerDown={onSurfaceDown}
          onPointerMove={onSurfaceMove}
          onPointerUp={onSurfaceUp}
          onPointerCancel={() => { dragRef.current = null; }}
        />

        {/* مؤشّر إيماءة مؤقت */}
        {gesture && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-2xl bg-black/65 px-5 py-3 text-white backdrop-blur-md">
              {gesture.kind === "seek" && (gesture.side === "l" ? <RotateCw className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />)}
              {gesture.kind === "vol" && (gesture.text === "0%" ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />)}
              {gesture.kind === "bright" && <Sun className="h-5 w-5" />}
              <span className="text-base font-bold tabular-nums">{gesture.text}</span>
            </div>
          </div>
        )}

        {/* تعتيم خفيف لإبراز التحكم */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/55 via-transparent to-black/35 transition-opacity duration-300",
            controlsVisible || !playing ? "opacity-100" : "opacity-0",
          )}
        />

        {/* شريط التحميل الرفيع عند التزريب (يظهر فوراً بدل الـ spinner) */}
        {seeking && !seekSpinner && !loadError && !videoDisabled && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] overflow-hidden rounded-t-sm">
            <div
              className="h-full animate-[seekbar_1.2s_ease-in-out_infinite] bg-primary"
              style={{ width: "40%" }}
            />
          </div>
        )}

        {/* مؤشّر التحميل الكبير: عند الفتح الأول أو إذا تجاوز التزريب 700ms */}
        {((!seeking && waiting) || seekSpinner) && !loadError && !videoDisabled && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-white/90" />
          </div>
        )}

        {/* زر التشغيل الكبير في الوسط */}
        {!videoDisabled && !loadError && (!playing || !started) && !waiting && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="تشغيل"
            className="absolute inset-0 z-20 flex items-center justify-center"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/90 text-white shadow-2xl shadow-primary/40 ring-4 ring-white/15 backdrop-blur-sm transition-transform duration-200 hover:scale-105 active:scale-95">
              <Play className="ms-1 h-9 w-9 fill-current" />
            </span>
          </button>
        )}

        {/* العلامة المائية الرئيسية — اسم + بريد + ID بلون قوي، موقع عشوائي كل عدة ثوانٍ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={wmTick}
            className="pointer-events-none absolute z-20"
            style={{ top: `${wmMain.top}%`, left: `${wmMain.left}%` }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: [0, -5, 0, 5, 0],
              transition: {
                opacity: { duration: 0.5, ease: "easeIn" },
                scale:   { duration: 0.5, ease: "easeOut" },
                y: { duration: 5, repeat: Infinity, ease: "easeInOut", repeatType: "loop" },
              },
            }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.35 } }}
          >
            <div style={{ transform: `rotate(${wmMain.rot}deg)` }} className="text-start">
              <div
                className="whitespace-nowrap text-sm font-extrabold md:text-xl"
                style={{
                  color: "rgba(255,255,255,0.92)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 14px rgba(0,0,0,0.85)",
                  letterSpacing: "0.02em",
                }}
              >
                {wmName}
              </div>
              {email && (
                <div
                  className="mt-0.5 whitespace-nowrap text-[11px] font-bold md:text-base"
                  style={{
                    color: "rgba(251,191,36,0.9)",
                    textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.85)",
                    letterSpacing: "0.02em",
                    direction: "ltr",
                  }}
                >
                  {email}
                </div>
              )}
              <div
                className="mt-0.5 whitespace-nowrap text-[10px] font-bold md:text-sm"
                style={{
                  color: "rgba(255,255,255,0.75)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.85)",
                  letterSpacing: "0.05em",
                }}
              >
                {wmIdLabel ? `${wmIdLabel} • ` : ""}GAB SCHOOL • محمي
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* علامة مائية ثانوية خفيفة — موقع عشوائي آخر بعيد عن الرئيسية (تصعّب التغطية دون حجب الفيديو) */}
        <div
          className="pointer-events-none absolute z-20 transition-all duration-1000 ease-in-out"
          style={{ top: `${wmSub.top}%`, left: `${wmSub.left}%` }}
        >
          <div
            className="whitespace-nowrap text-[10px] font-bold md:text-xs"
            style={{
              transform: `rotate(${wmSub.rot}deg)`,
              color: "rgba(255,255,255,0.22)",
              textShadow: "0 0 8px rgba(0,0,0,0.7)",
              letterSpacing: "0.04em",
              direction: "ltr",
            }}
          >
            {wmName}{wmIdLabel ? ` • ${wmIdLabel}` : ""}{email ? ` • ${email}` : ""}
          </div>
        </div>

        {/* شريط الحماية العلوي */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-2 transition-all duration-300 md:p-3",
            controlsVisible || !playing ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[10px] font-semibold text-white/85 backdrop-blur-sm md:text-xs">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">{title || "محتوى محمي — مخصص لحسابك فقط"}</span>
          </div>
        </div>

        {/* ════ شريط التحكم السفلي ════ */}
        {!videoDisabled && !loadError && (
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 z-30 px-2 pb-2 pt-8 transition-all duration-300 md:px-3 md:pb-3",
              controlsVisible || !playing ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 pointer-events-none",
            )}
          >
            {/* شريط التقدّم — ثلاث طبقات: المدة الكاملة / المحمَّل / المشاهَد */}
            <div
              ref={progressRef}
              onPointerDown={onProgressDown}
              onPointerMove={onProgressMove}
              onPointerUp={onProgressUp}
              className="group/bar relative mb-2 h-5 cursor-pointer touch-none"
            >
              {/* الطبقة 1: مسار الوقت الكامل */}
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />

              {/* الطبقة 2: النطاقات المحمَّلة فعلياً (أبيض/40) — RTL: right=start, width=length */}
              {duration > 0 && bufferedRanges.map((r, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/40"
                  style={{
                    right: `${(r.start / duration) * 100}%`,
                    width: `${((r.end - r.start) / duration) * 100}%`,
                  }}
                />
              ))}

              {/* الطبقة 3: ما تمّت مشاهدته (لون أساسي) */}
              <div
                className="absolute inset-y-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
                style={{ width: `${progressPct}%` }}
              />

              {/* مؤشر الموضع الحالي */}
              <div
                className={cn(
                  "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-primary shadow ring-2 ring-white transition-transform",
                  scrubbing ? "scale-110" : "scale-90 group-hover/bar:scale-100",
                )}
                style={{ right: `${progressPct}%` }}
              />
            </div>

            {/* أزرار التحكم */}
            <div className="flex items-center gap-1 text-white sm:gap-2">
              <CtrlBtn onClick={togglePlay} label={playing ? "إيقاف مؤقت" : "تشغيل"}>
                {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              </CtrlBtn>

              <CtrlBtn onClick={() => seekBy(-10)} label="ترجيع 10 ثوان">
                <RotateCcw className="h-5 w-5" />
              </CtrlBtn>
              <CtrlBtn onClick={() => seekBy(10)} label="تقديم 10 ثوان">
                <RotateCw className="h-5 w-5" />
              </CtrlBtn>

              {/* الصوت */}
              <div className="group/vol flex items-center">
                <CtrlBtn onClick={toggleMute} label={muted ? "إلغاء الكتم" : "كتم"}>
                  {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </CtrlBtn>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVol(Number(e.target.value))}
                  aria-label="مستوى الصوت"
                  className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 opacity-0 transition-all duration-200 accent-primary group-hover/vol:ms-1 group-hover/vol:w-16 group-hover/vol:opacity-100"
                />
              </div>

              <div className="mx-1 flex items-center gap-1 text-xs font-medium tabular-nums text-white/90 sm:text-sm">
                <span>{formatTime(current)}</span>
                <span className="text-white/50">/</span>
                <span className="text-white/70">{formatTime(duration)}</span>
              </div>

              <div className="flex-1" />

              <span className="hidden rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-white/90 sm:inline">
                {quality}
              </span>

              {/* الإعدادات */}
              <div className="relative">
                <CtrlBtn onClick={() => setSettingsOpen(o => !o)} label="الإعدادات" active={settingsOpen}>
                  <Settings className="h-5 w-5" />
                </CtrlBtn>
                {settingsOpen && (
                  <div className="absolute bottom-12 left-0 z-40 w-44 overflow-hidden rounded-xl border border-white/10 bg-black/90 p-1 text-sm text-white shadow-2xl backdrop-blur-md">
                    <div className="px-3 py-1.5 text-[11px] font-bold text-white/50">سرعة التشغيل</div>
                    {SPEEDS.map(s => (
                      <button
                        key={s}
                        onClick={() => { changeSpeed(s); setSettingsOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-right transition-colors hover:bg-white/10"
                      >
                        <span>{s === 1 ? "عادية" : `${s}×`}</span>
                        {speed === s && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                    {/* اختيار الجودة — يظهر فقط لفيديوهات HLS متعددة المستويات */}
                    {hlsLevels.length > 0 ? (
                      <>
                        <div className="mt-1 border-t border-white/10 px-3 pt-1.5 text-[11px] font-bold text-white/50">الجودة</div>
                        <button
                          onClick={() => setHlsLevel(-1)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-right transition-colors hover:bg-white/10"
                        >
                          <span>تلقائي (ABR)</span>
                          {manualLevel === -1 && <Check className="h-4 w-4 text-primary" />}
                        </button>
                        {hlsLevels.map(l => (
                          <button
                            key={l.index}
                            onClick={() => setHlsLevel(l.index)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-right transition-colors hover:bg-white/10"
                          >
                            <span>{l.label}</span>
                            {manualLevel === l.index && <Check className="h-4 w-4 text-primary" />}
                          </button>
                        ))}
                      </>
                    ) : lowSrc && !useHls ? (
                      <>
                        <div className="mt-1 border-t border-white/10 px-3 pt-1.5 text-[11px] font-bold text-white/50">الجودة</div>
                        <button
                          onClick={() => setLowQuality(true)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-right transition-colors hover:bg-white/10"
                        >
                          <span>720p — أخف وأسرع</span>
                          {preferLow && <Check className="h-4 w-4 text-primary" />}
                        </button>
                        <button
                          onClick={() => setLowQuality(false)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-right transition-colors hover:bg-white/10"
                        >
                          <span>الجودة الأصلية</span>
                          {!preferLow && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      </>
                    ) : (
                      <div className="mt-1 flex items-center justify-between border-t border-white/10 px-3 py-2 text-[11px] text-white/50">
                        <span>الجودة</span>
                        <span className="font-bold text-white/80">{quality}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {pipSupported && (
                <CtrlBtn onClick={togglePip} label="نافذة عائمة">
                  <PictureInPicture2 className="h-5 w-5" />
                </CtrlBtn>
              )}

              <CtrlBtn onClick={toggleFullscreen} label={isFullscreen || theater ? "إنهاء ملء الشاشة" : "ملء الشاشة"}>
                {isFullscreen || theater ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </CtrlBtn>
            </div>
          </div>
        )}

        {/* تحذير أمني سفلي دائم */}
        <div className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300",
          controlsVisible || !playing ? "opacity-0" : "opacity-100",
        )}>
          <div className="bg-gradient-to-t from-black/45 to-transparent px-3 pb-1.5 pt-6 text-center">
            <p className="line-clamp-1 text-[9px] font-medium text-white/70 md:text-xs">{SECURITY_WARNING_TEXT}</p>
          </div>
        </div>

        {/* حالة الخطأ */}
        {loadError && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/90 px-6 text-center">
            <AlertTriangle className="mb-3 h-12 w-12 text-amber-400" />
            <p className="mb-1 text-lg font-bold text-white">تعذّر تشغيل الفيديو</p>
            <p className="mb-4 max-w-xs text-sm text-white/60">
              حدث خطأ أثناء تحميل الفيديو. حاول مرة أخرى.
            </p>
            <Button
              onClick={() => {
                setLoadError(false);
                setErrorCode(null);
                setWaiting(true);
                void (async () => {
                  const refreshedSrc = await onRetry?.();
                  const video = videoRef.current;
                  if (!video) return;
                  if (refreshedSrc) {
                    srcRef.current = refreshedSrc;
                    video.src = refreshedSrc;
                  }
                  video.load();
                  await video.play().catch(() => {});
                })();
              }}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" /> إعادة المحاولة
            </Button>
          </div>
        )}

        {/* الفيديو معطّل بسبب نشاط مشبوه */}
        {videoDisabled && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/92 px-6 text-center">
            <ShieldAlert className="mb-4 h-16 w-16 text-red-500" />
            <p className="mb-2 text-xl font-bold text-red-400">تم تعطيل الفيديو</p>
            <p className="max-w-xs text-sm text-white/60">تم رصد نشاط مشبوه. تواصل مع الدعم لإعادة تفعيل الوصول.</p>
          </div>
        )}

        {/* نوافذ التحذير */}
        {warning === "first" && (
          <WarningModal icon={<AlertTriangle className="h-10 w-10 text-amber-400" />} title="⚠️ تحذير: تم رصد محاولة تصوير الشاشة"
            message="هذا المحتوى محمي. أي انتهاك يُسجَّل تلقائياً على حسابك." color="amber" onClose={() => setWarning(null)} />
        )}
        {warning === "second" && (
          <WarningModal icon={<ShieldAlert className="h-10 w-10 text-red-400" />} title="🚫 تحذير شديد"
            message="تم تسجيل نشاط غير مسموح. في حال التكرار سيتم حظر حسابك وإبلاغ الإدارة فوراً." color="red" onClose={() => setWarning(null)} />
        )}
        {warning === "blocked" && (
          <WarningModal icon={<ShieldAlert className="h-10 w-10 text-red-500" />} title="🚫 تم تسجيل المخالفة وحظر الوصول"
            message="تم تعطيل الفيديو مؤقتاً بسبب نشاط مشبوه متكرر. تواصل مع الإدارة." color="red" onClose={() => setWarning(null)} />
        )}
      </div>

      {/* شريط التحذير أسفل المشغّل */}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 md:p-4" dir="rtl">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400 md:h-5 md:w-5" />
        <p className="text-xs font-semibold leading-relaxed text-red-200 md:text-sm">{SECURITY_WARNING_TEXT}</p>
      </div>
    </div>
  );
}

function CtrlBtn({
  children, onClick, label, active,
}: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/15 active:scale-90",
        active && "bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

function WarningModal({
  icon, title, message, color, onClose,
}: {
  icon: React.ReactNode; title: string; message: string; color: "amber" | "red"; onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className={cn(
        "w-full max-w-sm rounded-2xl border p-6 text-center shadow-2xl",
        color === "amber" ? "border-amber-500/40 bg-amber-500/10" : "border-red-500/40 bg-red-950/60",
      )}>
        <div className="mb-4 flex justify-center">{icon}</div>
        <h3 className={cn("mb-3 text-lg font-bold", color === "amber" ? "text-amber-300" : "text-red-400")}>{title}</h3>
        <p className="mb-6 text-sm leading-relaxed text-foreground/80">{message}</p>
        <Button onClick={onClose} className="w-full" variant={color === "amber" ? "default" : "destructive"}>
          <X className="ml-2 h-4 w-4" /> فهمت
        </Button>
      </div>
    </div>
  );
}
