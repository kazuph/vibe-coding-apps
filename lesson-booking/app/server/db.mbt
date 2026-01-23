///| D1 Database Access Layer for Lesson Booking System
///| Using mizchi/cloudflare package for type-safe D1 access

// =============================================================================
// D1 Database Access - Using mizchi/cloudflare package
// =============================================================================

///| Get D1 database from global context
fn get_db() -> @cloudflare.D1Database {
  let db_js : @core.Any = get_global_db()
  @core.identity(db_js)
}

///| Get global D1 database reference (minimal FFI - required for binding access)
extern "js" fn get_global_db() -> @core.Any =
  #| () => {
  #|   const db = globalThis.__D1_DB;
  #|   if (!db) throw new Error('D1 database not initialized');
  #|   return db;
  #| }

// =============================================================================
// User CRUD Operations
// =============================================================================

///| Get user by ID
pub async fn db_get_user_by_id(id : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind1(@core.any(id))
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Get user by Google ID
pub async fn db_get_user_by_google_id(google_id : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare("SELECT * FROM users WHERE google_id = ?")
    .bind1(@core.any(google_id))
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Get user by email
pub async fn db_get_user_by_email(email : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind1(@core.any(email))
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Create or update user (upsert on google_id)
pub async fn db_upsert_user(
  id : String,
  google_id : String,
  email : String,
  name : String,
  avatar_url : String,
  role : String,
  access_token : String,
  refresh_token : String,
  token_expires_at : Int
) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "INSERT INTO users (id, google_id, email, name, avatar_url, role, google_access_token, google_refresh_token, google_token_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(google_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         google_access_token = excluded.google_access_token,
         google_refresh_token = excluded.google_refresh_token,
         google_token_expires_at = excluded.google_token_expires_at
       RETURNING *"
    )
    .bind([
      @core.any(id),
      @core.any(google_id),
      @core.any(email),
      @core.any(name),
      @core.any(avatar_url),
      @core.any(role),
      @core.any(access_token),
      @core.any(refresh_token),
      @core.any(token_expires_at),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Update user role
pub async fn db_update_user_role(id : String, role : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare("UPDATE users SET role = ? WHERE id = ? RETURNING *")
    .bind([
      @core.any(role),
      @core.any(id),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Get all instructors
pub async fn db_get_instructors() -> @core.Any {
  let db = get_db()
  let result = db
    .prepare("SELECT * FROM users WHERE role = 'instructor' ORDER BY name")
    .all()
  result.results_raw()
}

// =============================================================================
// Session Operations
// =============================================================================

///| Create session
pub async fn db_create_session(id : String, user_id : String, expires_at : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?) RETURNING *")
    .bind([
      @core.any(id),
      @core.any(user_id),
      @core.any(expires_at),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Get session with user data
pub async fn db_get_session_with_user(session_id : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "SELECT s.*, u.id as user_id, u.google_id, u.email, u.name, u.avatar_url, u.role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')"
    )
    .bind1(@core.any(session_id))
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Delete session
pub async fn db_delete_session(session_id : String) -> @cloudflare.D1Result {
  let db = get_db()
  db.prepare("DELETE FROM sessions WHERE id = ?").bind1(@core.any(session_id)).run()
}

///| Delete expired sessions
pub async fn db_cleanup_sessions() -> @cloudflare.D1Result {
  let db = get_db()
  db.prepare("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')").run()
}

// =============================================================================
// Course CRUD Operations
// =============================================================================

///| Get all active courses
pub async fn db_get_active_courses() -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT c.*, u.name as instructor_name
       FROM courses c
       JOIN users u ON c.instructor_id = u.id
       WHERE c.is_active = 1
       ORDER BY c.name"
    )
    .all()
  result.results_raw()
}

///| Get courses by instructor
pub async fn db_get_courses_by_instructor(instructor_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare("SELECT * FROM courses WHERE instructor_id = ? ORDER BY name")
    .bind1(@core.any(instructor_id))
    .all()
  result.results_raw()
}

///| Get course by ID
pub async fn db_get_course_by_id(id : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare("SELECT * FROM courses WHERE id = ?")
    .bind1(@core.any(id))
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Create course
pub async fn db_create_course(
  id : String,
  name : String,
  description : String,
  duration_minutes : Int,
  max_participants : Int,
  instructor_id : String
) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "INSERT INTO courses (id, name, description, duration_minutes, max_participants, instructor_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .bind([
      @core.any(id),
      @core.any(name),
      @core.any(description),
      @core.any(duration_minutes),
      @core.any(max_participants),
      @core.any(instructor_id),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Update course
pub async fn db_update_course(
  id : String,
  name : String,
  description : String,
  duration_minutes : Int,
  max_participants : Int,
  is_active : Int
) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "UPDATE courses SET name = ?, description = ?, duration_minutes = ?, max_participants = ?, is_active = ?
       WHERE id = ? RETURNING *"
    )
    .bind([
      @core.any(name),
      @core.any(description),
      @core.any(duration_minutes),
      @core.any(max_participants),
      @core.any(is_active),
      @core.any(id),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

// =============================================================================
// Availability CRUD Operations
// =============================================================================

///| Get availability by instructor
pub async fn db_get_availability_by_instructor(instructor_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT a.*, c.name as course_name
       FROM availability a
       LEFT JOIN courses c ON a.course_id = c.id
       WHERE a.instructor_id = ? AND datetime(a.start_time) >= datetime('now')
       ORDER BY a.start_time"
    )
    .bind1(@core.any(instructor_id))
    .all()
  result.results_raw()
}

///| Get all future availability (for students to browse)
pub async fn db_get_future_availability() -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT a.*, u.name as instructor_name, c.name as course_name, c.duration_minutes
       FROM availability a
       JOIN users u ON a.instructor_id = u.id
       LEFT JOIN courses c ON a.course_id = c.id
       WHERE datetime(a.start_time) >= datetime('now')
       ORDER BY a.start_time"
    )
    .all()
  result.results_raw()
}

///| Get availability by ID
pub async fn db_get_availability_by_id(id : String) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "SELECT a.*, u.name as instructor_name, c.name as course_name
       FROM availability a
       JOIN users u ON a.instructor_id = u.id
       LEFT JOIN courses c ON a.course_id = c.id
       WHERE a.id = ?"
    )
    .bind1(@core.any(id))
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Create availability
pub async fn db_create_availability(
  id : String,
  instructor_id : String,
  course_id : String,
  start_time : String,
  end_time : String,
  max_participants : Int
) -> @core.Any {
  let db = get_db()
  let course_id_val : @core.Any = if course_id == "" {
    @core.null()
  } else {
    @core.any(course_id)
  }
  let row = db
    .prepare(
      "INSERT INTO availability (id, instructor_id, course_id, start_time, end_time, max_participants)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .bind([
      @core.any(id),
      @core.any(instructor_id),
      course_id_val,
      @core.any(start_time),
      @core.any(end_time),
      @core.any(max_participants),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Delete availability
pub async fn db_delete_availability(id : String) -> @cloudflare.D1Result {
  let db = get_db()
  db.prepare("DELETE FROM availability WHERE id = ?").bind1(@core.any(id)).run()
}

// =============================================================================
// Booking Request CRUD Operations
// =============================================================================

///| Get booking requests for an availability slot
pub async fn db_get_requests_for_availability(availability_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT br.*, u.name as student_name, u.email as student_email
       FROM booking_requests br
       JOIN users u ON br.student_id = u.id
       WHERE br.availability_id = ?
       ORDER BY br.preference_order, br.created_at"
    )
    .bind1(@core.any(availability_id))
    .all()
  result.results_raw()
}

///| Get booking requests by student
pub async fn db_get_requests_by_student(student_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT br.*, a.start_time, a.end_time, u.name as instructor_name, c.name as course_name
       FROM booking_requests br
       JOIN availability a ON br.availability_id = a.id
       JOIN users u ON a.instructor_id = u.id
       LEFT JOIN courses c ON a.course_id = c.id
       WHERE br.student_id = ?
       ORDER BY a.start_time"
    )
    .bind1(@core.any(student_id))
    .all()
  result.results_raw()
}

///| Get pending requests for instructor
pub async fn db_get_pending_requests_for_instructor(instructor_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT br.*, a.start_time, a.end_time, a.max_participants, u.name as student_name, u.email as student_email, c.name as course_name
       FROM booking_requests br
       JOIN availability a ON br.availability_id = a.id
       JOIN users u ON br.student_id = u.id
       LEFT JOIN courses c ON a.course_id = c.id
       WHERE a.instructor_id = ? AND br.status = 'requested'
       ORDER BY a.start_time, br.preference_order"
    )
    .bind1(@core.any(instructor_id))
    .all()
  result.results_raw()
}

///| Create booking request
pub async fn db_create_booking_request(
  id : String,
  availability_id : String,
  student_id : String,
  preference_order : Int,
  message : String
) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "INSERT INTO booking_requests (id, availability_id, student_id, preference_order, message)
       VALUES (?, ?, ?, ?, ?) RETURNING *"
    )
    .bind([
      @core.any(id),
      @core.any(availability_id),
      @core.any(student_id),
      @core.any(preference_order),
      @core.any(message),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Update booking request status
pub async fn db_update_request_status(
  id : String,
  status : String,
  calendar_event_id : String
) -> @core.Any {
  let db = get_db()
  let calendar_id_val : @core.Any = if calendar_event_id == "" {
    @core.null()
  } else {
    @core.any(calendar_event_id)
  }
  let row = db
    .prepare(
      "UPDATE booking_requests SET status = ?, calendar_event_id = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *"
    )
    .bind([
      @core.any(status),
      calendar_id_val,
      @core.any(id),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

// =============================================================================
// Booking (Confirmed) CRUD Operations
// =============================================================================

///| Create confirmed booking
pub async fn db_create_booking(
  id : String,
  availability_id : String,
  course_id : String,
  instructor_id : String,
  scheduled_start : String,
  scheduled_end : String,
  is_group_lesson : Int
) -> @core.Any {
  let db = get_db()
  let row = db
    .prepare(
      "INSERT INTO bookings (id, availability_id, course_id, instructor_id, scheduled_start, scheduled_end, is_group_lesson)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .bind([
      @core.any(id),
      @core.any(availability_id),
      @core.any(course_id),
      @core.any(instructor_id),
      @core.any(scheduled_start),
      @core.any(scheduled_end),
      @core.any(is_group_lesson),
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Add participant to booking
pub async fn db_add_booking_participant(
  id : String,
  booking_id : String,
  student_id : String,
  calendar_event_id : String
) -> @core.Any {
  let db = get_db()
  let calendar_id_val : @core.Any = if calendar_event_id == "" {
    @core.null()
  } else {
    @core.any(calendar_event_id)
  }
  let row = db
    .prepare(
      "INSERT INTO booking_participants (id, booking_id, student_id, calendar_event_id)
       VALUES (?, ?, ?, ?) RETURNING *"
    )
    .bind([
      @core.any(id),
      @core.any(booking_id),
      @core.any(student_id),
      calendar_id_val,
    ])
    .first()
  match row {
    Some(r) => r
    None => @core.null()
  }
}

///| Get confirmed bookings for instructor
pub async fn db_get_bookings_by_instructor(instructor_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT b.*, c.name as course_name,
       GROUP_CONCAT(u.name, ', ') as participant_names
       FROM bookings b
       LEFT JOIN courses c ON b.course_id = c.id
       LEFT JOIN booking_participants bp ON b.id = bp.booking_id
       LEFT JOIN users u ON bp.student_id = u.id
       WHERE b.instructor_id = ?
       GROUP BY b.id
       ORDER BY b.scheduled_start"
    )
    .bind1(@core.any(instructor_id))
    .all()
  result.results_raw()
}

///| Get confirmed bookings for student
pub async fn db_get_bookings_by_student(student_id : String) -> @core.Any {
  let db = get_db()
  let result = db
    .prepare(
      "SELECT b.*, c.name as course_name, u.name as instructor_name
       FROM bookings b
       JOIN booking_participants bp ON b.id = bp.booking_id
       LEFT JOIN courses c ON b.course_id = c.id
       JOIN users u ON b.instructor_id = u.id
       WHERE bp.student_id = ?
       ORDER BY b.scheduled_start"
    )
    .bind1(@core.any(student_id))
    .all()
  result.results_raw()
}

// =============================================================================
// Data Access Helpers - MoonBit Native Implementation
// =============================================================================

///| Extract string field from JS object (MoonBit native)
pub fn get_str(obj : @core.Any, field : String) -> String {
  if @core.is_nullish(obj) {
    return ""
  }
  let val = obj._get(field)
  if @core.is_nullish(val) {
    ""
  } else {
    val.to_string()
  }
}

///| Extract int field from JS object (MoonBit native)
pub fn get_int(obj : @core.Any, field : String) -> Int {
  if @core.is_nullish(obj) {
    return 0
  }
  let val = obj._get(field)
  if @core.is_nullish(val) {
    0
  } else {
    val.cast()
  }
}

///| Check if JS value is null/undefined (MoonBit native)
pub fn is_null(obj : @core.Any) -> Bool {
  @core.is_nullish(obj)
}

///| Get array length (MoonBit native)
pub fn array_len(arr : @core.Any) -> Int {
  if @core.is_nullish(arr) {
    0
  } else {
    let len = arr._get("length")
    if @core.is_nullish(len) {
      0
    } else {
      len.cast()
    }
  }
}

///| Get array element (MoonBit native)
pub fn array_get(arr : @core.Any, idx : Int) -> @core.Any {
  arr._get_by_index(idx)
}

///| Get current timestamp (minimal FFI - Date API is JS-only)
pub extern "js" fn get_timestamp() -> String =
  #| () => new Date().toISOString()

///| Generate UUID (minimal FFI)
pub extern "js" fn generate_uuid() -> String =
  #| () => crypto.randomUUID()
