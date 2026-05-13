const form = document.getElementById("enquiry-form");
const statusEl = document.getElementById("status");
const waWrap = document.getElementById("wa-after-submit");
const waIn = document.getElementById("wa-send-in");
const waUk = document.getElementById("wa-send-uk");

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.style.color = type === "error" ? "#a22626" : type === "success" ? "#1f5f4a" : "#5f645f";
}

if (form) {
  let startedTracked = false;
  form.addEventListener("input", () => {
    if (startedTracked) return;
    startedTracked = true;
    if (typeof window.trackEvent === "function") {
      window.trackEvent("enquiry_form_started", { page: window.location.pathname });
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("Submitting your enquiry...");

    const fd = new FormData(form);
    const snapshot = {
      full_name: String(fd.get("full_name") || "").trim(),
      course_subject: String(fd.get("course_subject") || "").trim(),
      assignment_type: String(fd.get("assignment_type") || "").trim(),
      deadline: String(fd.get("deadline") || "").trim(),
      word_count: String(fd.get("word_count") || "").trim(),
      budget: String(fd.get("budget") || "").trim()
    };

    try {
      const res = await fetch("/api/enquiries", { method: "POST", body: fd });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}). Use http://localhost:3000 and keep server running. ${text.slice(0, 80)}`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      const summary =
        `Hello, I submitted an enquiry on Assign Tutors.%0A` +
        `Enquiry ID: ${data.id}%0A` +
        `Name: ${encodeURIComponent(snapshot.full_name)}%0A` +
        `Subject: ${encodeURIComponent(snapshot.course_subject)}%0A` +
        `Type: ${encodeURIComponent(snapshot.assignment_type)}%0A` +
        `Deadline: ${encodeURIComponent(snapshot.deadline)}%0A` +
        `Word Count: ${encodeURIComponent(snapshot.word_count || "-")}%0A` +
        `Budget: ${encodeURIComponent(snapshot.budget || "-")}`;

      if (waIn && waUk && waWrap) {
        waIn.href = `https://wa.me/919119235092?text=${summary}`;
        waUk.href = `https://wa.me/447434761786?text=${summary}`;
        waWrap.style.display = "flex";
      }

      form.reset();
      if (typeof window.trackEvent === "function") {
        window.trackEvent("enquiry_submitted", {
          enquiry_id: data.id,
          assignment_type: snapshot.assignment_type || "unknown",
          page: window.location.pathname
        });
      }
      setStatus("Enquiry submitted successfully. Database + email notification done. You can also send summary on WhatsApp below.", "success");
    } catch (err) {
      if (typeof window.trackEvent === "function") {
        window.trackEvent("enquiry_submit_failed", { page: window.location.pathname });
      }
      setStatus(err.message || "Something went wrong.", "error");
    }
  });
}
