-- Lesson Booking System Database Schema
-- D1 SQLite Migration

-- ユーザーテーブル (講師・生徒共通)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('instructor', 'student')),
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expires_at INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

-- コーステーブル
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    max_participants INTEGER NOT NULL DEFAULT 1,
    instructor_id TEXT NOT NULL REFERENCES users(id),
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 講師空き時間テーブル
CREATE TABLE IF NOT EXISTS availability (
    id TEXT PRIMARY KEY,
    instructor_id TEXT NOT NULL REFERENCES users(id),
    course_id TEXT REFERENCES courses(id),
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    max_participants INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 予約リクエストテーブル
CREATE TABLE IF NOT EXISTS booking_requests (
    id TEXT PRIMARY KEY,
    availability_id TEXT NOT NULL REFERENCES availability(id),
    student_id TEXT NOT NULL REFERENCES users(id),
    preference_order INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'approved', 'rejected', 'cancelled')),
    message TEXT,
    calendar_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 確定済み予約テーブル
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    availability_id TEXT NOT NULL REFERENCES availability(id),
    course_id TEXT NOT NULL REFERENCES courses(id),
    instructor_id TEXT NOT NULL REFERENCES users(id),
    scheduled_start TEXT NOT NULL,
    scheduled_end TEXT NOT NULL,
    is_group_lesson INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'completed', 'cancelled')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- 予約参加者テーブル
CREATE TABLE IF NOT EXISTS booking_participants (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES bookings(id),
    student_id TEXT NOT NULL REFERENCES users(id),
    calendar_event_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- セッションテーブル (認証用)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_availability_instructor ON availability(instructor_id);
CREATE INDEX IF NOT EXISTS idx_availability_time ON availability(start_time);
CREATE INDEX IF NOT EXISTS idx_requests_availability ON booking_requests(availability_id);
CREATE INDEX IF NOT EXISTS idx_requests_student ON booking_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON booking_requests(status);
CREATE INDEX IF NOT EXISTS idx_bookings_instructor ON bookings(instructor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_participants_booking ON booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_participants_student ON booking_participants(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
