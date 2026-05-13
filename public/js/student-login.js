const statusEl = document.getElementById("status");
document.getElementById("login-btn").addEventListener("click", async () => {
  try {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const res = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) throw new Error("Server response invalid. Please run npm start.");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    localStorage.setItem("student_token", data.token);
    localStorage.setItem("student_user", JSON.stringify(data.student || {}));
    window.location.href = "/pages/student-dashboard.html";
  } catch (e) {
    statusEl.textContent = e.message;
  }
});
