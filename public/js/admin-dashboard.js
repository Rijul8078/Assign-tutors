const token = localStorage.getItem("admin_token") || "";
let socket = null;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
if (!token) window.location.href = "/pages/admin-login.html";

const views = document.querySelectorAll(".portal-view");
document.querySelectorAll(".portal-nav a").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelectorAll(".portal-nav a").forEach((x) => x.classList.remove("active"));
    a.classList.add("active");
    const key = a.dataset.view;
    views.forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${key}`).classList.add("active");
  });
});

document.getElementById("logout").addEventListener("click", () => {
  localStorage.removeItem("admin_token");
  window.location.href = "/pages/admin-login.html";
});

const q = (id) => document.getElementById(id);
let ordersCache = [];
const pendingRefBody = document.querySelector("#pending-ref-table tbody");
const discountBody = document.querySelector("#discount-table tbody");
const leadBody = document.querySelector("#lead-table tbody");
const announcementBody = document.querySelector("#announcement-table tbody");
const currencySelect = document.getElementById("currency-select-admin");
const FX = { INR: 1, GBP: 0.0094, USD: 0.012, AUD: 0.018, CAD: 0.016, EUR: 0.011, AED: 0.044 };
let activeCurrency = localStorage.getItem("admin_currency") || "INR";

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const converted = n * (FX[activeCurrency] || 1);
  return `${activeCurrency} ${converted.toFixed(2)}`;
}

function setupDropzone(zone, input) {
  ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  });
}

setupDropzone(q("solution-dropzone"), q("solution-file"));
setupDropzone(q("admin-chat-dropzone"), q("m-file"));

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...opts, headers });
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new Error(`Invalid response (${res.status})`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function uploadWithProgress(url, formData, progressEl) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      progressEl.value = Math.round((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      progressEl.value = 0;
      try {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Invalid response (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

async function loadStudents() {
  const data = await api("/api/admin/students");
  const sel = q("o-student");
  sel.innerHTML = "";
  data.students.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.full_name} (${s.email})`;
    sel.appendChild(opt);
  });
  q("kpi-students").textContent = data.students.length;
}

function fillOrderSelects() {
  ["u-order", "m-order", "f-order"].forEach((id) => {
    const el = q(id);
    el.innerHTML = "";
    ordersCache.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = `${o.order_code} - ${o.student_name}`;
      el.appendChild(opt);
    });
  });
}

async function loadOrders() {
  const data = await api("/api/admin/orders");
  ordersCache = data.orders;
  const body = document.querySelector("#admin-orders tbody");
  body.innerHTML = "";
  let sum = 0;
  data.orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${o.order_code}</td><td>${o.student_name}</td><td>${o.status}</td><td><div class="progress"><span style="width:${o.progress_percent}%"></span></div>${o.progress_percent}%</td><td>${formatMoney(o.budget_total)}</td><td>${formatMoney(o.paid_amount)}</td><td>${formatMoney(o.due_payment)}</td>`;
    body.appendChild(tr);
    sum += Number(o.progress_percent || 0);
  });
  q("kpi-orders").textContent = data.orders.length;
  q("kpi-progress").textContent = `${data.orders.length ? Math.round(sum / data.orders.length) : 0}%`;
  fillOrderSelects();
}

async function loadAnnouncements() {
  const data = await api("/api/admin/announcements");
  announcementBody.innerHTML = "";
  (data.announcements || []).forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.created_at || "-"}</td>
      <td>${a.title}</td>
      <td>${a.message}</td>
      <td>${Number(a.is_active) === 1 ? "Active" : "Inactive"}</td>
      <td><button class="btn btn-outline" data-announcement-toggle="${a.id}" data-val="${Number(a.is_active) === 1 ? 0 : 1}">${Number(a.is_active) === 1 ? "Deactivate" : "Activate"}</button></td>
    `;
    announcementBody.appendChild(tr);
  });
}

async function loadAdminChat() {
  const id = Number(q("m-order").value || 0);
  if (!id) return;
  const data = await api(`/api/admin/orders/${id}/messages`).catch(() => ({ messages: [] }));
  const box = q("admin-chat-box");
  box.innerHTML = (data.messages || []).map((m) => `<p><strong>${m.sender_name} (${m.sender_role})</strong><br>${m.message}${m.file_path ? `<br><a href="${m.file_path}" target="_blank" rel="noopener">📎 ${m.file_original_name}</a>` : ""}</p>`).join("");
  box.scrollTop = box.scrollHeight;
}

