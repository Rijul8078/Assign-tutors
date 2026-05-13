const token = localStorage.getItem("student_token") || "";
let socket = null;
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
if (!token) window.location.href = "/pages/student-login.html";

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
  localStorage.removeItem("student_token");
  localStorage.removeItem("student_user");
  window.location.href = "/pages/student-login.html";
});

const ordersBody = document.querySelector("#orders-table tbody");
const chatOrder = document.getElementById("chat-order");
const chatBox = document.getElementById("chat-box");
const chatMessage = document.getElementById("chat-message");
const chatFile = document.getElementById("chat-file");
const chatDropzone = document.getElementById("chat-dropzone");
const chatUploadProgress = document.getElementById("chat-upload-progress");
const notifBox = document.getElementById("notif-box");
const notifCount = document.getElementById("notif-count");
const navChatBadge = document.getElementById("nav-chat-badge");
const fileOrder = document.getElementById("file-order");
const fileList = document.getElementById("file-list");
const studentFile = document.getElementById("student-file");
const studentDropzone = document.getElementById("student-dropzone");
const fileStatus = document.getElementById("file-status");
const studentUploadProgress = document.getElementById("student-upload-progress");
const studentAnnouncement = document.getElementById("student-announcement");
const currencySelect = document.getElementById("currency-select");
let currentOrderId = null;
let lastNotifId = 0;
let notifTotal = 0;
const unreadPerOrder = new Map();
const refTableBody = document.querySelector("#ref-table tbody");
const FX = { INR: 1, GBP: 0.0094, USD: 0.012, AUD: 0.018, CAD: 0.016, EUR: 0.011, AED: 0.044 };
let activeCurrency = localStorage.getItem("student_currency") || "INR";

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  const converted = n * (FX[activeCurrency] || 1);
  return `${activeCurrency} ${converted.toFixed(2)}`;
}

function updateUnreadUI() {
  const current = Number(currentOrderId || 0);
  const count = unreadPerOrder.get(current) || 0;
  navChatBadge.textContent = String(count);
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

setupDropzone(chatDropzone, chatFile);
setupDropzone(studentDropzone, studentFile);

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
      const pct = Math.round((e.loaded / e.total) * 100);
      progressEl.value = pct;
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

async function loadUnreadCounts() {
  const data = await api("/api/student/notifications/unread-counts");
  unreadPerOrder.clear();
  (data.per_order || []).forEach((r) => unreadPerOrder.set(Number(r.order_id || 0), Number(r.unread_count || 0)));
  notifTotal = Number(data.total_unread || 0);
  notifCount.textContent = String(notifTotal);
  updateUnreadUI();
}

async function loadOrders() {
  const data = await api("/api/student/me/orders");
  ordersBody.innerHTML = "";
  chatOrder.innerHTML = "";
  fileOrder.innerHTML = "";
  let dueTotal = 0;
  let active = 0;
  data.orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${o.order_code}</td><td>${o.title}</td><td>${o.status}</td><td><div class="progress"><span style="width:${o.progress_percent}%"></span></div>${o.progress_percent}%</td><td>${formatMoney(o.budget_total)}</td><td>${formatMoney(o.paid_amount)}</td><td>${formatMoney(o.due_payment)}</td><td>${o.deadline}</td>`;
    ordersBody.appendChild(tr);
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = `${o.order_code} - ${o.title}`;
    chatOrder.appendChild(opt);
    const optFile = document.createElement("option");
    optFile.value = o.id;
    optFile.textContent = `${o.order_code} - ${o.title}`;
    fileOrder.appendChild(optFile);
    if ((o.status || "").toLowerCase() !== "completed") active += 1;
    dueTotal += Number(o.due_payment || 0);
  });
  document.getElementById("kpi-total").textContent = data.orders.length;
  document.getElementById("kpi-active").textContent = active;
  document.getElementById("kpi-due").textContent = formatMoney(dueTotal);
  if (data.orders.length > 0) {
    if (!currentOrderId) currentOrderId = Number(data.orders[0].id);
    chatOrder.value = String(currentOrderId);
    fileOrder.value = String(currentOrderId);
    await loadMessages();
    await loadFiles();
  }
  updateUnreadUI();
}

async function loadAnnouncement() {
  const data = await api("/api/student/announcements/latest");
  if (data.announcement) {
    studentAnnouncement.style.display = "block";
    studentAnnouncement.innerHTML = `<h3>${data.announcement.title}</h3><p>${data.announcement.message}</p><p class="resource-meta">Posted: ${new Date(data.announcement.created_at).toLocaleString()}</p>`;
  } else {
    studentAnnouncement.style.display = "none";
  }
}

async function loadReferralData() {
  const profile = await api("/api/student/profile");
  document.getElementById("my-ref-code").textContent = profile.student?.referral_code || "-";
  const data = await api("/api/student/referrals");
  document.getElementById("ref-approved").textContent = data.summary?.approved_count || 0;
  document.getElementById("ref-pending").textContent = data.summary?.pending_count || 0;
  document.getElementById("ref-rejected").textContent = data.summary?.rejected_count || 0;
  refTableBody.innerHTML = "";
  (data.referrals || []).forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.referred_email || r.referred_phone || "-"}</td><td>${r.status}</td><td>${r.reward_applied ? "Applied" : "Pending"}</td><td>${r.verified_at || "-"}</td>`;
    refTableBody.appendChild(tr);
  });
}

