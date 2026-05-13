let token = "";
let ordersCache = [];

const q = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...opts, headers });
  const contentType = res.headers.get("content-type") || "";
  let data = null;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    throw new Error(`API returned non-JSON response (${res.status}). Make sure you opened the site via http://localhost:3000 and server is running. ${text.slice(0, 80)}`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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
}

function fillOrderSelects() {
  ["u-order", "m-order"].forEach((id) => {
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
  data.orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${o.order_code}</td><td>${o.student_name}</td><td>${o.status}</td><td>${o.progress_percent}%</td><td>${o.budget_total ?? "-"}</td><td>${o.paid_amount ?? 0}</td><td>${o.due_payment ?? "-"}</td>`;
    body.appendChild(tr);
  });
  fillOrderSelects();
}

async function loadAdminChat() {
  const id = Number(q("m-order").value || 0);
  if (!id) return;
  const data = await api(`/api/admin/orders/${id}/messages`).catch(() => ({ messages: [] }));
  const box = q("admin-chat-box");
  box.innerHTML = (data.messages || []).map((m) => `<p><strong>${m.sender_name} (${m.sender_role})</strong><br>${m.message}</p>`).join("");
}

q("admin-login").addEventListener("click", async () => {
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username: q("admin-user").value.trim(), password: q("admin-pass").value })
    });
    token = data.token;
    q("admin-status").textContent = "Logged in.";
    q("admin-app").style.display = "block";
    await loadStudents();
    await loadOrders();
    await loadAdminChat();
    setInterval(loadOrders, 8000);
    setInterval(loadAdminChat, 5000);
  } catch (e) {
    q("admin-status").textContent = e.message;
  }
});

q("create-student").addEventListener("click", async () => {
  try {
    const payload = { full_name: q("s-name").value.trim(), email: q("s-email").value.trim(), phone: q("s-phone").value.trim(), password: q("s-pass").value };
    await api("/api/admin/students", { method: "POST", body: JSON.stringify(payload) });
    q("student-msg").textContent = "Student created.";
    await loadStudents();
  } catch (e) { q("student-msg").textContent = e.message; }
});

q("create-order").addEventListener("click", async () => {
  try {
    const payload = {
      student_id: Number(q("o-student").value),
      title: q("o-title").value.trim(),
      subject: q("o-subject").value.trim(),
      assignment_type: q("o-type").value.trim(),
      deadline: q("o-deadline").value,
      budget_total: q("o-budget").value || null,
      paid_amount: q("o-paid").value || 0,
      due_payment: q("o-due").value || null,
      description: q("o-desc").value.trim()
    };
    const data = await api("/api/admin/orders", { method: "POST", body: JSON.stringify(payload) });
    q("order-msg").textContent = `Order created: ${data.order_code}`;
    await loadOrders();
  } catch (e) { q("order-msg").textContent = e.message; }
});

q("update-order").addEventListener("click", async () => {
  try {
    const id = Number(q("u-order").value);
    const payload = {
      status: q("u-status").value.trim(),
      progress_percent: Number(q("u-progress").value || 0),
      budget_total: q("u-budget").value || null,
      paid_amount: q("u-paid").value || null,
      due_payment: q("u-due").value || null,
      description: q("u-desc").value.trim()
    };
    await api(`/api/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    q("update-msg").textContent = "Order updated.";
    await loadOrders();
  } catch (e) { q("update-msg").textContent = e.message; }
});

q("send-admin-msg").addEventListener("click", async () => {
  try {
    const orderId = Number(q("m-order").value);
    await api(`/api/admin/orders/${orderId}/messages`, { method: "POST", body: JSON.stringify({ message: q("m-text").value.trim() }) });
    q("m-text").value = "";
    q("m-status").textContent = "Message sent.";
    await loadAdminChat();
  } catch (e) { q("m-status").textContent = e.message; }
});

q("m-order").addEventListener("change", loadAdminChat);
