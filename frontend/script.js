/* ═══════════════════════════════════════════════════════
   RFP Scanner — Dashboard Logic
   ═══════════════════════════════════════════════════════ */

const API_BASE = "http://localhost:5001/api";

document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    loadStats();
    loadScorecards();
});

// ─── Navigation ─────────────────────────────────────────
function initNavigation() {
    document.querySelectorAll(".nav-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const view = tab.dataset.view;
            document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(`view-${view}`).classList.add("active");

            // Lazy-load views
            if (view === "outreach") loadOutreach();
            if (view === "alerts") loadAlerts();
            if (view === "leadership") loadLeadership();

            lucide.createIcons();
        });
    });

    // Filters
    document.getElementById("scorecardSearch").addEventListener("input", debounce(loadScorecards, 300));
    document.getElementById("tierFilter").addEventListener("change", loadScorecards);
    document.getElementById("productFilter").addEventListener("change", loadScorecards);
    document.getElementById("closeDetail").addEventListener("click", () => {
        document.getElementById("detailPanel").style.display = "none";
    });
}

// ─── Stats ──────────────────────────────────────────────
async function loadStats() {
    if (window.location.protocol === "file:") {
        console.warn("Direct file access detected. Browser security blocks local fetches.");
        document.querySelector(".stats-strip").style.opacity = "0.5";
        return;
    }
    try {
        const res = await fetch("../data/scorecards.json");
        const data = await res.json();
        const scorecards = data.scorecards || [];

        // Calculate stats client-side
        const highProb = scorecards.filter(s => (s.rfp_probability?.["90_days"] || 0) >= 0.5).length;
        const outreach = scorecards.filter(s => s.outreach?.priority_tier === "immediate" || s.outreach?.priority_tier === "high").length;

        document.getElementById("stat-total").textContent = data.total_accounts || scorecards.length;
        document.getElementById("stat-high-prob").textContent = highProb;
        document.getElementById("stat-outreach").textContent = outreach;

        // Load alerts count
        const alertRes = await fetch("../data/alerts.json");
        const alertData = await alertRes.json();
        document.getElementById("stat-alerts").textContent = alertData.length || 0;
        document.getElementById("alert-badge").textContent = alertData.length || 0;

        if (data.last_updated) {
            document.getElementById("lastUpdated").textContent = `Updated ${new Date(data.last_updated).toLocaleDateString()}`;
        }
    } catch (e) {
        console.warn("Stats unavailable:", e);
    }
}

// ─── Scorecards ─────────────────────────────────────────
async function loadScorecards() {
    if (window.location.protocol === "file:") {
        renderEmptyState("scorecardsBody", "shield-alert", "Browser Security Block",
            "Chrome blocks data loading from local files. Please view your <strong>Public Dashboard Link</strong> for the presentation.");
        return;
    }
    const search = document.getElementById("scorecardSearch").value.toLowerCase();
    const tier = document.getElementById("tierFilter").value;
    const product = document.getElementById("productFilter").value;

    try {
        const res = await fetch("../data/scorecards.json");
        const data = await res.json();
        let scorecards = data.scorecards || [];

        // Apply filters client-side
        if (search) {
            scorecards = scorecards.filter(s => s.account_name.toLowerCase().includes(search));
        }
        if (tier) {
            scorecards = scorecards.filter(s => s.tier === tier);
        }
        if (product) {
            scorecards = scorecards.filter(s => s.product_fit?.some(p => p.product === product));
        }

        renderScorecards(scorecards);
    } catch (e) {
        renderEmptyState("scorecardsBody", "radar", "No Data Yet", "Run the pipeline to generate scorecards.");
    }
}

