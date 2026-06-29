/* === Google Maps Scraper Pro — Frontend === */
const $ = (s) => document.querySelector(s);

const queryInput     = $("#query");
const maxResultsInput= $("#maxResults");
const btnSearch      = $("#btnSearch");
const btnPause       = $("#btnPause");
const btnStop        = $("#btnStop");
const btnClear       = $("#btnClear");
const btnExportCsv   = $("#btnExportCsv");
const btnExportXlsx  = $("#btnExportXlsx");
const btnExportJson  = $("#btnExportJson");
const statusText     = $("#statusText");
const scrapedCount   = $("#scrapedCount");
const emailCount     = $("#emailCount");
const resultsBody    = $("#resultsBody");
const emptyState     = $("#emptyState");

let pollTimer = null;

/* --- API helpers --- */
async function api(path, opts = {}) {
    const resp = await fetch(path, {
        headers: { "Content-Type": "application/json" },
        ...opts,
    });
    return resp.json();
}

/* --- Search --- */
btnSearch.addEventListener("click", async () => {
    const query = queryInput.value.trim();
    if (!query) return queryInput.focus();

    btnSearch.disabled = true;
    const data = await api("/api/search", {
        method: "POST",
        body: JSON.stringify({
            query,
            max_results: parseInt(maxResultsInput.value) || 500,
        }),
    });
    if (data.error) {
        alert(data.error);
        btnSearch.disabled = false;
        return;
    }
    setRunning();
    startPoll();
});

/* --- Pause / Resume --- */
btnPause.addEventListener("click", async () => {
    if (statusText.textContent === "Paused") {
        await api("/api/resume", { method: "POST" });
        setRunning();
    } else {
        await api("/api/pause", { method: "POST" });
        setStatus("Paused", "paused");
        btnPause.textContent = "Resume";
    }
});

/* --- Stop --- */
btnStop.addEventListener("click", async () => {
    await api("/api/stop", { method: "POST" });
    stopPoll();
    setStatus("Done", "done");
    btnSearch.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    enableExport();
});

/* --- Clear --- */
btnClear.addEventListener("click", async () => {
    await api("/api/clear", { method: "POST" });
    stopPoll();
    resultsBody.innerHTML = "";
    emptyState.style.display = "block";
    setStatus("Idle", "");
    scrapedCount.textContent = "0";
    emailCount.textContent = "0";
    btnSearch.disabled = false;
    btnPause.disabled = true;
    btnStop.disabled = true;
    btnPause.textContent = "Pause";
    disableExport();
});

/* --- Export --- */
function enableExport() {
    btnExportCsv.disabled = false;
    btnExportXlsx.disabled = false;
    btnExportJson.disabled = false;
}
function disableExport() {
    btnExportCsv.disabled = true;
    btnExportXlsx.disabled = true;
    btnExportJson.disabled = true;
}

btnExportCsv.addEventListener("click", () => window.open("/api/export?format=csv"));
btnExportXlsx.addEventListener("click", () => window.open("/api/export?format=xlsx"));
btnExportJson.addEventListener("click", () => window.open("/api/export?format=json"));

/* --- Polling --- */
function startPoll() {
    stopPoll();
    pollTimer = setInterval(pollStatus, 1500);
}
function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollStatus() {
    const s = await api("/api/status");
    scrapedCount.textContent = s.scraped || 0;
    emailCount.textContent = s.emails_found || 0;

    if (s.status === "done") {
        stopPoll();
        setStatus("Done", "done");
        btnSearch.disabled = false;
        btnPause.disabled = true;
        btnStop.disabled = true;
        enableExport();
    } else if (s.status === "error") {
        stopPoll();
        setStatus("Error: " + s.error, "error");
        btnSearch.disabled = false;
        btnPause.disabled = true;
        btnStop.disabled = true;
    } else if (s.status === "paused") {
        // already handled by pause button
    }

    // Fetch new rows
    const resp = await api("/api/export?format=json");
    if (!resp.error) {
        renderRows(resp);
    }
}

/* --- Render --- */
function setRunning() {
    setStatus("Running…", "running");
    btnSearch.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
    btnPause.textContent = "Pause";
    disableExport();
}

function setStatus(text, cls) {
    statusText.textContent = text;
    statusText.className = cls;
}

function renderRows(rows) {
    if (!rows || rows.length === 0) {
        resultsBody.innerHTML = "";
        emptyState.style.display = "block";
        return;
    }
    emptyState.style.display = "none";

    // Only add new rows
    const existing = resultsBody.children.length;
    for (let i = existing; i < rows.length; i++) {
        const r = rows[i];
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${esc(r.business_name)}</td>
            <td>${esc(r.category)}</td>
            <td>${esc(r.address)}</td>
            <td>${esc(r.phone)}</td>
            <td>${esc(r.email)}</td>
            <td>${esc(r.website)}</td>
            <td>${esc(r.rating)}</td>
            <td>${esc(r.reviews)}</td>
        `;
        resultsBody.appendChild(tr);
    }
}

function esc(s) {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* --- Init: Enter key triggers search --- */
queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnSearch.click();
});
