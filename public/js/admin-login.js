const statusEl = document.getElementById("status");
document.getElementById("login-btn").addEventListener("click", async () => {
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("Server response invalid. Please run npm start.");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("admin_token", data.token);
    window.location.href = "/pages/admin-dashboard.html";
  } catch (e) {
    statusEl.textContent = e.message;
  }
});
