const tableBody = document.getElementById("rows");
const statusEl = document.getElementById("status");
const tokenInput = document.getElementById("token");
const loadBtn = document.getElementById("load");

async function loadEnquiries() {
  const token = tokenInput.value.trim();
  if (!token) {
    statusEl.textContent = "Enter admin token.";
    return;
  }
  statusEl.textContent = "Loading enquiries...";

  const res = await fetch(`/api/enquiries?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) {
    statusEl.textContent = data.error || "Failed to load";
    return;
  }

  tableBody.innerHTML = "";
  data.enquiries.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>${r.full_name}</td>
      <td>${r.email}<br>${r.phone}</td>
      <td>${r.course_subject}</td>
      <td>${r.assignment_type}</td>
      <td>${r.deadline}</td>
      <td>${r.word_count || "-"}</td>
      <td>${r.budget || "-"}</td>
      <td>${r.preferred_contact || "-"}</td>
      <td>${r.file_path ? `<a href="${r.file_path}" target="_blank" rel="noopener">${r.file_original_name || "file"}</a>` : "-"}</td>
      <td>${r.requirements}</td>
    `;
    tableBody.appendChild(tr);
  });

  statusEl.textContent = `Loaded ${data.enquiries.length} enquiries.`;
}

loadBtn.addEventListener("click", loadEnquiries);
