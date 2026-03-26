/* ═══════════════════════════════════════════════════════════
   Guardian — Main Application Script
   Dengan integrasi Gemini AI untuk deteksi penipuan
═══════════════════════════════════════════════════════════ */

// ── Ganti dengan API Key Google AI Studio kamu ───────────────
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const Guardian = (() => {
  const PAGES = ["home", "checker", "url", "message"];
  let currentPage = "home";
  let toastTimer = null;
  let dropdownOpen = false;
  let mobileOpen = false;
  let countersRun = false;

  /* ═══════════════════════════════════════════════════════
     GEMINI AI — Core
  ═══════════════════════════════════════════════════════ */

  async function askGemini(systemPrompt, userMessage) {
    const url = `https://api.groq.com/openai/v1/chat/completions`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n${userMessage}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(
        `Groq API error: ${res.status} — ${err?.error?.message || "Unknown"}`,
      );
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  function parseJSON(text) {
    try {
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════
     PAGE ROUTER
  ═══════════════════════════════════════════════════════ */

  function go(name) {
    if (!PAGES.includes(name)) return;
    closeDropdown();
    closeMobile();

    PAGES.forEach((p) => {
      const el = document.getElementById("page-" + p);
      if (el) el.classList.add("hidden");
    });

    const target = document.getElementById("page-" + name);
    if (!target) return;

    target.classList.remove("hidden");
    target.classList.add("page-enter");
    setTimeout(() => target.classList.remove("page-enter"), 400);

    const footerSlots = {
      checker: "checker-footer",
      url: "url-footer",
      message: "msg-footer",
    };
    const slotId = footerSlots[name];
    if (slotId) {
      const slot = document.getElementById(slotId);
      if (slot && slot.innerHTML.trim() === "") {
        const tmpl = document.getElementById("footer-template");
        if (tmpl) slot.appendChild(tmpl.content.cloneNode(true));
      }
    }

    if (name === "checker")
      document.getElementById("checker-result").classList.add("hidden");
    if (name === "url")
      document.getElementById("url-result").classList.add("hidden");
    if (name === "message") resetMsg();

    currentPage = name;
    history.pushState({ page: name }, "", "#" + name);
    updateNav(name);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(runReveal, 100);
  }

  function updateNav(page) {
    document
      .querySelectorAll(".nav-btn")
      .forEach((btn) => btn.classList.remove("active"));
    const map = {
      home: "home",
      checker: "tools",
      url: "tools",
      message: "tools",
      stats: "stats",
    };
    const target = map[page];
    if (target) {
      document
        .querySelectorAll(`[data-nav="${target}"]`)
        .forEach((btn) => btn.classList.add("active"));
    }
  }

  /* ── Dropdown ─────────────────────────────────────────── */
  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
    const dd = document.getElementById("nav-dropdown");
    const arrow = document.getElementById("dropdown-arrow");
    if (dropdownOpen) {
      dd.classList.remove("hidden");
      arrow.style.transform = "rotate(180deg)";
    } else {
      closeDropdown();
    }
  }

  function closeDropdown() {
    dropdownOpen = false;
    const dd = document.getElementById("nav-dropdown");
    const arrow = document.getElementById("dropdown-arrow");
    if (dd) dd.classList.add("hidden");
    if (arrow) arrow.style.transform = "rotate(0deg)";
  }

  /* ── Mobile Menu ──────────────────────────────────────── */
  function toggleMobile() {
    mobileOpen = !mobileOpen;
    const menu = document.getElementById("mobile-menu");
    if (mobileOpen) menu.classList.remove("hidden");
    else menu.classList.add("hidden");
  }

  function closeMobile() {
    mobileOpen = false;
    const menu = document.getElementById("mobile-menu");
    if (menu) menu.classList.add("hidden");
  }

  /* ── About Modal ──────────────────────────────────────── */
  function showAbout() {
    closeMobile();
    closeDropdown();
    document.getElementById("about-modal").classList.remove("hidden");
  }

  function closeAbout() {
    document.getElementById("about-modal").classList.add("hidden");
  }

  /* ── Scroll to Stats ──────────────────────────────────── */
  function scrollStats() {
    closeMobile();
    const trigger = () => {
      const el = document.getElementById("stats");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => runCounters(true), 800);
      }
    };
    if (currentPage !== "home") {
      go("home");
      setTimeout(trigger, 400);
    } else {
      trigger();
    }
  }

  /* ── Hero Search ──────────────────────────────────────── */
  function heroSearch() {
    const val = document.getElementById("hero-search")?.value.trim();
    if (!val) return;
    if (/^[\+\d\s\-\(\)]{7,}$/.test(val)) {
      document.getElementById("checker-input").value = val;
      go("checker");
      setTimeout(() => runChecker(), 350);
    } else if (/^https?:\/\//i.test(val) || /^[\w.-]+\.[a-z]{2,}/i.test(val)) {
      document.getElementById("url-input").value = val;
      go("url");
      setTimeout(() => runUrl(), 350);
    } else {
      document.getElementById("msg-input").value = val;
      go("message");
      setTimeout(() => runMessage(), 350);
    }
  }

  /* ═══════════════════════════════════════════════════════
     PEMERIKSA NOMOR — Gemini AI
  ═══════════════════════════════════════════════════════ */

  async function runChecker() {
    const input = document.getElementById("checker-input")?.value.trim();
    if (!input) {
      toast(
        "warning",
        "Input Kosong",
        "Masukkan nomor telepon terlebih dahulu.",
      );
      return;
    }

    const btn = document.getElementById("checker-submit");
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;
    document.getElementById("checker-result").classList.add("hidden");

    const system = `Kamu adalah pakar keamanan siber (Guardbot) yang ahli mendeteksi penipuan di Indonesia. Tugasmu adalah menganalisis nomor telepon dan memberikan laporan teknis sekaligus edukatif.
Kembalikan HANYA valid JSON tanpa teks apapun di luar JSON, tanpa markdown.

Instruksi Khusus:
1. Identifikasi apakah nomor tersebut milik instansi beneran atau sering dilaporkan sebagai spam/telemarketing/penipuan (Vishing).
2. Tentukan lokasi berdasarkan kode area atau data sejarah.
3. Jika nomor mencurigakan, berikan skor risiko tinggi (>80).
4. Summary harus dalam Bahasa Indonesia yang profesional dan waspada.

Format JSON:
{
  "is_scam": boolean,
  "risk_score": number (0-100),
  "threat_type": string (misal: "Telemarketing", "Penipuan Hadiah", "Vishing", "Aman"),
  "operator": string (misal: "Telkomsel", "Indosat", "VOIP"),
  "location": string,
  "last_active": string,
  "report_count": number,
  "summary": string 1-2 kalimat (Bahasa Indonesia),
  "active_since": string (estimasi tahun/bulan)
}`;

    try {
      const raw = await askGemini(
        system,
        `Analisis nomor telepon ini: ${input}`,
      );
      const data = parseJSON(raw);
      if (!data) throw new Error("Gagal parsing respons AI");
      renderChecker(data);
    } catch (err) {
      console.error(err);
      toast(
        "error",
        "Gagal Menganalisis",
        err.message || "Periksa koneksi internet atau API key.",
      );
    } finally {
      btn.innerHTML = origHTML;
      btn.disabled = false;
    }
  }

  function renderChecker(d) {
    const result = document.getElementById("checker-result");
    result.classList.remove("hidden");
    result.classList.add("page-enter");
    setTimeout(() => result.classList.remove("page-enter"), 400);

    const badge = result.querySelector("[class*='badge-']");
    if (badge) {
      badge.className = d.is_scam
        ? "badge-danger"
        : "badge-success-sm text-sm px-4 py-1.5";
      badge.textContent = d.is_scam
        ? "⚠ Penipuan Terdeteksi"
        : "✓ Terlihat Aman";
    }

    const summaryP = result.querySelector(".text-center .text-slate-400");
    if (summaryP) summaryP.innerHTML = d.summary;

    const rows = result.querySelectorAll(".info-row span:last-child");
    const rowData = [
      { text: d.threat_type, cls: "text-white font-medium" },
      { text: d.operator, cls: "text-cyan-400 font-medium" },
      { text: d.location, cls: "text-white font-medium" },
      {
        text: d.last_active,
        cls: d.is_scam
          ? "text-orange-400 font-medium"
          : "text-green-400 font-medium",
      },
    ];
    rows.forEach((row, i) => {
      if (rowData[i]) {
        row.textContent = rowData[i].text;
        row.className = rowData[i].cls;
      }
    });

    const metrics = result.querySelectorAll(".metric-box p.font-bold");
    if (metrics[0])
      metrics[0].textContent = d.report_count.toLocaleString("id-ID");
    if (metrics[1]) {
      metrics[1].textContent = `${d.risk_score}/100`;
      metrics[1].className = `font-bold text-xl ${d.risk_score >= 70 ? "text-red-400" : d.risk_score >= 40 ? "text-yellow-400" : "text-green-400"}`;
    }
    if (metrics[2])
      metrics[2].textContent = d.active_since || "Tidak Diketahui";

    setTimeout(
      () => result.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
    toast(
      d.is_scam ? "warning" : "success",
      d.is_scam ? "Waspada!" : "Nomor Aman",
      d.summary,
    );
  }

  function reportNumber() {
    toast(
      "success",
      "Laporan Dikirim",
      "Nomor ini telah dilaporkan ke database kami.",
    );
  }

  /* ═══════════════════════════════════════════════════════
     PEMERIKSA URL — Gemini AI
  ═══════════════════════════════════════════════════════ */

  async function runUrl() {
    const input = document.getElementById("url-input")?.value.trim();
    if (!input) {
      toast("warning", "Input Kosong", "Masukkan URL terlebih dahulu.");
      return;
    }

    const btn = document.getElementById("url-submit");
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;
    document.getElementById("url-result").classList.add("hidden");

    const system = `Kamu adalah mesin analis URL keamanan siber. Fokus pada deteksi Phishing, Malware, dan Typosquatting (peniruan domain bank/e-commerce Indonesia seperti BCA, Shopee, Tokopedia, dll).
Kembalikan HANYA valid JSON tanpa teks apapun di luar JSON, tanpa markdown.

Instruksi:
1. Periksa apakah URL menggunakan karakter aneh, domain murah (.xyz, .top, .online), atau sub-domain yang mencurigakan.
2. Analisis kesamaan nama dengan brand populer.
3. Summary harus menjelaskan secara spesifik kenapa URL ini berbahaya atau aman dalam Bahasa Indonesia.

Format JSON:
{
  "is_dangerous": boolean,
  "risk_score": number (0-100),
  "threat_type": string (misal: "Phishing", "Malware", "Typosquatting", "Social Engineering"),
  "domain_age": string,
  "ssl_status": "Valid" | "Tidak Valid" | "Tidak Ada",
  "summary": string (Bahasa Indonesia),
  "checks": {
    "domain_spoofing": boolean,
    "whois_hidden": boolean,
    "malware_clean": boolean,
    "ip_blacklisted": boolean
  }
}`;

    try {
      const raw = await askGemini(system, `Analisis URL ini: ${input}`);
      const data = parseJSON(raw);
      if (!data) throw new Error("Gagal parsing respons AI");
      renderUrl(data);
    } catch (err) {
      console.error(err);
      toast(
        "error",
        "Gagal Menganalisis",
        err.message || "Periksa koneksi internet atau API key.",
      );
    } finally {
      btn.innerHTML = origHTML;
      btn.disabled = false;
    }
  }

  function renderUrl(d) {
    const result = document.getElementById("url-result");
    result.classList.remove("hidden");
    result.classList.add("page-enter");
    setTimeout(() => result.classList.remove("page-enter"), 400);

    // Risk arc animasi
    setTimeout(() => {
      const arc = document.getElementById("risk-arc");
      const numEl = document.getElementById("risk-num");
      if (arc) arc.style.strokeDashoffset = 314 - (314 * d.risk_score) / 100;
      if (numEl) animateNumber(numEl, 0, d.risk_score, 1200);
      if (arc)
        arc.style.stroke =
          d.risk_score >= 70
            ? "#ef4444"
            : d.risk_score >= 40
              ? "#f59e0b"
              : "#22c55e";

      // Label risiko di bawah angka
      const riskLabel = result.querySelector(
        "#risk-num ~ span.text-xs.font-semibold, #risk-num + span + span",
      );
      if (riskLabel) {
        riskLabel.textContent =
          d.risk_score >= 70
            ? "Risiko Tinggi"
            : d.risk_score >= 40
              ? "Risiko Sedang"
              : "Risiko Rendah";
        riskLabel.className = `text-xs font-semibold mt-0.5 ${
          d.risk_score >= 70
            ? "text-red-400"
            : d.risk_score >= 40
              ? "text-yellow-400"
              : "text-green-400"
        }`;
      }
    }, 100);

    // Domain Age & SSL
    const metricBoxes = result.querySelectorAll(".metric-box");
    if (metricBoxes[0]) {
      const bold = metricBoxes[0].querySelector("p.font-bold");
      const sub = metricBoxes[0].querySelector("p.text-xs");
      if (bold) bold.textContent = d.domain_age;
      if (sub) {
        sub.textContent =
          d.risk_score >= 50 ? "Risiko Sangat Tinggi" : "Dalam Batas Wajar";
        sub.className = `text-xs mt-1 ${d.risk_score >= 50 ? "text-red-400" : "text-green-400"}`;
      }
    }
    if (metricBoxes[1]) {
      const bold = metricBoxes[1].querySelector("p.font-bold");
      const sub = metricBoxes[1].querySelector("p.text-xs");
      if (bold) bold.textContent = d.ssl_status;
      if (sub) {
        sub.textContent =
          d.ssl_status === "Valid"
            ? "Identitas Terverifikasi"
            : "Identitas Tidak Terverifikasi";
        sub.className = `text-xs mt-1 ${d.ssl_status === "Valid" ? "text-green-400" : "text-red-400"}`;
      }
    }

    // Warning card — hijau jika skor < 50, merah jika >= 50
    const warningBadge = result.querySelector(
      "[class*='badge-danger'].mb-2, [class*='badge-success'].mb-2",
    );
    const warningTitle = result.querySelector(
      ".glass-card h3.font-bold.text-lg",
    );
    const warningSummary = result.querySelector(
      ".glass-card .text-slate-400.text-sm.mt-1.leading-relaxed",
    );

    if (d.risk_score < 50) {
      if (warningBadge) {
        warningBadge.className =
          "badge-success-sm text-sm px-3 py-1 mb-2 inline-block";
        warningBadge.textContent = "✓ Terlihat Aman";
      }
      if (warningTitle) {
        warningTitle.textContent = "Situs Terlihat Aman";
        warningTitle.className = "font-bold text-lg text-green-400";
      }
    } else {
      if (warningBadge) {
        warningBadge.className = "badge-danger mb-2 inline-block";
        warningBadge.textContent = "⚠ Peringatan Kritis";
      }
      if (warningTitle) {
        warningTitle.textContent = "Potensi Situs Phishing";
        warningTitle.className = "font-bold text-lg";
      }
    }

    if (warningSummary) warningSummary.textContent = d.summary;

    // Check rows
    const checkRows = result.querySelectorAll(".check-row");
    const checks = [
      { fail: d.checks.domain_spoofing },
      { fail: d.checks.whois_hidden },
      { fail: !d.checks.malware_clean },
      { fail: d.checks.ip_blacklisted },
    ];
    checkRows.forEach((row, i) => {
      if (!checks[i]) return;
      const badge = row.querySelector("[class*='badge-']");
      if (badge) {
        badge.className = checks[i].fail
          ? "badge-danger-sm"
          : "badge-success-sm";
        badge.textContent = checks[i].fail ? "Gagal" : "Lulus";
      }
    });

    setTimeout(
      () => result.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
    toast(
      d.risk_score < 50 ? "success" : "warning",
      d.risk_score < 50 ? "✓ URL Aman" : "⚠ URL Berbahaya!",
      d.summary,
    );
  }

  /* ═══════════════════════════════════════════════════════
     ANALISIS PESAN — Gemini AI
  ═══════════════════════════════════════════════════════ */

  async function runMessage() {
    const input = document.getElementById("msg-input")?.value.trim();
    if (!input) {
      toast(
        "warning",
        "Input Kosong",
        "Masukkan teks pesan yang ingin dianalisis.",
      );
      document.getElementById("msg-input")?.focus();
      return;
    }

    const btn = document.getElementById("msg-submit");
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Menganalisis...';
    btn.disabled = true;
    document.getElementById("msg-placeholder").classList.remove("hidden");
    document.getElementById("msg-result").classList.add("hidden");

    const system = `Kamu adalah analis forensik digital yang sangat teliti dalam mendeteksi penipuan pesan (SMS/WhatsApp) di Indonesia.
Kembalikan HANYA valid JSON tanpa teks apapun di luar JSON, tanpa markdown.

Kamu harus mengenali pola-pola kritis ini:
1. Pancingan File APK (Undangan Nikah digital, Tagihan Kurir/JNE/Sicepat, Foto Paket).
2. Penipuan Menang Undian (Shopee, Lazada, Dana, dll).
3. Modus Kerja Freelance (Like & Subscribe YouTube berbayar).
4. Penagihan Hutang Palsu atau Ancaman Pinjol.

Instruksi:
- Jika ada kata "Instal", "APK", "Cek Paket", atau link ke domain mencurigakan, beri skor risiko Tinggi/Kritis.
- Red Flags harus menjelaskan secara detail apa yang mencurigakan bagi orang awam.

Format JSON:
{
  "is_scam": boolean,
  "risk_level": "Rendah" | "Sedang" | "Tinggi" | "Kritis",
  "confidence": number (0-100),
  "scam_type": string (misal: "APK Scam", "Lottery Fraud", "Social Engineering"),
  "summary": string (Bahasa Indonesia),
  "red_flags": [
    { "title": string, "description": string }
  ]
}`;

    try {
      const raw = await askGemini(system, `Analisis pesan ini:\n\n${input}`);
      const data = parseJSON(raw);
      if (!data) throw new Error("Gagal parsing respons AI");
      renderMessage(data);
    } catch (err) {
      console.error(err);
      toast(
        "error",
        "Gagal Menganalisis",
        err.message || "Periksa koneksi internet atau API key.",
      );
    } finally {
      btn.innerHTML = origHTML;
      btn.disabled = false;
    }
  }

  function renderMessage(d) {
    document.getElementById("msg-placeholder").classList.add("hidden");
    const result = document.getElementById("msg-result");
    result.classList.remove("hidden");
    result.classList.add("page-enter");
    setTimeout(() => result.classList.remove("page-enter"), 400);

    const badge = result.querySelector("[class*='badge-']");
    if (badge) {
      badge.className = d.is_scam
        ? "badge-danger"
        : "badge-success-sm text-sm px-3 py-1";
      badge.textContent = `${d.risk_level} Risk`;
    }

    const titleEl = result.querySelector("h4.font-bold");
    if (titleEl)
      titleEl.textContent = d.is_scam
        ? `${d.scam_type} Terdeteksi`
        : "Pesan Terlihat Aman";
    const subtitleEl = titleEl?.nextElementSibling;
    if (subtitleEl)
      subtitleEl.textContent = d.is_scam
        ? `Ditemukan ${d.red_flags.length} tanda bahaya kritis`
        : "Tidak ada tanda bahaya yang ditemukan";

    setTimeout(() => {
      const bar = document.getElementById("msg-progress");
      if (bar) bar.style.width = `${d.confidence}%`;
    }, 200);
    const confLabel = result
      .querySelector(".progress-track")
      ?.previousElementSibling?.querySelector(".font-bold");
    if (confLabel) confLabel.textContent = `${d.confidence}%`;

    const flagsContainer = result.querySelector(".space-y-2");
    if (flagsContainer) {
      flagsContainer.innerHTML =
        d.red_flags.length > 0
          ? d.red_flags
              .map(
                (flag) => `
            <div class="reason-card">
              <div class="icon-box-sm flex-shrink-0">
                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium">${flag.title}</p>
                <p class="text-slate-400 text-xs mt-0.5">${flag.description}</p>
              </div>
            </div>`,
              )
              .join("")
          : `<div class="reason-card">
             <div class="icon-box-sm flex-shrink-0">
               <svg class="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
               </svg>
             </div>
             <div>
               <p class="text-sm font-medium">Tidak ada tanda bahaya</p>
               <p class="text-slate-400 text-xs mt-0.5">Pesan ini terlihat aman berdasarkan analisis AI.</p>
             </div>
           </div>`;
    }

    toast(
      d.is_scam ? "warning" : "success",
      d.is_scam ? "⚠ Pesan Mencurigakan!" : "✓ Pesan Aman",
      d.summary,
    );
  }

  function resetMsg() {
    document.getElementById("msg-result")?.classList.add("hidden");
    document.getElementById("msg-placeholder")?.classList.remove("hidden");
    const bar = document.getElementById("msg-progress");
    if (bar) bar.style.width = "0%";
  }

  /* ═══════════════════════════════════════════════════════
     TOAST
  ═══════════════════════════════════════════════════════ */

  const TOAST_ICONS = {
    success: {
      bg: "bg-green-500/20",
      color: "text-green-400",
      svg: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    },
    warning: {
      bg: "bg-orange-500/20",
      color: "text-orange-400",
      svg: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
    },
    info: {
      bg: "bg-cyan-500/20",
      color: "text-cyan-400",
      svg: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    },
    error: {
      bg: "bg-red-500/20",
      color: "text-red-400",
      svg: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>',
    },
  };

  function toast(type, title, msg) {
    const el = document.getElementById("toast");
    const icon = document.getElementById("toast-icon");
    const t = document.getElementById("toast-title");
    const m = document.getElementById("toast-msg");
    const cfg = TOAST_ICONS[type] || TOAST_ICONS.info;

    icon.className = `w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.color}`;
    icon.innerHTML = cfg.svg;
    t.textContent = title;
    m.textContent = msg;

    el.classList.remove("hidden", "hide");
    el.classList.add("show");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      el.classList.add("hide");
      setTimeout(() => {
        el.classList.add("hidden");
        el.classList.remove("hide");
      }, 300);
    }, 3500);
  }

  /* ═══════════════════════════════════════════════════════
     ANIMASI & REVEAL
  ═══════════════════════════════════════════════════════ */

  function animateNumber(el, from, to, duration) {
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (to - from) * ease);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function runCounters(force = false) {
    if (countersRun && !force) return;
    countersRun = true;
    document.querySelectorAll(".counter").forEach((el) => {
      animateNumber(el, 0, parseInt(el.dataset.target), 3000);
    });
  }

  function runReveal() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 },
    );
    document
      .querySelectorAll(".reveal-card:not(.visible)")
      .forEach((el) => observer.observe(el));
  }

  function initStatsObserver() {
    const section = document.getElementById("stats");
    if (!section) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          runCounters();
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(section);
  }

  /* ═══════════════════════════════════════════════════════
     GLOBAL EVENT LISTENERS
  ═══════════════════════════════════════════════════════ */

  document.addEventListener("click", (e) => {
    const wrap = document.getElementById("nav-dropdown-wrap");
    if (wrap && !wrap.contains(e.target)) closeDropdown();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDropdown();
      closeMobile();
      closeAbout();
    }
  });

  /* ═══════════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════════ */

  function init() {
    const startPage = location.hash.replace("#", "") || "home";
    go(PAGES.includes(startPage) ? startPage : "home");
    initStatsObserver();
    setTimeout(runReveal, 200);
  }

  return {
    go,
    scrollStats,
    heroSearch,
    toggleDropdown,
    toggleMobile,
    showAbout,
    closeAbout,
    runChecker,
    reportNumber,
    runUrl,
    runMessage,
    resetMsg,
    toast,
    init,
  };
})();

window.Guardian = Guardian;

window.addEventListener("popstate", (e) => {
  const page = e.state?.page || "home";
  Guardian.go(page);
});
document.addEventListener("DOMContentLoaded", () => Guardian.init());