function renderScorecards(scorecards) {
    const tbody = document.getElementById("scorecardsBody");

    if (!scorecards.length) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:40px; color:var(--text-secondary);">
            No scorecards available. Run: <code>python3 orchestrator.py</code></td></tr>`;
        return;
    }

    tbody.innerHTML = scorecards.map(s => {
        const prob90 = s.rfp_probability?.["90_days"] ?? 0;
        const prob180 = s.rfp_probability?.["180_days"] ?? 0;
        const topProduct = s.product_fit?.[0]?.product || "—";
        const conf = s.confidence || "low";

        return `
        <tr onclick='showDetail(${JSON.stringify(s).replace(/'/g, "&#39;")})'>
            <td><strong>${s.account_name || "—"}</strong></td>
            <td><span class="tier-badge">${s.tier || "—"}</span></td>
            <td class="prob-cell ${probClass(prob90)}">${(prob90 * 100).toFixed(0)}%</td>
            <td class="prob-cell ${probClass(prob180)}">${(prob180 * 100).toFixed(0)}%</td>
            <td><span class="confidence-badge confidence-${conf}">${conf}</span></td>
            <td><span class="product-tag">${topProduct}</span></td>
            <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.initiative_theme || "—"}</td>
            <td>${s.signals_count || 0}</td>
            <td style="font-size:12px; color:var(--text-secondary);">${s.ae || "—"}</td>
        </tr>`;
    }).join("");
}

function probClass(val) {
    if (val >= 0.5) return "prob-high";
    if (val >= 0.2) return "prob-medium";
    return "prob-low";
}

function showDetail(card) {
    const panel = document.getElementById("detailPanel");
    const content = document.getElementById("detailContent");

    const prob = card.rfp_probability || {};
    const products = (card.product_fit || []).map(p =>
        `<li><strong>${p.product}</strong> (${p.fit_score}/100) — ${p.rationale || ""}</li>`
    ).join("");
    const evidence = (card.top_evidence || []).map(e =>
        `<li><strong>${e.signal}</strong> <span style="color:var(--text-secondary)">(${e.source}, ${e.date})</span><br>${e.relevance || ""}</li>`
    ).join("");
    const outreach = card.outreach || {};

    content.innerHTML = `
        <h2 style="font-size:24px; font-weight:700; margin-bottom:4px;">${card.account_name}</h2>
        <p style="color:var(--text-secondary); margin-bottom:24px;">${card.tier || ""} · ${card.state || ""} · AE: ${card.ae || "—"} · SDR: ${card.sdr || "—"}</p>

        <div class="detail-section">
            <h3>RFP Probability</h3>
            <div style="display:flex; gap:16px;">
                <div><span style="font-size:32px; font-weight:800;" class="${probClass(prob["90_days"] || 0)}">${((prob["90_days"] || 0) * 100).toFixed(0)}%</span><br><span class="metric-label">90 days</span></div>
                <div><span style="font-size:32px; font-weight:800;" class="${probClass(prob["180_days"] || 0)}">${((prob["180_days"] || 0) * 100).toFixed(0)}%</span><br><span class="metric-label">180 days</span></div>
            </div>
        </div>

        <div class="detail-section">
            <h3>Confidence: ${card.confidence || "—"}</h3>
            <p>${(card.uncertainty_drivers || []).join("; ") || "—"}</p>
        </div>

        ${card.predicted_rfp_window ? `<div class="detail-section"><h3>Predicted RFP Window</h3><p>${card.predicted_rfp_window.earliest || "?"} → ${card.predicted_rfp_window.latest || "?"}</p></div>` : ""}

        <div class="detail-section">
            <h3>Product Fit</h3>
            <ul>${products || "<li>—</li>"}</ul>
        </div>

        <div class="detail-section">
            <h3>Initiative Theme</h3>
            <p>${card.initiative_theme || "—"}</p>
        </div>

        <div class="detail-section">
            <h3>Top Evidence</h3>
            <ul>${evidence || "<li>—</li>"}</ul>
        </div>

        ${card.competitive_landscape ? `
        <div class="detail-section">
            <h3>Competitive Landscape</h3>
            <p>Detected: ${(card.competitive_landscape.competitors_detected || []).join(", ") || "None"} (${card.competitive_landscape.confidence || "low"})</p>
        </div>` : ""}

        <div class="detail-section" style="background:var(--bg); padding:16px; border-radius:var(--radius-md);">
            <h3>Outreach Recommendation</h3>
            <p><strong>Why now:</strong> ${outreach.why_now || "—"}</p>
            <p><strong>Target:</strong> ${outreach.target_persona || "—"}</p>
            <p><strong>Action:</strong> ${outreach.suggested_action || "—"}</p>
            <p><strong>Asset:</strong> ${outreach.suggested_asset || "—"}</p>
            <p><strong>Priority:</strong> <span class="tier-badge">${outreach.priority_tier || "standard"}</span></p>
        </div>
    `;

    panel.style.display = "block";
    lucide.createIcons();
}

// ─── Outreach ───────────────────────────────────────────
async function loadOutreach() {
    try {
        const res = await fetch("../data/outreach_list.json");
        const data = await res.json();
        const grid = document.getElementById("outreachGrid");

        const list = data.outreach_list || data || [];
        if (!list.length) {
            grid.innerHTML = emptyHTML("send", "No Outreach Actions", "Run the pipeline to generate recommendations.");
            return;
        }

        grid.innerHTML = list.map((item, idx) => `
            <div class="outreach-card">
                <div class="outreach-rank">${item.rank || (idx + 1)}</div>
                <h4>${item.account_name}</h4>
                <div class="outreach-meta">
                    <span class="tier-badge">${item.tier || "—"}</span>
                    <span class="product-tag">${item.top_product || "—"}</span>
                    <span class="prob-cell ${probClass(item.rfp_prob_90d || 0)}">${((item.rfp_prob_90d || 0) * 100).toFixed(0)}% (90d)</span>
                </div>
                <div class="outreach-why">${item.why_now || "—"}</div>
                <div class="outreach-actions">
                    <span class="outreach-action-tag">🎯 ${item.target_persona || "—"}</span>
                    <span class="outreach-action-tag">💡 ${item.suggested_action || "—"}</span>
                    <span class="outreach-action-tag">👤 ${item.ae || "—"}</span>
                </div>
            </div>
        `).join("");
    } catch (e) {
        console.warn("Outreach data unavailable:", e);
    }
}

// ─── Alerts ─────────────────────────────────────────────
async function loadAlerts() {
    try {
        const res = await fetch("../data/alerts.json");
        const data = await res.json();
        const feed = document.getElementById("alertsFeed");

        if (!data.length) {
            feed.innerHTML = emptyHTML("bell", "No Alerts", "Procurement signals will appear here when detected.");
            return;
        }

        feed.innerHTML = data.map(a => {
            const typeClass = a.doc_type === "award" ? "award" : a.doc_type === "RFI" ? "rfi" : "";
            return `
            <div class="alert-card ${typeClass}">
                <div class="alert-header">
                    <div>
                        <strong>${a.account_name}</strong>
                        <span style="font-size:12px; color:var(--text-secondary); margin-left:8px;">${new Date(a.created_at || Date.now()).toLocaleDateString()}</span>
                    </div>
                    <span class="alert-type-badge">${a.doc_type || "RFP"}</span>
                </div>
                <p style="font-weight:600; margin-bottom:4px;">${a.headline}</p>
                <p style="color:var(--text-secondary); font-size:13px; margin-bottom:8px;">${a.summary || ""}</p>
                ${a.deadline ? `<p style="color:var(--red); font-size:13px; font-weight:600;">⏰ Deadline: ${a.deadline}</p>` : ""}
                <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                    ${(a.products_relevant || []).map(p => `<span class="product-tag">${p}</span>`).join("")}
                </div>
                <p style="font-size:12px; margin-top:8px; color:var(--text-secondary);">
                    Route: ${a.routing?.ae || "—"} · ${a.routing?.tier || ""}
                </p>
                ${a.source_url && a.source_url !== "#" ? `<a href="${a.source_url}" target="_blank" style="font-size:12px; color:var(--accent);">View Source →</a>` : ""}
            </div>`;
        }).join("");
    } catch (e) {
        console.warn("Alerts unavailable:", e);
    }
}

// ─── Leadership ─────────────────────────────────────────
async function loadLeadership() {
    try {
        const res = await fetch("../data/scorecards.json");
        const data = await res.json();
        const scorecards = data.scorecards || [];

        // Pipeline Forecast
        const high90 = scorecards.filter(s => (s.rfp_probability?.["90_days"] || 0) >= 0.5).length;
        const high180 = scorecards.filter(s => (s.rfp_probability?.["180_days"] || 0) >= 0.5).length;

        document.getElementById("pipelineContent").innerHTML = `
            <div style="display:flex; gap:32px; margin-bottom:16px;">
                <div><span class="metric-big">${high90}</span><br><span class="metric-label">Likely RFP in 90 days</span></div>
                <div><span class="metric-big" style="color:var(--orange);">${high180}</span><br><span class="metric-label">Likely RFP in 180 days</span></div>
            </div>
            <p style="font-size:13px; color:var(--text-secondary);">Accounts tracked: ${scorecards.length}</p>
        `;

        // Product Demand
        const demand = {};
        scorecards.forEach(s => {
            (s.product_fit || []).forEach(p => {
                demand[p.product] = (demand[p.product] || 0) + 1;
            });
        });
        const maxDemand = Math.max(...Object.values(demand), 1);
        document.getElementById("productContent").innerHTML = Object.entries(demand)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => `
                <div class="bar-row">
                    <span class="bar-label">${name}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${(count / maxDemand * 100)}%"></div></div>
                    <span class="bar-value">${count}</span>
                </div>
            `).join("") || "<p>No data</p>";

        // Distribution by Tier
        const tiers = ["Strategics", "Top", "Enterprises"];
        document.getElementById("tierContent").innerHTML = tiers.map(t => {
            const total = scorecards.filter(s => s.tier === t).length;
            const highProb = scorecards.filter(s => s.tier === t && (s.rfp_probability?.["90_days"] || 0) >= 0.5).length;
            return `
                <div class="bar-row">
                    <span class="bar-label">${t}</span>
                    <div class="bar-track"><div class="bar-fill" style="width:${(highProb / Math.max(total, 1) * 100)}%"></div></div>
                    <span class="bar-value">${highProb}/${total}</span>
                </div>
            `;
        }).join("");

    } catch (e) {
        console.warn("Leadership data unavailable:", e);
    }
}

// ─── Utilities ──────────────────────────────────────────
function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

function emptyHTML(icon, title, desc) {
    return `<div class="empty-state"><i data-lucide="${icon}"></i><h3>${title}</h3><p>${desc}</p></div>`;
}

function renderEmptyState(containerId, icon, title, desc) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<tr><td colspan="10">${emptyHTML(icon, title, desc)}</td></tr>`;
}
