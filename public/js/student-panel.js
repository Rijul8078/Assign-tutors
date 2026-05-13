let token = "";
let currentOrderId = null;
let lastNotifId = 0;

const loginBtn = document.getElementById("login-btn");
const loginStatus = document.getElementById("login-status");
const app = document.getElementById("student-app");
const ordersBody = document.querySelector("#orders-table tbody");
const chatOrder = document.getElementById("chat-order");
const chatBox = document.getElementById("chat-box");
const chatMessage = document.getElementById("chat-message");
const sendChat = document.getElementById("send-chat");
const notifBox = document.getElementById("notif-box");

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
    throw new Error(`API returned non-JSON response (${res.status}). Open panel via http://localhost:3000 and ensure backend is running. ${text.slice(0, 80)}`);
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function loadOrders() {
  const data = await api("/api/student/me/orders");
  ordersBody.innerHTML = "";
  chatOrder.innerHTML = "";
  data.orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${o.order_code}</td><td>${o.title}</td><td>${o.status}</td><td>${o.progress_percent}%</td><td>${o.budget_total ?? "-"}</td><td>${o.paid_amount ?? 0}</td><td>${o.due_payment ?? "-"}</td><td>${o.deadline}</td>`;
    ordersBody.appendChild(tr);
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = `${o.order_code} - ${o.title}`;
    chatOrder.appendChild(opt);
  });
  if (data.orders.length > 0) {
    currentOrderId = Number(data.orders[0].id);
    chatOrder.value = String(currentOrderId);
    await loadMessages();
  }
}

async function loadMessages() {
  if (!currentOrderId) return;
  const data = await api(`/api/student/orders/${currentOrderId}/messages`);
  chatBox.innerHTML = data.messages.map((m) => `<p><strong>${m.sender_name} (${m.sender_role})</strong><br>${m.message}</p>`).join("");
  chatBox.scrollTop = chatBox.scrollHeight;
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
  }
}

loginBtn.addEventListener("click", async () => {
  try {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const data = await api("/api/student/login", { method: "POST", body: JSON.stringify({ email, password }) });
    token = data.token;
    loginStatus.textContent = "Logged in.";
    app.style.display = "block";
    await loadOrders();
    await loadNotifications();
    setInterval(loadMessages, 5000);
    setInterval(loadNotifications, 5000);
  } catch (e) {
    loginStatus.textContent = e.message;
  }
});

chatOrder.addEventListener("change", async () => {
  currentOrderId = Number(chatOrder.value);
  await loadMessages();
});

sendChat.addEventListener("click", async () => {
  if (!currentOrderId) return;
  const message = chatMessage.value.trim();
  if (!message) return;
  await api(`/api/student/orders/${currentOrderId}/messages`, { method: "POST", body: JSON.stringify({ message }) });
  chatMessage.value = "";
  await loadMessages();
});
