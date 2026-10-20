/* =========================================================
   app.js — ربط الواجهة (index.html) مع قاعدة بيانات Supabase
   ---------------------------------------------------------
   مسؤوليات هذا الملف:
   (١) بيانات الاتصال            (٤) تسجيل الدخول والخروج
   (٢) تهيئة عميل Supabase       (٥) إضافة وعرض وحذف الملاحظات
   (٣) فحص الاتصال بقاعدة البيانات
   ملاحظة: يجب أن تُحمّل مكتبة Supabase CDN قبل هذا الملف.
   ========================================================= */


/* =========================================================
   (١) بيانات الاتصال — عدّلها فقط إذا تغيّر مشروعك
   ---------------------------------------------------------
   • SUPABASE_URL : رابط مشروعك، تجده في
                    Supabase Dashboard ← Project Settings ← API
   • SUPABASE_KEY : مفتاح "Publishable" العام، آمن للاستخدام
                    داخل المتصفح (لا تضع مفتاح Service Role هنا!)
                    صيغة المفتاح: sb_publishable_مفتاح_تحقق
   ========================================================= */
const SUPABASE_URL = "https://pqgpdpxjamwaqjddqhbv.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_TLnksnEcUiNsBugdNDfJ4g_-6sjfalK";

/* شرح للمبتدئين:
   الرابط الذي نسخته ينتهي بـ /rest/v1/ وهو مسار واجهة REST.
   مكتبة supabase-js تضيف هذا المسار (وأخرى مثل /auth/v1/)
   تلقائياً عند كل طلب، لذلك نزيله هنا حتى لا يتكرر المسار
   ولا يحدث خطأ 404 عند الاتصال. */
const SUPABASE_BASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "");

/*
   ═══════════════════════════════════════════════════════════
   الجدول المطلوب — نفّذه مرة واحدة من:
   Supabase Dashboard ← SQL Editor ← New query

   create table public.notes (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users(id) on delete cascade not null,
     title text not null,
     content text,
     created_at timestamptz default now()
   );
   alter table public.notes enable row level security;

   -- كل مستخدم يقرأ ويضيف ويحذف ملاحظاته فقط
   create policy "read own notes"   on public.notes for select using (auth.uid() = user_id);
   create policy "insert own notes" on public.notes for insert with check (auth.uid() = user_id);
   create policy "delete own notes" on public.notes for delete using (auth.uid() = user_id);
   ═══════════════════════════════════════════════════════════
*/


/* =========================================================
   (٢) تهيئة عميل Supabase
   --------------------------------------------------------
   دالة createClient(الرابط, المفتاح) تُنشئ "عميلاً" (client)
   وهو كائن جاهز فيه كل أدوات الاتصال:
     db.auth  ← تسجيل الدخول والحسابات
     db.from  ← قراءة الجداول وإضافة السجلات وحذفها
   نخزّنه في المتغير db لنشير إليه في بقية الملف.
   ========================================================= */
const db = window.supabase.createClient(SUPABASE_BASE_URL, SUPABASE_KEY);

console.log("✅ تم تهيئة عميل Supabase بنجاح:", SUPABASE_BASE_URL);


/* =========================================================
   (٣) فحص الاتصال بقاعدة البيانات
   --------------------------------------------------------
   الفكرة ببساطة: نطلب سطراً واحداً فقط من جدول notes.
   • إذا وصل ردّ ناجح  ← الاتصال والمفتاح والجدول كلها سليمة.
   • إذا فشل          ← نعرض سبب الخطأ للمبتدئ برسالة عربية.
   ========================================================= */
async function checkConnection() {
  try {
    const { error } = await db.from("notes").select("id").limit(1);
    if (error) throw error;
    setDbStatus("ok", "✅ تم الاتصال بقاعدة البيانات بنجاح.");
    return true;
  } catch (err) {
    const msg = String(err.message || err);
    const tableMissing = err.code === "42P01" || /does not exist|could not find the table/i.test(msg);
    const noPermission = err.code === "42501" || /permission denied/i.test(msg);

    if (tableMissing) {
      setDbStatus("err", "⚠️ الاتصال يعمل، لكن جدول notes غير موجود — نفّذ كود SQL الموجود في أعلى app.js");
      console.warn("فحص الاتصال: جدول notes غير موجود. نفّذ كود SQL الموجود في أعلى app.js");
    } else if (noPermission) {
      setDbStatus("err", "⚠️ الجدول موجود لكن الصلاحية ممنوعة — راجع سياسات RLS في كود SQL أعلى الملف.");
      console.warn("فحص الاتصال: رفض الصلاحية على جدول notes (سياسات RLS).", err);
    } else {
      setDbStatus("err", "⚠️ تعذّر الاتصال: " + msg);
      console.error("فشل فحص الاتصال:", err);
    }
    return false;
  }
}