async function loadMessages() {
  if (!currentOrderId) return;
  const data = await api(`/api/student/orders/${currentOrderId}/messages`);
  chatBox.innerHTML = data.messages.map((m) => `<p><strong>${m.sender_name} (${m.sender_role})</strong><br>${m.message}${m.file_path ? `<br><a href="${m.file_path}" target="_blank" rel="noopener">📎 ${m.file_original_name}</a>` : ""}</p>`).join("");
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function loadFiles() {
  const id = Number(fileOrder.value || currentOrderId || 0);
  if (!id) return;
  const data = await api(`/api/student/orders/${id}/files`);
  fileList.innerHTML = data.files.map((f) => `<p><strong>${f.file_kind}</strong> by ${f.uploader_name}<br><a href="${f.file_path}" target="_blank" rel="noopener">${f.file_original_name}</a></p>`).join("") || "<p>No files yet.</p>";
}

async function loadNotifications() {
  const data = await api(`/api/student/notifications?since_id=${lastNotifId}`);
  if (data.notifications.length > 0) {
    data.notifications.forEach((n) => {
      const p = document.createElement("p");
      p.innerHTML = `<strong>${new Date(n.created_at).toLocaleString()}</strong><br>${n.message}`;
      notifBox.prepend(p);
      lastNotifId = Math.max(lastNotifId, n.id);
    });
    await loadUnreadCounts();
  }
}

document.getElementById("mark-read").addEventListener("click", async () => {
  try {
    await api("/api/student/notifications/read", { method: "POST", body: JSON.stringify({ order_id: currentOrderId }) });
    await loadUnreadCounts();
  } catch {}
});

document.getElementById("notif-btn").addEventListener("click", () => {
  document.querySelectorAll(".portal-nav a").forEach((x) => x.classList.remove("active"));
  document.querySelector('.portal-nav a[data-view="notifications"]').classList.add("active");
  views.forEach((v) => v.classList.remove("active"));
  document.getElementById("view-notifications").classList.add("active");
});

chatOrder.addEventListener("change", async () => {
  currentOrderId = Number(chatOrder.value);
  await loadMessages();
  updateUnreadUI();
});
if (currencySelect) {
  currencySelect.value = activeCurrency;
  currencySelect.addEventListener("change", async () => {
    activeCurrency = currencySelect.value;
    localStorage.setItem("student_currency", activeCurrency);
    await loadOrders();
  });
}

document.getElementById("send-chat").addEventListener("click", async () => {
  if (!currentOrderId) return;
  const message = chatMessage.value.trim();
  if (!message && !chatFile.files[0]) return;
  const fd = new FormData();
  if (message) fd.append("message", message);
  if (chatFile.files[0]) fd.append("file", chatFile.files[0]);
  await uploadWithProgress(`/api/student/orders/${currentOrderId}/messages`, fd, chatUploadProgress);
  chatMessage.value = "";
  chatFile.value = "";
  await loadMessages();
});

fileOrder.addEventListener("change", loadFiles);
document.getElementById("upload-student-file").addEventListener("click", async () => {
  try {
    const id = Number(fileOrder.value || currentOrderId || 0);
    const f = studentFile.files[0];
    if (!id || !f) return;
    const fd = new FormData();
    fd.append("file", f);
    await uploadWithProgress(`/api/student/orders/${id}/files`, fd, studentUploadProgress);
    studentFile.value = "";
    fileStatus.textContent = "File uploaded.";
    await loadFiles();
  } catch (e) {
    fileStatus.textContent = e.message;
  }
});

function connectRealtime() {
  if (typeof io === "undefined") return;
  socket = io({ auth: { token } });
  socket.on("notification:new", (n) => {
    const p = document.createElement("p");
    p.innerHTML = `<strong>${new Date(n.created_at).toLocaleString()}</strong><br>${n.message}`;
    notifBox.prepend(p);
    lastNotifId = Math.max(lastNotifId, n.id || 0);
    loadUnreadCounts().catch(() => {});
  });
  socket.on("message:new", ({ order_id, message }) => {
    if (Number(order_id) !== Number(currentOrderId)) return;
    const p = document.createElement("p");
    p.innerHTML = `<strong>${message.sender_name} (${message.sender_role})</strong><br>${message.message}${message.file_path ? `<br><a href="${message.file_path}" target="_blank" rel="noopener">📎 ${message.file_original_name}</a>` : ""}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  });
  socket.on("order:updated", () => loadOrders().catch(() => {}));
}

connectRealtime();

(async () => {
  try {
    await loadOrders();
    await loadNotifications();
    await loadUnreadCounts();
    await loadReferralData();
    await loadAnnouncement();
    setInterval(loadMessages, 5000);
    setInterval(loadNotifications, 5000);
    setInterval(loadOrders, 12000);
    setInterval(loadReferralData, 20000);
    setInterval(loadAnnouncement, 30000);
  } catch {
    localStorage.removeItem("student_token");
    window.location.href = "/pages/student-login.html";
  }
})();
