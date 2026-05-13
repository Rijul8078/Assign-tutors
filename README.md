# Assign Tutors - Advanced Multi-Page Website + Backend

This project includes:
- Multi-page professional website
- Enquiry form with file upload
- SQLite database storage
- Email notifications on enquiry
- Admin Workspace + Student Panel with order tracking and live messaging

## Core Features
- Admin-only student account creation (no public signup)
- Auto-generated order IDs (`ORD-YYYY-0001` format)
- Order budget, paid amount, due payment, progress, and status tracking
- Dedicated student dashboard after admin confirmation
- Live comments/messages on order (student <-> admin)
- Live notification polling for progress/status updates

## Setup
1. Install dependencies
```powershell
npm install
```

2. Configure env
```powershell
Copy-Item .env.example .env
```

Required in `.env`:
- `PORT=3000`
- `ADMIN_TOKEN=change-this-admin-token`
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=admin123`
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=your-gmail@gmail.com`
- `SMTP_PASS=your-gmail-app-password`
- `EMAIL_FROM=your-gmail@gmail.com`
- `EMAIL_TO=aspirescholarsedu@gmail.com,rajeevjh7665@gmail.com`
- `GA4_MEASUREMENT_ID=` (optional, for free Google Analytics 4 tracking)
- `SUPABASE_URL=` (optional, for Supabase mirror sync)
- `SUPABASE_SERVICE_ROLE_KEY=` (optional, use service role key only on backend)

3. Start server
```powershell
npm start
```

## Main URLs
- Home: `http://localhost:3000/`
- Contact Form: `http://localhost:3000/pages/contact.html`
- Admin Workspace: `http://localhost:3000/pages/admin-workspace.html`
- Student Panel: `http://localhost:3000/pages/student-panel.html`

## Auth Flow You Requested
1. Student first submits enquiry on website.
2. Admin confirms work manually.
3. Admin creates student account from Admin Workspace.
4. Admin creates order; order ID auto-generates.
5. Student logs into Student Panel and sees:
   - order id
   - budget
   - due payment
   - status
   - progress
   - live messages
   - live notifications

## API Summary
- `POST /api/admin/login`
- `POST /api/student/login`
- `POST /api/admin/students`
- `GET /api/admin/students`
- `POST /api/admin/orders`
- `PATCH /api/admin/orders/:id`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id/messages`
- `POST /api/admin/orders/:id/messages`
- `GET /api/student/me/orders`
- `GET /api/student/orders/:id/messages`
- `POST /api/student/orders/:id/messages`
- `GET /api/student/notifications?since_id=...`

## Free Notification Model
- Database save: free
- Email notification: free tier via Gmail SMTP/App Password
- WhatsApp automation: not used (to keep zero cost)
- WhatsApp click-to-chat + post-submit prefilled send option remains available

## Lead Tracking (Implemented)
- Admin dashboard now has a **Leads** tab to view all website enquiries
- Filters: status, search (name/email/phone/subject), date range
- Export: CSV download from admin dashboard
- Lead data source: `enquiries` table (name, email, phone, subject, type, deadline, budget, referral, file)

## Free Visitor Analytics (Implemented)
- Google Analytics 4 can be enabled with `GA4_MEASUREMENT_ID` in `.env`
- Events tracked:
  - `cta_click`
  - `whatsapp_picker_open`
  - `enquiry_form_started`
  - `enquiry_submitted`
  - `enquiry_submit_failed`

## Performance Upgrades (Implemented)
- Response compression enabled in backend (`compression` middleware)
- Static asset cache headers added for CSS/JS/images/fonts
- Lazy-loading + async decoding behavior added for images in frontend script
- Section rendering optimization using `content-visibility`
- Logo PNG optimized for smaller transfer size

## New Dashboard Features (Implemented)
- In-dashboard announcement banner for students
- Admin can post and activate/deactivate announcements
- Multi-currency display toggle in admin and student dashboards:
  - INR, GBP, USD, AUD, CAD, EUR, AED

## PWA Foundation (Implemented)
- Installable web app manifest added
- Service worker added for cache-first loading
- PWA registration enabled on main site and dashboards

## Supabase Sync (Implemented)
- Primary runtime DB remains local SQLite: `data/assign_tutors.db`
- Supabase is connected as a mirror for dashboard visibility and backup sync
- Auto-sync runs on new writes (enquiries, students, orders, messages/files, referrals, discounts)
- Manual full sync available from Admin Dashboard button: **Sync To Supabase**

### Supabase Setup
1. Create a Supabase project.
2. Open SQL editor and run:
   - [supabase_schema.sql](c:/Users/rijul/Music/Assign tutors/supabase_schema.sql)
3. Copy values from Supabase project settings:
   - Project URL -> `SUPABASE_URL`
   - Service Role Key -> `SUPABASE_SERVICE_ROLE_KEY`
4. Paste both into `.env` and restart server.


## Realtime + File Features
- Socket.IO realtime push for order updates, messages, and notifications
- Student Login visible in website menu
- Admin login hidden as footer Staff Portal link
- Admin and student can attach files in live comments
- Admin can upload solution files per order, student can download directly from dashboard



## Referral Verification System
- Public demo referral code removed from homepage
- Each approved student gets a private unique referral code
- Enquiry form accepts optional referral code (eferral_code_input)
- Referral entries move to pending_verification and must be approved/rejected by admin
- Anti-abuse: duplicate approved referral by same referred email/phone is blocked
- Student dashboard shows private code + referral status history
- Admin dashboard has referral verification queue