/* تحديث عنصر حالة الاتصال في شاشة الدخول (لو كان موجوداً) */
function setDbStatus(kind, text) {
  const el = document.getElementById("dbStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "db-status " + kind;
}


/* =========================================================
   (٤) أدوات مساعدة للواجهة
   ========================================================= */

/* اختصار للعناصر حسب معرّفها */
const $ = (id) => document.getElementById(id);

const authScreen = $("authScreen"), appScreen = $("appScreen");
const loginForm = $("loginForm"), signupForm = $("signupForm");
const tabLogin = $("tabLogin"), tabSignup = $("tabSignup");
const notesGrid = $("notesGrid"), emptyState = $("emptyState"), loadingState = $("loadingState");
const toastEl = $("toast");

let currentUser = null;   // المستخدم الحالي (من Supabase)
let notes = [];           // ملاحظات المستخدم المعروضة

/* تنسيق التاريخ والأرقام بالعربية */
const dateFormatter = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });
const numberFormatter = new Intl.NumberFormat("ar");

/* عرض تنبيه منبثق (Toast) لمدة ٣ ثوانٍ */
let toastTimer;
function toast(msg, type = "info") {
  toastEl.textContent = msg;
  toastEl.className = "toast show toast-" + type;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3000);
}

/* تبديل التبويب بين تسجيل الدخول وإنشاء الحساب */
function switchTab(tab) {
  const isLogin = tab === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabSignup.classList.toggle("active", !isLogin);
  tabLogin.setAttribute("aria-selected", isLogin);
  tabSignup.setAttribute("aria-selected", !isLogin);
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  clearError("loginError");
  clearError("signupError");
}
tabLogin.addEventListener("click", () => switchTab("login"));
tabSignup.addEventListener("click", () => switchTab("signup"));

/* عرض/إخفاء رسائل الخطأ داخل النماذج */
function showError(id, msg) { const el = $(id); el.textContent = msg; el.hidden = false; }
function clearError(id) { const el = $(id); el.textContent = ""; el.hidden = true; }

/* ترجمة رسائل الخطأ التقنية إلى رسائل عربية مفهومة */
function friendlyError(err) {
  const m = String(err && err.message ? err.message : err).toLowerCase();
  const code = err && err.code;

  if (m.includes("invalid login")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (m.includes("already registered")) return "هذا البريد مسجّل مسبقاً، جرّب تسجيل الدخول.";
  if (m.includes("password")) return "كلمة المرور يجب أن تكون ٦ أحرف على الأقل.";
  if (m.includes("email not confirmed")) return "يجب تأكيد البريد الإلكتروني أولاً من رابط أرسل إليك.";
  if (m.includes("rate limit")) return "محاولات كثيرة جداً، انتظر قليلاً ثم أعد المحاولة.";
  if (code === "42P01" || m.includes("could not find the table"))
    return "جدول notes غير موجود — نفّذ كود SQL الموجود في أعلى app.js";
  if (code === "42501" || m.includes("permission denied"))
    return "لا توجد صلاحية على الجدول — راجع سياسات RLS.";
  if (m.includes("failed to fetch")) return "تعذّر الوصول إلى السيرفر، تحقق من اتصال الإنترنت.";
  return "حدث خطأ: " + (err && err.message ? err.message : err);
}

/* تحديد صلاحية المستخدم: مدير إذا كانت بيانات الحساب تقول ذلك
   أو إذا كان البريد يبدأ بـ admin */
function getUserRole(user) {
  const role = user && user.user_metadata && user.user_metadata.role;
  if (role === "admin") return "admin";
  const email = ((user && user.email) || "").toLowerCase();
  return email.startsWith("admin") ? "admin" : "user";
}


/* =========================================================
   (٥) المصادقة: إنشاء حساب / دخول / خروج
   ========================================================= */

/* --- إنشاء حساب جديد --- */
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError("signupError");
  const email = $("signupEmail").value.trim();
  const password = $("signupPassword").value;

  if (!email || password.length < 6) {
    return showError("signupError", "أدخل بريداً صحيحاً وكلمة مرور ٦ أحرف على الأقل.");
  }

  const btn = $("signupBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الإنشاء...";
  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { role: "user" } }   // صلاحية افتراضية للمستخدم الجديد
    });
    if (error) throw error;

    /* إذا لم ترجع الجلسة فمعناه أن تأكيد البريد مفعّل */
    if (!data.session) {
      toast("تم إنشاء الحساب، فعّل الرابط المرسل إلى بريدك ثم سجّل الدخول.", "info");
      switchTab("login");
    } else {
      toast("تم إنشاء الحساب بنجاح 🎉", "success");
      enterApp(data.user);
    }
  } catch (err) {
    showError("signupError", friendlyError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "إنشاء الحساب";
  }
});

/* --- تسجيل الدخول --- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError("loginError");
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;

  if (!email || !password) {
    return showError("loginError", "أدخل البريد الإلكتروني وكلمة المرور.");
  }

  const btn = $("loginBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الدخول...";
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    enterApp(data.user);
  } catch (err) {
    showError("loginError", friendlyError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "دخول";
  }
});

/* --- تسجيل الخروج --- */
$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  currentUser = null;
  notes = [];
  notesGrid.innerHTML = "";
  appScreen.hidden = true;
  authScreen.hidden = false;
  loginForm.reset();
  signupForm.reset();
  switchTab("login");
  toast("تم تسجيل الخروج بسلام.", "info");
});