async function loadAdminFiles() {
  const id = Number(q("f-order").value || 0);
  if (!id) return;
  const data = await api(`/api/admin/orders/${id}/files`);
  q("admin-file-list").innerHTML = data.files.map((f) => `<p><strong>${f.file_kind}</strong> by ${f.uploader_name}<br><a href="${f.file_path}" target="_blank" rel="noopener">${f.file_original_name}</a></p>`).join("") || "<p>No files yet.</p>";
}

async function loadPendingReferrals() {
  const data = await api("/api/admin/referrals/pending");
  pendingRefBody.innerHTML = "";
  (data.pending || []).forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.enquiry_id}</td>
      <td>${r.full_name}<br>${r.email}<br>${r.phone}</td>
      <td>${r.referrer_name || "-"}<br>${r.referrer_email || "-"}</td>
      <td>${r.referral_code_input || "-"}</td>
      <td>
        <button class="btn btn-primary" data-act="approve" data-id="${r.enquiry_id}">Approve</button>
        <button class="btn btn-outline" data-act="reject" data-id="${r.enquiry_id}">Reject</button>
      </td>`;
    pendingRefBody.appendChild(tr);
  });
}

async function loadLeads() {
  const status = q("lead-status")?.value || "";
  const search = q("lead-search")?.value.trim() || "";
  const from = q("lead-from")?.value || "";
  const to = q("lead-to")?.value || "";
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const data = await api(`/api/admin/enquiries?${params.toString()}`);
  leadBody.innerHTML = "";
  (data.enquiries || []).forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.created_at || "-"}</td>
      <td>${r.full_name || "-"}</td>
      <td>${r.email || "-"}<br>${r.phone || "-"}</td>
      <td>${r.course_subject || "-"}<br>${r.assignment_type || "-"}</td>
      <td>${r.deadline || "-"}</td>
      <td>${r.budget || "-"}</td>
      <td>${r.referral_code_input || "-"}<br>${r.referral_status || "-"}</td>
      <td>${r.file_path ? `<a href="${r.file_path}" target="_blank" rel="noopener">Open</a>` : "-"}</td>
    `;
    leadBody.appendChild(tr);
  });
  q("lead-msg").textContent = `Loaded ${data.enquiries.length} leads.`;
}

async function loadIntegrationStatus() {
  try {
    const data = await api("/api/admin/integrations/status");
    const db = data.integrations?.database?.connected ? "DB: Connected" : "DB: Not Connected";
    const mail = data.integrations?.email?.configured ? "Email: Configured" : "Email: Not Configured";
    const ga = data.integrations?.ga4?.configured ? "GA4: Configured" : "GA4: Not Configured";
    const sb = data.integrations?.supabase?.configured ? "Supabase: Configured" : "Supabase: Not Configured";
    q("admin-welcome").textContent = `${db} | ${mail} | ${ga} | ${sb}`;
  } catch {
    q("admin-welcome").textContent = "Workspace";
  }
}

function discountLabel(row) {
  if (row.discount_type === "fixed") return `${row.discount_value} off`;
  return `${row.discount_value}% off`;
}

