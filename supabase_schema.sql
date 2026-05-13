create table if not exists enquiries (
  id bigint primary key,
  created_at timestamptz,
  full_name text,
  email text,
  phone text,
  course_subject text,
  assignment_type text,
  deadline text,
  word_count bigint,
  budget text,
  requirements text,
  preferred_contact text,
  file_path text,
  file_original_name text,
  status text,
  referral_code_input text,
  referral_status text,
  referral_referrer_student_id bigint
);

create table if not exists students (
  id bigint primary key,
  full_name text,
  email text,
  phone text,
  referral_code text,
  password_hash text,
  created_at timestamptz,
  created_by text,
  is_active bigint
);

create table if not exists sessions (
  id bigint primary key,
  token text,
  role text,
  student_id bigint,
  created_at timestamptz,
  expires_at timestamptz
);

create table if not exists orders (
  id bigint primary key,
  order_code text,
  student_id bigint,
  title text,
  subject text,
  assignment_type text,
  deadline text,
  budget_total double precision,
  paid_amount double precision,
  due_payment double precision,
  status text,
  progress_percent bigint,
  description text,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists order_messages (
  id bigint primary key,
  order_id bigint,
  sender_role text,
  sender_name text,
  message text,
  file_path text,
  file_original_name text,
  created_at timestamptz
);

create table if not exists order_files (
  id bigint primary key,
  order_id bigint,
  uploader_role text,
  uploader_name text,
  file_kind text,
  file_path text,
  file_original_name text,
  created_at timestamptz
);

create table if not exists notifications (
  id bigint primary key,
  student_id bigint,
  order_id bigint,
  message text,
  is_read bigint,
  created_at timestamptz
);

create table if not exists referrals (
  id bigint primary key,
  referrer_student_id bigint,
  referred_enquiry_id bigint,
  referred_student_id bigint,
  referred_order_id bigint,
  referred_email text,
  referred_phone text,
  status text,
  reward_applied bigint,
  notes text,
  created_at timestamptz,
  verified_at timestamptz
);

create table if not exists discount_codes (
  id bigint primary key,
  code text,
  title text,
  description text,
  discount_type text,
  discount_value double precision,
  starts_at text,
  ends_at text,
  is_active bigint,
  show_on_website bigint,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists announcements (
  id bigint primary key,
  title text,
  message text,
  is_active bigint,
  created_at timestamptz
);
