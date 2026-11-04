/**
 * Universal Scraper — client-side (GitHub Pages)
 */
(() => {
  const STORE = new Map(); // key: normalized url → detail object
  let discovered = [];
  let scrapedNorm = new Set();
  let lastScrapedUrls = [];

  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");
  const grid = $("series-grid");
  const listCard = $("list-card");

  function showStatus(msg, type = "loading") {
    statusEl.textContent = msg;
    statusEl.className = "status show " + type;
  }

  function normalizeUrl(url) {
    try {
      const u = new URL(url.startsWith("http") ? url : "https://" + url);
      return (u.origin + u.pathname).replace(/\/+$/, "").toLowerCase();
    } catch {
      return (url || "").trim().toLowerCase();
    }
  }

  function sanitize(name) {
    return (name || "unknown")
      .replace(/[\\/*?:"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "unknown";
  }

  function proxyUrl(target) {
    const prefix = $("proxy").value;
    if (!prefix) return target;
    // allorigins & most proxies expect encoded URL
    if (prefix.includes("allorigins") || prefix.includes("codetabs")) {
      return prefix + encodeURIComponent(target);
    }
    // corsproxy.io also works with encodeURIComponent
    return prefix + encodeURIComponent(target);
  }

  async function fetchHtml(url) {
    const res = await fetch(proxyUrl(url), {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status + " untuk " + url);
    return await res.text();
  }

  async function fetchBinary(url) {
    try {
      const res = await fetch(proxyUrl(url));
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }

  function isSeriesUrl(href) {
    if (!href) return false;
    const h = href.toLowerCase();
    if (/\/chapter[-_/]?\d*/.test(h) || h.includes("/ch/")) return false;
    return [
      /\/manga\/[^/]+\/?$/,
      /\/manhwa\/[^/]+\/?$/,
      /\/manhua\/[^/]+\/?$/,
      /\/comic\/[^/]+\/?$/,
      /\/comics\/[^/]+\/?$/,
      /\/series\/[^/]+\/?$/,
      /\/title\/[^/]+\/?$/,
      /\/webtoon\/[^/]+\/?$/,
      /\/komik\/[^/]+\/?$/,
    ].some((re) => re.test(h));
  }

  function absolutize(base, href) {
    try {
      return new URL(href, base).href.split("#")[0].replace(/\/+$/, "");
    } catch {
      return href;
    }
  }

  function extractSeriesLinks(doc, baseUrl) {
    const found = new Map();
    doc.querySelectorAll("a[href]").forEach((a) => {
      const full = absolutize(baseUrl, a.getAttribute("href"));
      if (!isSeriesUrl(full)) return;
      const key = normalizeUrl(full);
      if (found.has(key)) return;

      let title = "";
      let cover = "";
      const parent =
        a.closest("div, article, li, figure") || a.parentElement;

      if (parent) {
        for (const sel of [".ctitle", ".title", "[class*='title']", "h3", "h2", "h4"]) {
          const el = parent.querySelector(sel);
          if (el) {
            const t = el.textContent.replace(/\s+/g, " ").trim();
            if (t.length > 2 && t.length < 120) {
              title = t;
              break;
            }
          }
        }
        const img = parent.querySelector("img") || a.querySelector("img");
        if (img) {
          cover =
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-lazy-src") ||
            "";
          if (!title) title = (img.getAttribute("alt") || "").trim();
          if (cover) cover = absolutize(baseUrl, cover);
        }
      }

      if (!title) {
        const img = a.querySelector("img");
        if (img) {
          title = (img.getAttribute("alt") || "").trim();
          cover =
            cover ||
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            "";
          if (cover) cover = absolutize(baseUrl, cover);
        }
      }

      if (!title) {
        title = a.textContent.replace(/\s+/g, " ").trim();
        title = title
          .replace(/^(project|manhwa|manhua|manga|hot|new)\s+/i, "")
          .replace(/^\d+(\.\d+)?\s+/, "")
          .trim();
      }

      if (title.length < 2) {
        title = full.split("/").pop().replace(/-/g, " ");
        title = title.replace(/\b\w/g, (c) => c.toUpperCase());
      }

      found.set(key, {
        url: full,
        title: title.slice(0, 120),
        cover_url: cover && !cover.startsWith("data:") ? cover : "",
      });
    });
    return Array.from(found.values());
  }

  function buildPageUrl(baseListUrl, page) {
    try {
      const u = new URL(baseListUrl);
      if (u.searchParams.has("page") || page > 1) {
        u.searchParams.set("page", String(page));
        return u.href;
      }
      let path = u.pathname.replace(/\/+$/, "");
      if (/\/page\/\d+$/.test(path)) {
        path = path.replace(/\/page\/\d+$/, "/page/" + page);
      } else {
        path = path + "/page/" + page;
      }
      u.pathname = path;
      u.search = "";
      return u.href;
    } catch {
      return baseListUrl + (baseListUrl.includes("?") ? "&" : "?") + "page=" + page;
    }
  }

  function extractDetail(doc, url) {
    const result = {
      url,
      title: "",
      alt_titles: "",
      synopsis: "",
      cover_url: "",
      chapter_list_url: url,
    };

    const h1 = doc.querySelector("h1");
    if (h1) result.title = h1.textContent.trim();

    if (!result.title) {
      const og = doc.querySelector('meta[property="og:title"]');
      if (og) result.title = (og.getAttribute("content") || "").trim();
    }
    if (!result.title) {
      const t = doc.querySelector("title");
      if (t)
        result.title = t.textContent
          .split("|")[0]
          .split("-")[0]
          .trim();
    }

    if (h1 && h1.nextElementSibling) {
      const txt = h1.nextElementSibling.textContent.replace(/\s+/g, " ").trim();
      if (
        txt.length > 15 &&
        txt.length < 300 &&
        !/chapter|rating|view|bookmark/i.test(txt)
      ) {
        result.alt_titles = txt;
      }
    }

    const synSels = [
      ".synopsis",
      "[class*='synopsis']",
      "[class*='description']",
      "[class*='summary']",
      ".desc",
      "#description",
      ".manga-summary",
      "div[itemprop='description']",
    ];
    for (const sel of synSels) {
      const el = doc.querySelector(sel);
      if (el) {
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (text.length > 40) {
          result.synopsis = text;
          break;
        }
      }
    }
    if (!result.synopsis) {
      for (const prop of ["og:description", "description"]) {
        const meta =
          doc.querySelector(`meta[property="${prop}"]`) ||
          doc.querySelector(`meta[name="${prop}"]`);
        if (meta) {
          const c = (meta.getAttribute("content") || "").trim();
          if (c.length > 40) {
            result.synopsis = c;
            break;
          }
        }
      }
    }

    const ogImg = doc.querySelector('meta[property="og:image"]');
    if (ogImg) result.cover_url = (ogImg.getAttribute("content") || "").trim();

    if (!result.cover_url) {
      const candidates = [];
      doc.querySelectorAll("img").forEach((img) => {
        const src =
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          "";
        if (!src || src.startsWith("data:")) return;
        const alt = (img.getAttribute("alt") || "").toLowerCase();
        const cls = (img.getAttribute("class") || "").toLowerCase();
        let score = 0;
        if (/cover|featured|poster/i.test(src)) score += 5;
        if (/cover|poster/.test(cls)) score += 4;
        if (result.title && alt.includes(result.title.toLowerCase())) score += 3;
        if (/logo|icon|avatar|banner|ads/i.test(src)) score -= 5;
        if (score > 0) candidates.push([score, absolutize(url, src)]);
      });
      candidates.sort((a, b) => b[0] - a[0]);
      if (candidates.length) result.cover_url = candidates[0][1];
    }

    if (result.cover_url && result.cover_url.startsWith("//")) {
      result.cover_url = "https:" + result.cover_url;
    }

    return result;
  }

  async function discoverList(url, maxPages) {
    const all = new Map();
    let pagesScraped = 0;
    for (let page = 1; page <= maxPages; page++) {
      const pageUrl = page === 1 ? url : buildPageUrl(url, page);
      showStatus(`Discover halaman ${page}/${maxPages}...`, "loading");
      let html;
      try {
        html = await fetchHtml(pageUrl);
      } catch (e) {
        if (page === 1) throw e;
        break;
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      pagesScraped++;
      const items = extractSeriesLinks(doc, pageUrl);
      let neu = 0;
      items.forEach((it) => {
        const k = normalizeUrl(it.url);
        if (!all.has(k)) {
          all.set(k, it);
          neu++;
        }
      });
      if (page > 1 && neu === 0) break;
      if (page < maxPages) await sleep(400);
    }
    const series = Array.from(all.values()).sort((a, b) =>
      (a.title || "").localeCompare(b.title || "")
    );
    return { type: "list", count: series.length, pages_scraped: pagesScraped, series };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function refreshStoreCount() {
    $("store-count").textContent = String(STORE.size);
  }

  function updateBatchHint() {
    const remaining = Array.from(grid.querySelectorAll(".series-item")).filter(
      (el) => !scrapedNorm.has(el.dataset.norm)
    ).length;
    const info = $("pages-info");
    const base = info.textContent.replace(/\s*·\s*sisa belum scrape: \d+/, "").replace(/\s*·\s*semua sudah di-scrape/, "");
    info.textContent =
      base +
      (remaining ? ` · sisa belum scrape: ${remaining}` : " · semua sudah di-scrape");
  }

  function renderList(series, pagesScraped) {
    discovered = series || [];
    $("found-count").textContent = String(discovered.length);
    $("pages-info").textContent = pagesScraped
      ? ` · ${pagesScraped} halaman`
      : "";
    grid.innerHTML = "";
    discovered.forEach((s) => {
      const norm = normalizeUrl(s.url);
      const already = scrapedNorm.has(norm) || STORE.has(norm);
      const div = document.createElement("div");
      div.className = "series-item" + (already ? " scraped" : " selected");
      div.dataset.norm = norm;
      div.innerHTML = `
        <input type="checkbox" ${already ? "" : "checked"} data-url="${s.url.replace(/"/g, "&quot;")}" />
        ${
          s.cover_url
            ? `<img src="${s.cover_url}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'" />`
            : `<div style="width:44px;height:62px;background:#0a0a0e;border-radius:6px;flex-shrink:0"></div>`
        }
        <div class="meta">
          <div class="t">${escapeHtml(s.title || "Untitled")}</div>
          <div class="u">${escapeHtml(s.url)}</div>
        </div>`;
      div.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        const cb = div.querySelector("input");
        cb.checked = !cb.checked;
        div.classList.toggle("selected", cb.checked);
      });
      div.querySelector("input").addEventListener("change", (e) => {
        div.classList.toggle("selected", e.target.checked);
      });
      grid.appendChild(div);
    });
    listCard.classList.remove("hidden");
    $("btn-dl-sel").disabled = true;
    updateBatchHint();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSelectedUrls() {
    return Array.from(grid.querySelectorAll("input[type=checkbox]:checked")).map(
      (cb) => cb.dataset.url
    );
  }

  function selectNextBatch() {
    const size = Math.max(1, Math.min(200, parseInt($("batch-size").value) || 80));
    grid.querySelectorAll(".series-item").forEach((el) => {
      el.querySelector("input").checked = false;
      el.classList.remove("selected");
    });
    let picked = 0;
    grid.querySelectorAll(".series-item").forEach((el) => {
      if (picked >= size) return;
      if (scrapedNorm.has(el.dataset.norm) || STORE.has(el.dataset.norm)) return;
      el.querySelector("input").checked = true;
      el.classList.add("selected");
      picked++;
    });
    updateBatchHint();
    if (picked === 0) showStatus("Semua series di list ini sudah pernah di-scrape", "success");
    else showStatus(`Dipilih ${picked} series yang belum di-scrape`, "success");
  }

  // --- events ---
  $("btn-all").onclick = () => {
    grid.querySelectorAll(".series-item").forEach((el) => {
      el.querySelector("input").checked = true;
      el.classList.add("selected");
    });
  };
  $("btn-none").onclick = () => {
    grid.querySelectorAll(".series-item").forEach((el) => {
      el.querySelector("input").checked = false;
      el.classList.remove("selected");
    });
  };
  $("btn-next-batch").onclick = selectNextBatch;

  $("btn-discover").onclick = async () => {
    let url = $("url").value.trim();
    const maxPages = Math.max(1, Math.min(20, parseInt($("max-pages").value) || 7));
    if (!url) return showStatus("Masukkan URL dulu", "error");
    if (!url.startsWith("http")) url = "https://" + url;

    showStatus("Discovering...", "loading");
    listCard.classList.add("hidden");

    try {
      const html = await fetchHtml(url);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const links = extractSeriesLinks(doc, url);

      if (links.length >= 3) {
        const data = await discoverList(url, maxPages);
        showStatus(
          `Ketemu ${data.count} series dari ${data.pages_scraped} halaman. Pilih yang mau di-scrape.`,
          "success"
        );
        renderList(data.series, data.pages_scraped);
      } else {
        const detail = extractDetail(doc, url);
        const key = normalizeUrl(url);
        if (!STORE.has(key)) STORE.set(key, detail);
        scrapedNorm.add(key);
        showStatus("Halaman series terdeteksi. Data sudah diambil.", "success");
        renderList(
          [
            {
              url: detail.url,
              title: detail.title || "Unknown",
              cover_url: detail.cover_url || "",
            },
          ],
          1
        );
        lastScrapedUrls = [url];
        $("btn-dl-sel").disabled = false;
        refreshStoreCount();
      }
    } catch (e) {
      showStatus(
        "Gagal: " + e.message + " — coba ganti CORS proxy.",
        "error"
      );
    }
  };

  $("btn-scrape-sel").onclick = async () => {
    const urls = getSelectedUrls();
    if (!urls.length) return showStatus("Pilih minimal 1 series", "error");
    if (urls.length > 200) return showStatus("Maksimal 200 per batch", "error");

    $("btn-scrape-sel").disabled = true;
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const key = normalizeUrl(url);
      showStatus(`Scraping ${i + 1}/${urls.length}: ${url}`, "loading");

      if (STORE.has(key)) {
        ok++;
        scrapedNorm.add(key);
        continue;
      }

      try {
        const html = await fetchHtml(url);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const detail = extractDetail(doc, url);
        STORE.set(key, detail);
        scrapedNorm.add(key);
        ok++;
      } catch (e) {
        fail++;
        console.warn(url, e);
      }
      await sleep(500);
    }

    lastScrapedUrls = urls;
    grid.querySelectorAll(".series-item").forEach((el) => {
      if (scrapedNorm.has(el.dataset.norm)) {
        el.classList.add("scraped");
        el.querySelector("input").checked = false;
        el.classList.remove("selected");
      }
    });

    $("btn-scrape-sel").disabled = false;
    $("btn-dl-sel").disabled = false;
    refreshStoreCount();
    updateBatchHint();
    const remaining = Array.from(grid.querySelectorAll(".series-item")).filter(
      (el) => !scrapedNorm.has(el.dataset.norm)
    ).length;
    showStatus(
      `Selesai! ${ok} berhasil` +
        (fail ? `, ${fail} gagal` : "") +
        `. Store: ${STORE.size}. Sisa belum scrape: ${remaining}`,
      "success"
    );
  };

  async function buildZip(entries) {
    const zip = new JSZip();
    for (const result of entries) {
      const folder = sanitize(result.title || "unknown");
      const info = [
        `Judul              : ${result.title || "-"}`,
        `Alternative Titles : ${result.alt_titles || "-"}`,
        `URL Series         : ${result.url || "-"}`,
        `Link Chapter List  : ${result.chapter_list_url || "-"}`,
        `Cover URL          : ${result.cover_url || "-"}`,
        "",
        "==================================================",
        "SINOPSIS",
        "==================================================",
        "",
        result.synopsis || "(tidak ditemukan)",
      ].join("\n");
      zip.file(folder + "/info.txt", info);

      if (result.cover_url) {
        const buf = await fetchBinary(result.cover_url);
        if (buf) {
          let ext = ".webp";
          const m = result.cover_url.match(/\.(webp|jpg|jpeg|png|gif)/i);
          if (m) ext = "." + m[1].toLowerCase();
          zip.file(folder + "/cover" + ext, buf);
        }
      }
    }
    return zip.generateAsync({ type: "blob" });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $("btn-dl-sel").onclick = async () => {
    const urls = lastScrapedUrls.length ? lastScrapedUrls : getSelectedUrls();
    const items = urls
      .map((u) => STORE.get(normalizeUrl(u)))
      .filter(Boolean);
    if (!items.length) return showStatus("Scrape dulu sebelum download", "error");
    showStatus("Menyiapkan ZIP...", "loading");
    try {
      const blob = await buildZip(items);
      downloadBlob(blob, "selected_series.zip");
      showStatus("ZIP berhasil didownload", "success");
    } catch (e) {
      showStatus("Error ZIP: " + e.message, "error");
    }
  };

  $("btn-dl-all").onclick = async () => {
    const items = Array.from(STORE.values());
    if (!items.length) return showStatus("Belum ada data", "error");
    showStatus("Menyiapkan ZIP semua data...", "loading");
    try {
      const blob = await buildZip(items);
      downloadBlob(blob, "all_series.zip");
      showStatus("ZIP berhasil didownload", "success");
    } catch (e) {
      showStatus("Error ZIP: " + e.message, "error");
    }
  };

  $("btn-csv").onclick = () => {
    const items = Array.from(STORE.values());
    if (!items.length) return showStatus("Belum ada data", "error");
    const header = ["title", "alt_titles", "synopsis", "cover_url", "chapter_list_url", "url"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    items.forEach((r) => {
      lines.push(header.map((h) => esc(r[h])).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(blob, "scraped_data.csv");
    showStatus("CSV didownload (tanpa duplikat)", "success");
  };

  $("btn-json").onclick = () => {
    const items = Array.from(STORE.values());
    if (!items.length) return showStatus("Belum ada data", "error");
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "scraped_data.json");
    showStatus("JSON didownload (tanpa duplikat)", "success");
  };

  $("btn-clear").onclick = () => {
    if (!confirm("Hapus semua data di memori?")) return;
    STORE.clear();
    scrapedNorm.clear();
    lastScrapedUrls = [];
    refreshStoreCount();
    grid.querySelectorAll(".series-item").forEach((el) => {
      el.classList.remove("scraped");
    });
    updateBatchHint();
    showStatus("Store dikosongkan", "success");
  };

  refreshStoreCount();
})();