async function loadDiscountCodes() {
  const data = await api("/api/admin/discount-codes");
  discountBody.innerHTML = "";
  (data.discount_codes || []).forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${d.code}</strong></td>
      <td>${d.title}<br><small>${discountLabel(d)}</small></td>
      <td><small>${d.starts_at || "-"}<br>${d.ends_at || "-"}</small></td>
      <td>${Number(d.is_active) === 1 ? "Active" : "Inactive"}</td>
      <td>${Number(d.show_on_website) === 1 ? "Visible" : "Hidden"}</td>
      <td>
        <button class="btn btn-outline" data-discount-act="toggle-active" data-id="${d.id}" data-val="${Number(d.is_active) === 1 ? 0 : 1}">
          ${Number(d.is_active) === 1 ? "Deactivate" : "Activate"}
        </button>
        <button class="btn btn-outline" data-discount-act="toggle-show" data-id="${d.id}" data-val="${Number(d.show_on_website) === 1 ? 0 : 1}">
          ${Number(d.show_on_website) === 1 ? "Hide" : "Show"}
        </button>
      </td>`;
    discountBody.appendChild(tr);
  });
}

q("create-student").addEventListener("click", async () => {
  try {
    await api("/api/admin/students", {
      method: "POST",
      body: JSON.stringify({ full_name: q("s-name").value.trim(), email: q("s-email").value.trim(), phone: q("s-phone").value.trim(), password: q("s-pass").value })
    });
    q("student-msg").textContent = "Student account created.";
    await loadStudents();
  } catch (e) { q("student-msg").textContent = e.message; }
});

q("create-order").addEventListener("click", async () => {
  try {
    const data = await api("/api/admin/orders", {
      method: "POST",
      body: JSON.stringify({
        student_id: Number(q("o-student").value),
        title: q("o-title").value.trim(),
        subject: q("o-subject").value.trim(),
        assignment_type: q("o-type").value.trim(),
        deadline: q("o-deadline").value,
        budget_total: q("o-budget").value || null,
        paid_amount: q("o-paid").value || 0,
        due_payment: q("o-due").value || null,
        description: q("o-desc").value.trim()
      })
    });
    q("order-msg").textContent = `Created ${data.order_code}`;
    await loadOrders();
  } catch (e) { q("order-msg").textContent = e.message; }
});

q("update-order").addEventListener("click", async () => {
  try {
    const id = Number(q("u-order").value);
    await api(`/api/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: q("u-status").value.trim(),
        progress_percent: Number(q("u-progress").value || 0),
        budget_total: q("u-budget").value || null,
        paid_amount: q("u-paid").value || null,
        due_payment: q("u-due").value || null,
        description: q("u-desc").value.trim()
      })
    });
    q("update-msg").textContent = "Order updated.";
    await loadOrders();
  } catch (e) { q("update-msg").textContent = e.message; }
});

q("send-admin-msg").addEventListener("click", async () => {
  try {
    const orderId = Number(q("m-order").value);
    const text = q("m-text").value.trim();
    const fileEl = q("m-file");
    if (!text && !fileEl.files[0]) return;
    const fd = new FormData();
    if (text) fd.append("message", text);
    if (fileEl.files[0]) fd.append("file", fileEl.files[0]);
    await uploadWithProgress(`/api/admin/orders/${orderId}/messages`, fd, q("admin-chat-upload-progress"));
    q("m-text").value = "";
    fileEl.value = "";
    q("m-status").textContent = "Message sent.";
    await loadAdminChat();
  } catch (e) { q("m-status").textContent = e.message; }
});

q("upload-solution").addEventListener("click", async () => {
  try {
    const id = Number(q("f-order").value || 0);
    const f = q("solution-file").files[0];
    if (!id || !f) return;
    const fd = new FormData();
    fd.append("file", f);
    await uploadWithProgress(`/api/admin/orders/${id}/files`, fd, q("solution-upload-progress"));
    q("solution-file").value = "";
    q("file-msg").textContent = "Solution uploaded.";
    await loadAdminFiles();
  } catch (e) { q("file-msg").textContent = e.message; }
});
q("load-leads").addEventListener("click", () => {
  loadLeads().catch((e) => { q("lead-msg").textContent = e.message; });
});
q("export-leads").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const res = await fetch("/api/admin/enquiries/export.csv", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    q("lead-msg").textContent = err.message || "Export failed";
  }
});
q("sync-supabase").addEventListener("click", async () => {
  try {
    const out = await api("/api/admin/supabase/sync-all", { method: "POST", body: JSON.stringify({}) });
    const count = Object.values(out.summary || {}).reduce((a, b) => a + Number(b || 0), 0);
    q("admin-welcome").textContent = `Supabase sync done (${count} rows).`;
    await loadIntegrationStatus();
  } catch (err) {
    q("admin-welcome").textContent = `Supabase sync failed: ${err.message}`;
  }
});