/* --- دخول التطبيق: إخفاء شاشة الدخول وإظهار الملاحظات --- */
async function enterApp(user) {
  currentUser = user;

  const role = getUserRole(user);
  $("userEmail").textContent = user.email;
  const badge = $("roleBadge");
  badge.textContent = role === "admin" ? "مدير" : "مستخدم";
  badge.className = "badge " + (role === "admin" ? "badge-admin" : "badge-user");

  authScreen.hidden = true;
  appScreen.hidden = false;
  await loadNotes();
}

/* --- استعادة الجلسة المحفوظة عند فتح الصفحة --- */
async function restoreSession() {
  try {
    const { data } = await db.auth.getSession();
    if (data && data.session && data.session.user) {
      await enterApp(data.session.user);
    }
  } catch (err) {
    console.warn("تعذّرت استعادة الجلسة:", err);
  }
}


/* =========================================================
   (٦) الملاحظات: تحميل / إضافة / حذف
   ========================================================= */

/* تحميل ملاحظات المستخدم الحالي من Supabase */
async function loadNotes() {
  loadingState.hidden = false;
  emptyState.hidden = true;
  notesGrid.innerHTML = "";
  try {
    /* سياسات RLS تجعل المستخدم يرى ملاحظاته فقط تلقائياً */
    const { data, error } = await db
      .from("notes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    notes = data || [];
    renderNotes();
  } catch (err) {
    toast("تعذّر تحميل الملاحظات: " + friendlyError(err), "error");
  } finally {
    loadingState.hidden = true;
  }
}

/* رسم بطاقات الملاحظات في الشبكة */
function renderNotes() {
  notesGrid.innerHTML = "";
  emptyState.hidden = notes.length !== 0;
  $("notesCount").textContent = numberFormatter.format(notes.length);

  notes.forEach((note) => {
    const card = document.createElement("article");
    card.className = "note-card";

    const top = document.createElement("div");
    top.className = "note-top";

    const title = document.createElement("h3");
    title.className = "note-title";
    title.textContent = note.title;      /* textContent آمن ضد حقن HTML */

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-delete";
    del.title = "حذف الملاحظة";
    del.setAttribute("aria-label", "حذف الملاحظة");
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>';
    del.addEventListener("click", () => deleteNote(note.id));

    top.append(title, del);

    const content = document.createElement("p");
    content.className = "note-content";
    content.textContent = note.content || "";

    const date = document.createElement("time");
    date.className = "note-date";
    date.textContent = dateFormatter.format(new Date(note.created_at));

    card.append(top, content, date);
    notesGrid.append(card);
  });
}

/* إضافة ملاحظة جديدة إلى Supabase */
$("noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError("noteError");
  const title = $("noteTitle").value.trim();
  const content = $("noteContent").value.trim();

  if (!title || !content) {
    return showError("noteError", "العنوان والمحتوى مطلوبان معاً.");
  }

  const btn = $("saveNoteBtn");
  btn.disabled = true;
  btn.textContent = "جارٍ الحفظ...";
  try {
    const { data, error } = await db
      .from("notes")
      .insert({ user_id: currentUser.id, title, content })
      .select()
      .single();
    if (error) throw error;

    notes.unshift(data);       // نضيفها أولاً لأنها الأحدث
    $("noteForm").reset();
    renderNotes();
    toast("تم حفظ الملاحظة ✅", "success");
  } catch (err) {
    showError("noteError", "تعذّر الحفظ: " + friendlyError(err));
  } finally {
    btn.disabled = false;
    btn.textContent = "حفظ الملاحظة";
  }
});

/* حذف ملاحظة بعد التأكيد */
async function deleteNote(id) {
  if (!confirm("هل أنت متأكد من حذف هذه الملاحظة؟ لا يمكن التراجع.")) return;
  try {
    const { error } = await db.from("notes").delete().eq("id", id);
    if (error) throw error;
    notes = notes.filter((n) => n.id !== id);
    renderNotes();
    toast("تم حذف الملاحظة.", "info");
  } catch (err) {
    toast("تعذّر الحذف: " + friendlyError(err), "error");
  }
}


/* =========================================================
   (٧) بدء تشغيل التطبيق + جاهزية PWA
   ========================================================= */

/* الخطوة الأولى: فحص الاتصال واستعادة الجلسة معاً (لتقليل الانتظار) */
(async function startApp() {
  await Promise.all([checkConnection(), restoreSession()]);
})();

/* لتفعيل وضع PWA: أنشئ ملف sw.js ثم غيّر القيمة إلى true */
const ENABLE_PWA = false;

if (ENABLE_PWA && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) =>
      console.warn("تعذّر تسجيل Service Worker:", e));
  });
}