q("create-discount").addEventListener("click", async () => {
  try {
    await api("/api/admin/discount-codes", {
      method: "POST",
      body: JSON.stringify({
        code: q("d-code").value.trim(),
        title: q("d-title").value.trim(),
        description: q("d-desc").value.trim(),
        discount_type: q("d-type").value,
        discount_value: Number(q("d-value").value || 0),
        starts_at: q("d-start").value || null,
        ends_at: q("d-end").value || null,
        is_active: Number(q("d-active").value) === 1,
        show_on_website: Number(q("d-show").value) === 1
      })
    });
    q("discount-msg").textContent = "Discount code created.";
    ["d-code", "d-title", "d-value", "d-start", "d-end", "d-desc"].forEach((id) => { q(id).value = ""; });
    q("d-type").value = "percent";
    q("d-show").value = "1";
    q("d-active").value = "1";
    await loadDiscountCodes();
  } catch (e) {
    q("discount-msg").textContent = e.message;
  }
});
q("post-announcement").addEventListener("click", async () => {
  try {
    await api("/api/admin/announcements", {
      method: "POST",
      body: JSON.stringify({
        title: q("a-title").value.trim(),
        message: q("a-message").value.trim(),
        is_active: Number(q("a-active").value) === 1
      })
    });
    q("announcement-msg").textContent = "Announcement posted.";
    q("a-title").value = "";
    q("a-message").value = "";
    q("a-active").value = "1";
    await loadAnnouncements();
  } catch (e) {
    q("announcement-msg").textContent = e.message;
  }
});

q("m-order").addEventListener("change", loadAdminChat);
q("f-order").addEventListener("change", loadAdminFiles);
pendingRefBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const act = btn.dataset.act;
  try {
    if (act === "approve") {
      await api(`/api/admin/referrals/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
    } else {
      await api(`/api/admin/referrals/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
    }
    q("ref-action-msg").textContent = `Referral ${act}d.`;
    await loadPendingReferrals();
  } catch (err) {
    q("ref-action-msg").textContent = err.message;
  }
});
discountBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-discount-act]");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const val = Number(btn.dataset.val) === 1;
  const act = btn.dataset.discountAct;
  try {
    if (act === "toggle-active") {
      await api(`/api/admin/discount-codes/${id}`, { method: "PATCH", body: JSON.stringify({ is_active: val }) });
    } else {
      await api(`/api/admin/discount-codes/${id}`, { method: "PATCH", body: JSON.stringify({ show_on_website: val }) });
    }
    q("discount-msg").textContent = "Discount code updated.";
    await loadDiscountCodes();
  } catch (err) {
    q("discount-msg").textContent = err.message;
  }
});
announcementBody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-announcement-toggle]");
  if (!btn) return;
  try {
    await api(`/api/admin/announcements/${Number(btn.dataset.announcementToggle)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: Number(btn.dataset.val) === 1 })
    });
    await loadAnnouncements();
  } catch (err) {
    q("announcement-msg").textContent = err.message;
  }
});
if (currencySelect) {
  currencySelect.value = activeCurrency;
  currencySelect.addEventListener("change", async () => {
    activeCurrency = currencySelect.value;
    localStorage.setItem("admin_currency", activeCurrency);
    await loadOrders();
  });
}

function connectRealtime() {
  if (typeof io === "undefined") return;
  socket = io({ auth: { token } });
  socket.on("message:new", ({ order_id }) => {
    const selected = Number(q("m-order").value || 0);
    if (selected && selected === Number(order_id)) loadAdminChat().catch(() => {});
  });
  socket.on("order:updated", () => {
    loadOrders().catch(() => {});
    loadAdminFiles().catch(() => {});
  });
}

connectRealtime();

(async () => {
  try {
    await loadStudents();
    await loadIntegrationStatus();
    await loadOrders();
    await loadAdminChat();
    await loadAdminFiles();
    await loadLeads();
    await loadDiscountCodes();
    await loadAnnouncements();
    await loadPendingReferrals();
    setInterval(loadOrders, 10000);
    setInterval(loadIntegrationStatus, 30000);
    setInterval(loadAdminChat, 5000);
    setInterval(loadAdminFiles, 10000);
    setInterval(loadDiscountCodes, 15000);
    setInterval(loadAnnouncements, 30000);
    setInterval(loadPendingReferrals, 15000);
  } catch {
    localStorage.removeItem("admin_token");
    window.location.href = "/pages/admin-login.html";
  }
})();
