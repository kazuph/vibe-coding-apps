///| Routes for Lesson Booking System
///| Implements SSR booking system with Google OAuth and D1 database

// =============================================================================
// Route Definitions
// =============================================================================

///|
pub fn routes() -> Array[@router.SolRoutes] {
  [
    @router.SolRoutes::WithMiddleware(
      middleware=[@mw.logger()],
      children=[
        // Public Layout
        @router.SolRoutes::Layout(segment="", layout=public_layout, children=[
          // Landing page
          @router.SolRoutes::Page(
            path="/",
            handler=@router.PageHandler(landing_page),
            title="レッスン予約システム",
            meta=[],
            revalidate=None,
            cache=None,
          ),
        ]),
        // Student section
        @router.SolRoutes::WithMiddleware(
          middleware=[@mw.security_headers_relaxed()],
          children=[
            @router.SolRoutes::Layout(segment="/student", layout=student_layout, children=[
              @router.SolRoutes::Page(
                path="/",
                handler=@router.PageHandler(student_dashboard),
                title="生徒ダッシュボード",
                meta=[],
                revalidate=None,
                cache=None,
              ),
              @router.SolRoutes::Page(
                path="/browse",
                handler=@router.PageHandler(student_browse),
                title="空き時間を探す",
                meta=[],
                revalidate=None,
                cache=None,
              ),
              @router.SolRoutes::Page(
                path="/requests",
                handler=@router.PageHandler(student_requests),
                title="リクエスト状況",
                meta=[],
                revalidate=None,
                cache=None,
              ),
            ]),
          ],
        ),
        // Instructor section
        @router.SolRoutes::WithMiddleware(
          middleware=[@mw.security_headers_relaxed()],
          children=[
            @router.SolRoutes::Layout(segment="/instructor", layout=instructor_layout, children=[
              @router.SolRoutes::Page(
                path="/",
                handler=@router.PageHandler(instructor_dashboard),
                title="講師ダッシュボード",
                meta=[],
                revalidate=None,
                cache=None,
              ),
              @router.SolRoutes::Page(
                path="/courses",
                handler=@router.PageHandler(instructor_courses),
                title="コース管理",
                meta=[],
                revalidate=None,
                cache=None,
              ),
              @router.SolRoutes::Page(
                path="/availability",
                handler=@router.PageHandler(instructor_availability),
                title="空き時間管理",
                meta=[],
                revalidate=None,
                cache=None,
              ),
              @router.SolRoutes::Page(
                path="/requests",
                handler=@router.PageHandler(instructor_requests),
                title="予約リクエスト承認",
                meta=[],
                revalidate=None,
                cache=None,
              ),
            ]),
          ],
        ),
      ],
    ),
  ]
}

// =============================================================================
// Layouts
// =============================================================================

///| Get current user from globalThis (set by worker.ts)
extern "js" fn get_current_user() -> @core.Any =
  #| () => globalThis.__CURRENT_USER || null

///| Public layout for landing page
fn public_layout(
  _props : @router.PageProps,
  content : @server_dom.ServerNode,
) -> @server_dom.ServerNode raise Error {
  @server_dom.ServerNode::async_(async fn() {
    let inner = content.resolve()
    @luna.fragment([
      div(class="container", [
        nav(class="main-nav", [
          a(href="/", [strong([text("レッスン予約")])]),
          div(class="nav-right", [
            build_auth_nav(),
          ]),
        ]),
        div(class="content", [inner]),
      ]),
    ])
  })
}

///| Student layout with sidebar
fn student_layout(
  _props : @router.PageProps,
  content : @server_dom.ServerNode,
) -> @server_dom.ServerNode raise Error {
  @server_dom.ServerNode::async_(async fn() {
    let inner = content.resolve()
    let user = get_current_user()
    let user_name = get_str(user, "name")

    @luna.fragment([
      div(class="app-container", [
        nav(class="sidebar", [
          div(class="sidebar-header", [
            h3([text("生徒メニュー")]),
            p(class="user-name", [text(user_name)]),
          ]),
          ul([
            li([a(href="/student", [text("ダッシュボード")])]),
            li([a(href="/student/browse", [text("レッスンを探す")])]),
            li([a(href="/student/requests", [text("リクエスト状況")])]),
          ]),
          div(class="sidebar-footer", [
            a(href="/auth/logout", class="logout-link", [text("ログアウト")]),
          ]),
        ]),
        html_main(class="main-content", [inner]),
      ]),
    ])
  })
}

///| Instructor layout with sidebar
fn instructor_layout(
  _props : @router.PageProps,
  content : @server_dom.ServerNode,
) -> @server_dom.ServerNode raise Error {
  @server_dom.ServerNode::async_(async fn() {
    let inner = content.resolve()
    let user = get_current_user()
    let user_name = get_str(user, "name")

    @luna.fragment([
      div(class="app-container", [
        nav(class="sidebar", [
          div(class="sidebar-header", [
            h3([text("講師メニュー")]),
            p(class="user-name", [text(user_name)]),
          ]),
          ul([
            li([a(href="/instructor", [text("ダッシュボード")])]),
            li([a(href="/instructor/courses", [text("コース管理")])]),
            li([a(href="/instructor/availability", [text("空き時間管理")])]),
            li([a(href="/instructor/requests", [text("予約承認")])]),
          ]),
          div(class="sidebar-footer", [
            a(href="/auth/logout", class="logout-link", [text("ログアウト")]),
          ]),
        ]),
        html_main(class="main-content", [inner]),
      ]),
    ])
  })
}

///| Build auth navigation based on user state
fn build_auth_nav() -> @luna.Node[Unit] {
  let user = get_current_user()
  if is_null(user) {
    a(href="/auth/google", class="btn", [text("Googleでログイン")])
  } else {
    let role = get_str(user, "role")
    let dashboard_url = if role == "instructor" { "/instructor" } else { "/student" }
    span([
      a(href=dashboard_url, class="btn btn-secondary", [text("ダッシュボード")]),
      text(" "),
      a(href="/auth/logout", class="btn btn-outline", [text("ログアウト")]),
    ])
  }
}

// =============================================================================
// Public Page Handlers
// =============================================================================

///| Landing page
async fn landing_page(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()

    if not(is_null(user)) {
      // Redirect logged-in users to their dashboard
      let role = get_str(user, "role")
      if role == "instructor" {
        return @luna.fragment([
          div(class="redirect-message", [
            p([text("講師ダッシュボードへリダイレクト中...")]),
            p([a(href="/instructor", [text("こちらをクリック")])]),
          ]),
        ])
      } else {
        return @luna.fragment([
          div(class="redirect-message", [
            p([text("生徒ダッシュボードへリダイレクト中...")]),
            p([a(href="/student", [text("こちらをクリック")])]),
          ]),
        ])
      }
    }

    @luna.fragment([
      div(class="hero", [
        h1([text("レッスン予約システム")]),
        p(class="hero-subtitle", [text("講師と生徒をつなぐシンプルな予約プラットフォーム")]),
        div(class="hero-actions", [
          a(href="/auth/google", class="btn btn-large", [text("Googleでログイン")]),
        ]),
      ]),
      div(class="features", [
        div(class="feature-card", [
          h3([text("🗓️ 簡単予約")]),
          p([text("講師の空き時間から希望の時間を選んで予約リクエスト")]),
        ]),
        div(class="feature-card", [
          h3([text("👥 グループレッスン")]),
          p([text("最大3名までのグループレッスンに対応")]),
        ]),
        div(class="feature-card", [
          h3([text("📆 カレンダー連携")]),
          p([text("承認されたレッスンはGoogleカレンダーに自動登録")]),
        ]),
      ]),
    ])
  })
}

// =============================================================================
// Student Page Handlers
// =============================================================================

///| Student dashboard - shows upcoming bookings
async fn student_dashboard(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()
    let user_id = get_str(user, "id")

    let bookings = db_get_bookings_by_student(user_id)
    let len = array_len(bookings)

    let booking_items : Array[@luna.Node[Unit]] = []
    for i = 0; i < len; i = i + 1 {
      let booking = array_get(bookings, i)
      let course_name = get_str(booking, "course_name")
      let instructor_name = get_str(booking, "instructor_name")
      let scheduled_start = get_str(booking, "scheduled_start")
      let status = get_str(booking, "status")

      booking_items.push(
        div(class="booking-card", [
          h4([text(if course_name == "" { "レッスン" } else { course_name })]),
          p([text("講師: " + instructor_name)]),
          p([text("日時: " + format_datetime(scheduled_start))]),
          span(class="status-badge status-" + status, [text(status_label(status))]),
        ])
      )
    }

    @luna.fragment([
      h1([text("ダッシュボード")]),
      div(class="dashboard-section", [
        h2([text("確定済みレッスン")]),
        if len == 0 {
          p([text("まだ確定したレッスンはありません。"), a(href="/student/browse", [text("レッスンを探す")])])
        } else {
          div(class="booking-list", booking_items)
        },
      ]),
      div(class="quick-actions", [
        a(href="/student/browse", class="btn", [text("レッスンを探す")]),
        a(href="/student/requests", class="btn btn-secondary", [text("リクエスト状況を見る")]),
      ]),
    ])
  })
}

///| Student browse - search for available slots
async fn student_browse(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let availability = db_get_future_availability()
    let len = array_len(availability)

    let slot_items : Array[@luna.Node[Unit]] = []
    for i = 0; i < len; i = i + 1 {
      let slot = array_get(availability, i)
      let slot_id = get_str(slot, "id")
      let instructor_name = get_str(slot, "instructor_name")
      let course_name = get_str(slot, "course_name")
      let start_time = get_str(slot, "start_time")
      let end_time = get_str(slot, "end_time")
      let max_participants = get_int(slot, "max_participants")

      slot_items.push(
        div(class="availability-card", [
          div(class="slot-header", [
            h4([text(if course_name == "" { "レッスン枠" } else { course_name })]),
            span(class="instructor-badge", [text(instructor_name)]),
          ]),
          div(class="slot-details", [
            p([text("📅 " + format_datetime(start_time) + " 〜 " + format_time(end_time))]),
            p([text("👥 最大" + max_participants.to_string() + "名")]),
          ]),
          // Island Component for booking form
          @server_dom.client(
            @types.booking_form({
              availability_id: slot_id,
              instructor_name: instructor_name,
              course_name: course_name,
              start_time: start_time,
              end_time: end_time,
            }),
            [div([text("予約フォームを読み込み中...")])],
          ),
        ])
      )
    }

    @luna.fragment([
      h1([text("レッスンを探す")]),
      if len == 0 {
        div(class="empty-state", [
          p([text("現在予約可能なレッスン枠はありません。")]),
          p([text("後ほどもう一度ご確認ください。")]),
        ])
      } else {
        div(class="availability-list", slot_items)
      },
    ])
  })
}

///| Student requests - view request status
async fn student_requests(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()
    let user_id = get_str(user, "id")

    let requests = db_get_requests_by_student(user_id)
    let len = array_len(requests)

    let request_items : Array[@luna.Node[Unit]] = []
    for i = 0; i < len; i = i + 1 {
      let req = array_get(requests, i)
      let instructor_name = get_str(req, "instructor_name")
      let course_name = get_str(req, "course_name")
      let start_time = get_str(req, "start_time")
      let status = get_str(req, "status")
      let preference_order = get_int(req, "preference_order")

      request_items.push(
        div(class="request-card", [
          div(class="request-header", [
            h4([text(if course_name == "" { "レッスン" } else { course_name })]),
            span(class="status-badge status-" + status, [text(status_label(status))]),
          ]),
          p([text("講師: " + instructor_name)]),
          p([text("日時: " + format_datetime(start_time))]),
          p([text("希望順位: 第" + preference_order.to_string() + "希望")]),
        ])
      )
    }

    @luna.fragment([
      h1([text("リクエスト状況")]),
      if len == 0 {
        div(class="empty-state", [
          p([text("まだ予約リクエストはありません。")]),
          a(href="/student/browse", class="btn", [text("レッスンを探す")]),
        ])
      } else {
        div(class="request-list", request_items)
      },
    ])
  })
}

// =============================================================================
// Instructor Page Handlers
// =============================================================================

///| Instructor dashboard - overview
async fn instructor_dashboard(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()
    let user_id = get_str(user, "id")

    let pending_requests = db_get_pending_requests_for_instructor(user_id)
    let pending_count = array_len(pending_requests)

    let bookings = db_get_bookings_by_instructor(user_id)
    let booking_count = array_len(bookings)

    @luna.fragment([
      h1([text("講師ダッシュボード")]),
      div(class="stats-grid", [
        div(class="stat-card", [
          h3([text(pending_count.to_string())]),
          p([text("未承認リクエスト")]),
          if pending_count > 0 {
            a(href="/instructor/requests", class="btn btn-small", [text("確認する")])
          } else {
            span([])
          },
        ]),
        div(class="stat-card", [
          h3([text(booking_count.to_string())]),
          p([text("確定レッスン")]),
        ]),
      ]),
      div(class="quick-actions", [
        a(href="/instructor/availability", class="btn", [text("空き時間を登録")]),
        a(href="/instructor/courses", class="btn btn-secondary", [text("コース管理")]),
      ]),
    ])
  })
}

///| Instructor courses management
async fn instructor_courses(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()
    let user_id = get_str(user, "id")

    let courses = db_get_courses_by_instructor(user_id)
    let len = array_len(courses)

    let course_items : Array[@luna.Node[Unit]] = []
    for i = 0; i < len; i = i + 1 {
      let course = array_get(courses, i)
      let name = get_str(course, "name")
      let description = get_str(course, "description")
      let duration = get_int(course, "duration_minutes")
      let max_participants = get_int(course, "max_participants")
      let is_active = get_int(course, "is_active")

      course_items.push(
        div(class="course-card", [
          div(class="course-header", [
            h4([text(name)]),
            span(class=if is_active == 1 { "badge badge-active" } else { "badge badge-inactive" },
              [text(if is_active == 1 { "公開中" } else { "非公開" })]),
          ]),
          p([text(description)]),
          div(class="course-meta", [
            span([text("⏱️ " + duration.to_string() + "分")]),
            span([text("👥 最大" + max_participants.to_string() + "名")]),
          ]),
        ])
      )
    }

    @luna.fragment([
      h1([text("コース管理")]),
      // Island Component for course form
      @server_dom.client(
        @types.course_form({
          instructor_id: user_id,
        }),
        [div([text("コース作成フォームを読み込み中...")])],
      ),
      h2([text("登録済みコース")]),
      if len == 0 {
        p([text("まだコースが登録されていません。")])
      } else {
        div(class="course-list", course_items)
      },
    ])
  })
}

///| Instructor availability management
async fn instructor_availability(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()
    let user_id = get_str(user, "id")

    let availability = db_get_availability_by_instructor(user_id)
    let len = array_len(availability)

    let availability_items : Array[@luna.Node[Unit]] = []
    for i = 0; i < len; i = i + 1 {
      let slot = array_get(availability, i)
      let slot_id = get_str(slot, "id")
      let course_name = get_str(slot, "course_name")
      let start_time = get_str(slot, "start_time")
      let end_time = get_str(slot, "end_time")
      let max_participants = get_int(slot, "max_participants")

      availability_items.push(
        div(class="availability-item", [
          div(class="slot-info", [
            p(class="slot-time", [text(format_datetime(start_time) + " 〜 " + format_time(end_time))]),
            p([text(if course_name == "" { "コース未指定" } else { course_name })]),
            p([text("最大" + max_participants.to_string() + "名")]),
          ]),
          form(http_method="POST", action="/_action/delete-availability", [
            input_hidden("id", slot_id),
            button(attrs=[("type", @luna.attr_static("submit")), ("class", @luna.attr_static("btn btn-danger btn-small"))], [text("削除")]),
          ]),
        ])
      )
    }

    // Get courses for the calendar component
    let courses = db_get_courses_by_instructor(user_id)

    @luna.fragment([
      h1([text("空き時間管理")]),
      // Island Component for calendar/availability input
      @server_dom.client(
        @types.availability_calendar({
          instructor_id: user_id,
          courses: courses_to_json(courses),
        }),
        [div([text("カレンダーを読み込み中...")])],
      ),
      h2([text("登録済み空き時間")]),
      if len == 0 {
        p([text("まだ空き時間が登録されていません。")])
      } else {
        div(class="availability-list", availability_items)
      },
    ])
  })
}

///| Instructor requests - approve/reject booking requests
async fn instructor_requests(_props : @router.PageProps) -> @server_dom.ServerNode {
  @server_dom.ServerNode::async_(async fn() {
    let user = get_current_user()
    let user_id = get_str(user, "id")

    let requests = db_get_pending_requests_for_instructor(user_id)
    let len = array_len(requests)

    @luna.fragment([
      h1([text("予約リクエスト承認")]),
      if len == 0 {
        div(class="empty-state", [
          p([text("現在承認待ちのリクエストはありません。")]),
        ])
      } else {
        // Island Component for approval UI with checkboxes
        @server_dom.client(
          @types.approval_ui({
            requests: requests_to_json(requests),
            instructor_id: user_id,
          }),
          [div([text("承認UIを読み込み中...")])],
        )
      },
    ])
  })
}

// =============================================================================
// Helper Functions
// =============================================================================

///| Convert courses array to JSON for Island Component
fn courses_to_json(courses : @core.Any) -> String {
  let len = array_len(courses)
  let items : Array[String] = []
  for i = 0; i < len; i = i + 1 {
    let course = array_get(courses, i)
    let id = get_str(course, "id")
    let name = get_str(course, "name")
    items.push("{\"id\":\"" + id + "\",\"name\":\"" + escape_json(name) + "\"}")
  }
  "[" + items.join(",") + "]"
}

///| Convert requests array to JSON for Island Component
fn requests_to_json(requests : @core.Any) -> String {
  let len = array_len(requests)
  let items : Array[String] = []
  for i = 0; i < len; i = i + 1 {
    let req = array_get(requests, i)
    let id = get_str(req, "id")
    let availability_id = get_str(req, "availability_id")
    let student_name = get_str(req, "student_name")
    let student_email = get_str(req, "student_email")
    let start_time = get_str(req, "start_time")
    let end_time = get_str(req, "end_time")
    let course_name = get_str(req, "course_name")
    let preference_order = get_int(req, "preference_order")
    let max_participants = get_int(req, "max_participants")

    items.push("{\"id\":\"" + id +
      "\",\"availability_id\":\"" + availability_id +
      "\",\"student_name\":\"" + escape_json(student_name) +
      "\",\"student_email\":\"" + escape_json(student_email) +
      "\",\"start_time\":\"" + start_time +
      "\",\"end_time\":\"" + end_time +
      "\",\"course_name\":\"" + escape_json(course_name) +
      "\",\"preference_order\":" + preference_order.to_string() +
      ",\"max_participants\":" + max_participants.to_string() + "}")
  }
  "[" + items.join(",") + "]"
}

///| Escape string for JSON
fn escape_json(s : String) -> String {
  let result = StringBuilder::new()
  for c in s {
    match c {
      '"' => result.write_string("\\\"")
      '\\' => result.write_string("\\\\")
      '\n' => result.write_string("\\n")
      '\r' => result.write_string("\\r")
      '\t' => result.write_string("\\t")
      _ => result.write_char(c)
    }
  }
  result.to_string()
}

///| Format datetime for display
fn format_datetime(iso : String) -> String {
  // Simple format: extract date and time parts
  // ISO format: 2024-01-15T10:00:00.000Z
  if iso.length() < 16 {
    return iso
  }
  let chars = iso.to_array()
  let result = StringBuilder::new()
  // Year
  for i = 0; i < 4; i = i + 1 {
    result.write_char(chars[i])
  }
  result.write_string("/")
  // Month
  result.write_char(chars[5])
  result.write_char(chars[6])
  result.write_string("/")
  // Day
  result.write_char(chars[8])
  result.write_char(chars[9])
  result.write_string(" ")
  // Hour
  result.write_char(chars[11])
  result.write_char(chars[12])
  result.write_string(":")
  // Minute
  result.write_char(chars[14])
  result.write_char(chars[15])
  result.to_string()
}

///| Format time only
fn format_time(iso : String) -> String {
  if iso.length() < 16 {
    return iso
  }
  let chars = iso.to_array()
  let result = StringBuilder::new()
  // Hour
  result.write_char(chars[11])
  result.write_char(chars[12])
  result.write_string(":")
  // Minute
  result.write_char(chars[14])
  result.write_char(chars[15])
  result.to_string()
}

///| Get status label in Japanese
fn status_label(status : String) -> String {
  match status {
    "requested" => "リクエスト中"
    "approved" => "承認済み"
    "rejected" => "却下"
    "cancelled" => "キャンセル"
    "confirmed" => "確定"
    "completed" => "完了"
    _ => status
  }
}

///| Create hidden input element
fn input_hidden(name : String, value : String) -> @luna.Node[Unit] {
  @luna.h("input", [
    ("type", @luna.attr_static("hidden")),
    ("name", @luna.attr_static(name)),
    ("value", @luna.attr_static(value)),
  ], [])
}

///| Create main element (named html_main to avoid conflict with MoonBit's main)
fn html_main(class? : String, children : Array[@luna.Node[Unit]]) -> @luna.Node[Unit] {
  let props : Array[(String, @luna.Attr[Unit])] = []
  if class is Some(v) {
    props.push(("class", @luna.attr_static(v)))
  }
  @luna.h("main", props, children)
}

// =============================================================================
// Router Configuration
// =============================================================================

///|
const ROOT : String =
  #|<!DOCTYPE html>
  #|<html lang="ja">
  #|<head>
  #|  <meta charset="UTF-8">
  #|  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  #|  <meta name="description" content="レッスン予約システム - 講師と生徒をつなぐシンプルな予約プラットフォーム">
  #|  <title>__LUNA_TITLE__</title>
  #|  <link rel="preconnect" href="https://fonts.googleapis.com">
  #|  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  #|  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  #|  <style>
  #|    :root {
  #|      --color-bg: #f8fafc;
  #|      --color-surface: #ffffff;
  #|      --color-text: #1e293b;
  #|      --color-text-muted: #64748b;
  #|      --color-border: #e2e8f0;
  #|      --color-primary: #3b82f6;
  #|      --color-primary-hover: #2563eb;
  #|      --color-success: #22c55e;
  #|      --color-warning: #f59e0b;
  #|      --color-danger: #ef4444;
  #|      --font-sans: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif;
  #|      --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  #|      --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  #|      --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  #|      --radius-sm: 6px;
  #|      --radius-md: 10px;
  #|      --radius-lg: 16px;
  #|    }
  #|    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  #|    body {
  #|      font-family: var(--font-sans);
  #|      font-size: 15px;
  #|      line-height: 1.6;
  #|      color: var(--color-text);
  #|      background: var(--color-bg);
  #|    }
  #|    h1, h2, h3, h4 { font-weight: 600; line-height: 1.3; }
  #|    h1 { font-size: 1.75rem; margin-bottom: 1.5rem; }
  #|    h2 { font-size: 1.35rem; margin: 2rem 0 1rem; }
  #|    h3 { font-size: 1.1rem; }
  #|    a { color: var(--color-primary); text-decoration: none; }
  #|    a:hover { text-decoration: underline; }
  #|    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
  #|    .main-nav {
  #|      display: flex;
  #|      justify-content: space-between;
  #|      align-items: center;
  #|      padding: 16px 24px;
  #|      background: var(--color-surface);
  #|      border-radius: var(--radius-lg);
  #|      margin-bottom: 24px;
  #|      box-shadow: var(--shadow-sm);
  #|    }
  #|    .main-nav strong { font-size: 1.25rem; color: var(--color-text); }
  #|    .nav-right { display: flex; gap: 12px; align-items: center; }
  #|    .app-container { display: flex; gap: 24px; min-height: 100vh; }
  #|    .sidebar {
  #|      width: 250px;
  #|      background: var(--color-surface);
  #|      padding: 24px;
  #|      border-radius: var(--radius-lg);
  #|      box-shadow: var(--shadow-sm);
  #|      height: fit-content;
  #|      position: sticky;
  #|      top: 20px;
  #|    }
  #|    .sidebar-header { margin-bottom: 24px; }
  #|    .sidebar-header h3 { color: var(--color-text-muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  #|    .sidebar-header .user-name { font-weight: 600; margin-top: 8px; }
  #|    .sidebar ul { list-style: none; }
  #|    .sidebar li { margin-bottom: 4px; }
  #|    .sidebar a {
  #|      display: block;
  #|      padding: 10px 14px;
  #|      border-radius: var(--radius-sm);
  #|      color: var(--color-text);
  #|      transition: background 0.2s;
  #|    }
  #|    .sidebar a:hover { background: var(--color-bg); text-decoration: none; }
  #|    .sidebar-footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--color-border); }
  #|    .logout-link { color: var(--color-text-muted); font-size: 0.9rem; }
  #|    .main-content { flex: 1; min-width: 0; padding: 24px; background: var(--color-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
  #|    .btn {
  #|      display: inline-flex;
  #|      align-items: center;
  #|      justify-content: center;
  #|      padding: 10px 20px;
  #|      font-family: var(--font-sans);
  #|      font-size: 0.9rem;
  #|      font-weight: 500;
  #|      background: var(--color-primary);
  #|      color: white;
  #|      border: none;
  #|      border-radius: var(--radius-sm);
  #|      cursor: pointer;
  #|      transition: all 0.2s;
  #|    }
  #|    .btn:hover { background: var(--color-primary-hover); text-decoration: none; }
  #|    .btn-secondary { background: var(--color-border); color: var(--color-text); }
  #|    .btn-secondary:hover { background: #cbd5e1; }
  #|    .btn-outline { background: transparent; border: 1px solid var(--color-border); color: var(--color-text); }
  #|    .btn-outline:hover { background: var(--color-bg); }
  #|    .btn-danger { background: var(--color-danger); }
  #|    .btn-danger:hover { background: #dc2626; }
  #|    .btn-small { padding: 6px 12px; font-size: 0.8rem; }
  #|    .btn-large { padding: 14px 28px; font-size: 1rem; }
  #|    .hero { text-align: center; padding: 60px 20px; }
  #|    .hero h1 { font-size: 2.5rem; margin-bottom: 16px; }
  #|    .hero-subtitle { font-size: 1.1rem; color: var(--color-text-muted); margin-bottom: 32px; }
  #|    .hero-actions { display: flex; gap: 16px; justify-content: center; }
  #|    .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-top: 48px; }
  #|    .feature-card {
  #|      background: var(--color-surface);
  #|      padding: 28px;
  #|      border-radius: var(--radius-md);
  #|      box-shadow: var(--shadow-sm);
  #|    }
  #|    .feature-card h3 { margin-bottom: 12px; }
  #|    .feature-card p { color: var(--color-text-muted); }
  #|    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 32px; }
  #|    .stat-card {
  #|      background: var(--color-bg);
  #|      padding: 24px;
  #|      border-radius: var(--radius-md);
  #|      text-align: center;
  #|    }
  #|    .stat-card h3 { font-size: 2.5rem; color: var(--color-primary); margin-bottom: 8px; }
  #|    .stat-card p { color: var(--color-text-muted); margin-bottom: 12px; }
  #|    .quick-actions { display: flex; gap: 12px; flex-wrap: wrap; }
  #|    .booking-card, .request-card, .course-card, .availability-card {
  #|      background: var(--color-bg);
  #|      padding: 20px;
  #|      border-radius: var(--radius-md);
  #|      margin-bottom: 16px;
  #|    }
  #|    .booking-card h4, .request-card h4, .course-card h4 { margin-bottom: 8px; }
  #|    .booking-card p, .request-card p, .course-card p { color: var(--color-text-muted); font-size: 0.9rem; margin-bottom: 4px; }
  #|    .status-badge {
  #|      display: inline-block;
  #|      padding: 4px 10px;
  #|      border-radius: 20px;
  #|      font-size: 0.75rem;
  #|      font-weight: 500;
  #|      text-transform: uppercase;
  #|    }
  #|    .status-requested { background: #fef3c7; color: #92400e; }
  #|    .status-approved, .status-confirmed { background: #dcfce7; color: #166534; }
  #|    .status-rejected, .status-cancelled { background: #fee2e2; color: #991b1b; }
  #|    .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
  #|    .badge-active { background: #dcfce7; color: #166534; }
  #|    .badge-inactive { background: #f3f4f6; color: #6b7280; }
  #|    .booking-list, .request-list, .course-list, .availability-list { margin-top: 16px; }
  #|    .empty-state { text-align: center; padding: 40px; color: var(--color-text-muted); }
  #|    .empty-state .btn { margin-top: 16px; }
  #|    .slot-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  #|    .instructor-badge { background: var(--color-primary); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; }
  #|    .slot-details { margin-bottom: 16px; }
  #|    .slot-details p { margin-bottom: 4px; }
  #|    .course-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  #|    .course-meta { display: flex; gap: 16px; margin-top: 12px; color: var(--color-text-muted); font-size: 0.85rem; }
  #|    .availability-item {
  #|      display: flex;
  #|      justify-content: space-between;
  #|      align-items: center;
  #|      padding: 16px;
  #|      background: var(--color-bg);
  #|      border-radius: var(--radius-sm);
  #|      margin-bottom: 8px;
  #|    }
  #|    .slot-info p { margin: 0; }
  #|    .slot-time { font-weight: 600; }
  #|    .request-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  #|    .form-group { margin-bottom: 20px; }
  #|    .form-group label { display: block; font-weight: 500; margin-bottom: 8px; }
  #|    .form-group input, .form-group select, .form-group textarea {
  #|      width: 100%;
  #|      padding: 10px 14px;
  #|      font-size: 1rem;
  #|      font-family: var(--font-sans);
  #|      border: 1px solid var(--color-border);
  #|      border-radius: var(--radius-sm);
  #|      background: var(--color-surface);
  #|    }
  #|    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
  #|      outline: none;
  #|      border-color: var(--color-primary);
  #|      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  #|    }
  #|    .form-actions { margin-top: 24px; }
  #|    .calendar-grid {
  #|      display: grid;
  #|      grid-template-columns: repeat(7, 1fr);
  #|      gap: 4px;
  #|      margin-top: 16px;
  #|    }
  #|    .calendar-header { text-align: center; font-weight: 600; padding: 8px; color: var(--color-text-muted); font-size: 0.8rem; }
  #|    .calendar-day {
  #|      aspect-ratio: 1;
  #|      display: flex;
  #|      align-items: center;
  #|      justify-content: center;
  #|      border-radius: var(--radius-sm);
  #|      cursor: pointer;
  #|      transition: all 0.2s;
  #|    }
  #|    .calendar-day:hover { background: var(--color-bg); }
  #|    .calendar-day.selected { background: var(--color-primary); color: white; }
  #|    .calendar-day.disabled { color: var(--color-text-muted); cursor: not-allowed; }
  #|    .time-slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
  #|    .time-slot {
  #|      padding: 10px;
  #|      text-align: center;
  #|      border: 1px solid var(--color-border);
  #|      border-radius: var(--radius-sm);
  #|      cursor: pointer;
  #|      transition: all 0.2s;
  #|    }
  #|    .time-slot:hover { border-color: var(--color-primary); }
  #|    .time-slot.selected { background: var(--color-primary); color: white; border-color: var(--color-primary); }
  #|    .approval-list { margin-top: 16px; }
  #|    .approval-item {
  #|      display: flex;
  #|      align-items: flex-start;
  #|      gap: 16px;
  #|      padding: 16px;
  #|      background: var(--color-bg);
  #|      border-radius: var(--radius-md);
  #|      margin-bottom: 12px;
  #|    }
  #|    .approval-checkbox { margin-top: 4px; width: 20px; height: 20px; cursor: pointer; }
  #|    .approval-info { flex: 1; }
  #|    .approval-info h4 { margin-bottom: 4px; }
  #|    .approval-info p { color: var(--color-text-muted); font-size: 0.9rem; margin: 0; }
  #|    .approval-actions { margin-top: 24px; display: flex; gap: 12px; }
  #|    .toast {
  #|      position: fixed;
  #|      top: 20px;
  #|      right: 20px;
  #|      padding: 12px 20px;
  #|      border-radius: var(--radius-md);
  #|      color: white;
  #|      font-weight: 500;
  #|      z-index: 1000;
  #|      animation: slideIn 0.3s ease;
  #|    }
  #|    .toast-success { background: var(--color-success); }
  #|    .toast-error { background: var(--color-danger); }
  #|    @keyframes slideIn {
  #|      from { transform: translateX(100%); opacity: 0; }
  #|      to { transform: translateX(0); opacity: 1; }
  #|    }
  #|    .redirect-message { text-align: center; padding: 40px; }
  #|    @media (max-width: 768px) {
  #|      .app-container { flex-direction: column; }
  #|      .sidebar { width: 100%; position: static; }
  #|      .hero h1 { font-size: 1.75rem; }
  #|      .features { grid-template-columns: 1fr; }
  #|      .stats-grid { grid-template-columns: 1fr; }
  #|      .time-slots { grid-template-columns: repeat(2, 1fr); }
  #|    }
  #|  </style>
  #|  __LUNA_HEAD__
  #|</head>
  #|<body>
  #|  <div id="__sol__">__LUNA_MAIN__</div>
  #|  <script src="/loader.js"></script>
  #|</body>
  #|</html>

///|
pub fn config() -> @router.RouterConfig {
  @router.RouterConfig::default()
  .with_root_template(ROOT)
  .with_loader_url("/loader.js")
}

// =============================================================================
// Server Actions
// =============================================================================

///| Create course action
let create_course_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let instructor_id = get_str(data, "instructor_id")
  let name = get_str(data, "name")
  let description = get_str(data, "description")
  let duration_str = get_str(data, "duration_minutes")
  let max_str = get_str(data, "max_participants")

  if name == "" {
    return @action.ActionResult::bad_request("コース名は必須です")
  }

  let duration = parse_int(duration_str, 60)
  let max_participants = parse_int(max_str, 1)
  let id = generate_uuid()

  let _result = db_create_course(id, name, description, duration, max_participants, instructor_id)

  @action.ActionResult::ok(
    action_json_response(true, "コースを作成しました", "")
  )
})

///| Create availability action
let create_availability_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let instructor_id = get_str(data, "instructor_id")
  let course_id = get_str(data, "course_id")
  let start_time = get_str(data, "start_time")
  let end_time = get_str(data, "end_time")
  let max_str = get_str(data, "max_participants")

  if start_time == "" || end_time == "" {
    return @action.ActionResult::bad_request("開始時間と終了時間は必須です")
  }

  let max_participants = parse_int(max_str, 1)
  let id = generate_uuid()

  let _result = db_create_availability(id, instructor_id, course_id, start_time, end_time, max_participants)

  @action.ActionResult::ok(
    action_json_response(true, "空き時間を登録しました", "")
  )
})

///| Delete availability action
let delete_availability_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let id = get_str(data, "id")

  if id == "" {
    return @action.ActionResult::bad_request("IDは必須です")
  }

  let _result = db_delete_availability(id)

  @action.ActionResult::ok(
    action_json_response(true, "空き時間を削除しました", "")
  )
})

///| Create booking request action
let create_booking_request_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let availability_id = get_str(data, "availability_id")
  let student_id = get_str(data, "student_id")
  let preference_str = get_str(data, "preference_order")
  let message = get_str(data, "message")

  if availability_id == "" || student_id == "" {
    return @action.ActionResult::bad_request("必須パラメータが不足しています")
  }

  let preference_order = parse_int(preference_str, 1)
  let id = generate_uuid()

  let _result = db_create_booking_request(id, availability_id, student_id, preference_order, message)

  @action.ActionResult::ok(
    action_json_response(true, "予約リクエストを送信しました", "")
  )
})

///| Approve booking requests action (can handle multiple)
let approve_requests_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let request_ids_str = get_str(data, "request_ids")
  let availability_id = get_str(data, "availability_id")
  let instructor_id = get_str(data, "instructor_id")

  if request_ids_str == "" {
    return @action.ActionResult::bad_request("リクエストIDは必須です")
  }

  // Parse comma-separated request IDs
  let request_ids = split_by_char(request_ids_str, ',')

  // Get availability info
  let availability = db_get_availability_by_id(availability_id)
  if is_null(availability) {
    return @action.ActionResult::bad_request("空き時間が見つかりません")
  }

  let start_time = get_str(availability, "start_time")
  let end_time = get_str(availability, "end_time")
  let course_id = get_str(availability, "course_id")
  let is_group = request_ids.length() > 1

  // Create booking
  let booking_id = generate_uuid()
  let _booking = db_create_booking(
    booking_id,
    availability_id,
    if course_id == "" { "default" } else { course_id },
    instructor_id,
    start_time,
    end_time,
    if is_group { 1 } else { 0 }
  )

  // Approve each request and add participants
  for request_id in request_ids {
    if request_id != "" {
      let _update = db_update_request_status(request_id, "approved", "")
      // Note: Calendar event creation would be called from client via /api/calendar/create-event
    }
  }

  @action.ActionResult::ok(
    action_json_response(true, "予約を承認しました", "")
  )
})

///| Reject booking request action
let reject_request_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let request_id = get_str(data, "request_id")

  if request_id == "" {
    return @action.ActionResult::bad_request("リクエストIDは必須です")
  }

  let _result = db_update_request_status(request_id, "rejected", "")

  @action.ActionResult::ok(
    action_json_response(true, "リクエストを却下しました", "")
  )
})

///| Cancel booking request action (student cancels their own request)
let cancel_booking_request_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let request_id = get_str(data, "request_id")
  let student_id = get_str(data, "student_id")

  if request_id == "" {
    return @action.ActionResult::bad_request("リクエストIDは必須です")
  }

  // Verify the request belongs to this student (security check)
  let request = db_get_booking_request_by_id(request_id)
  if is_null(request) {
    return @action.ActionResult::bad_request("リクエストが見つかりません")
  }

  let request_student_id = get_str(request, "student_id")
  if request_student_id != student_id {
    return @action.ActionResult::bad_request("このリクエストをキャンセルする権限がありません")
  }

  let status = get_str(request, "status")
  if status != "requested" {
    return @action.ActionResult::bad_request("このリクエストはキャンセルできません（ステータス: " + status + "）")
  }

  let _result = db_update_request_status(request_id, "cancelled", "")

  @action.ActionResult::ok(
    action_json_response(true, "リクエストをキャンセルしました", "")
  )
})

///| Cancel confirmed booking action
let cancel_booking_action : @action.ActionHandler = @action.ActionHandler(async fn(ctx) {
  let content_type = ctx.get_header("Content-Type").unwrap_or("")
  let data = parse_request_body(content_type, ctx.body)
  let booking_id = get_str(data, "booking_id")
  let user_id = get_str(data, "user_id")

  if booking_id == "" {
    return @action.ActionResult::bad_request("予約IDは必須です")
  }

  // Get booking and verify user is participant or instructor
  let booking = db_get_booking_by_id(booking_id)
  if is_null(booking) {
    return @action.ActionResult::bad_request("予約が見つかりません")
  }

  let instructor_id = get_str(booking, "instructor_id")
  let is_instructor = instructor_id == user_id
  let is_participant = db_is_booking_participant(booking_id, user_id)

  if not(is_instructor) && not(is_participant) {
    return @action.ActionResult::bad_request("この予約をキャンセルする権限がありません")
  }

  let status = get_str(booking, "status")
  if status != "confirmed" {
    return @action.ActionResult::bad_request("この予約はキャンセルできません（ステータス: " + status + "）")
  }

  // Cancel the booking
  let _result = db_update_booking_status(booking_id, "cancelled")

  // TODO: Delete calendar events via API call from client side

  @action.ActionResult::ok(
    action_json_response(true, "予約をキャンセルしました", "")
  )
})

///| Create JSON response for action
fn action_json_response(success : Bool, message : String, slug : String) -> @core.Any {
  @core.from_entries([
    ("success", @core.any(success)),
    ("message", @core.any(message)),
    ("slug", @core.any(slug)),
  ])
}

///| Parse request body (JSON or form-urlencoded)
fn parse_request_body(content_type : String, body : String) -> @core.Any {
  let is_form = content_type.contains("application/x-www-form-urlencoded")
  if is_form {
    parse_form_urlencoded(body)
  } else {
    parse_json(body)
  }
}

///| Parse JSON string
fn parse_json(s : String) -> @core.Any {
  try {
    @core.try_sync(fn() { @core.json_parse(s) })
  } catch {
    @core.JsError(_) => @core.new_object()
  }
}

///| Safely decode URI component
extern "js" fn safe_decode_uri(s : String) -> String =
  #| (s) => {
  #|   try {
  #|     return decodeURIComponent(s.replace(/\+/g, ' '));
  #|   } catch (e) {
  #|     return s.replace(/\+/g, ' ');
  #|   }
  #| }

///| Parse form-urlencoded string
fn parse_form_urlencoded(s : String) -> @core.Any {
  let result = @core.new_object()
  if s == "" {
    return result
  }
  let pairs = split_by_char(s, '&')
  for pair in pairs {
    if pair == "" {
      continue
    }
    let chars = pair.to_array()
    let mut eq_idx = -1
    for i, c in chars {
      if c == '=' {
        eq_idx = i
        break
      }
    }
    if eq_idx >= 0 {
      let key = safe_decode_uri(extract_substring(chars, 0, eq_idx))
      let value = safe_decode_uri(extract_substring(chars, eq_idx + 1, chars.length()))
      result._set(key, @core.any(value))
    } else {
      let key = safe_decode_uri(pair)
      result._set(key, @core.any(""))
    }
  }
  result
}

///| Split string by separator character
fn split_by_char(s : String, sep : Char) -> Array[String] {
  let result : Array[String] = []
  let current = StringBuilder::new()
  for c in s {
    if c == sep {
      result.push(current.to_string())
      current.reset()
    } else {
      current.write_char(c)
    }
  }
  result.push(current.to_string())
  result
}

///| Extract substring from char array
fn extract_substring(chars : Array[Char], start : Int, end : Int) -> String {
  let result = StringBuilder::new()
  for i = start; i < end && i < chars.length(); i = i + 1 {
    result.write_char(chars[i])
  }
  result.to_string()
}

///| Parse int with default value
fn parse_int(s : String, default_val : Int) -> Int {
  if s == "" {
    return default_val
  }
  let chars = s.to_array()
  let mut result = 0
  let mut is_negative = false
  let mut start = 0
  if chars.length() > 0 && chars[0] == '-' {
    is_negative = true
    start = 1
  }
  for i = start; i < chars.length(); i = i + 1 {
    let c = chars[i]
    if c >= '0' && c <= '9' {
      result = result * 10 + (c.to_int() - '0'.to_int())
    } else {
      break
    }
  }
  if is_negative { -result } else { result }
}

///| Action registry
pub fn action_registry() -> @action.ActionRegistry {
  @action.ActionRegistry::new(allowed_origins=[
    "http://localhost:3000",
    "http://localhost:8787",
    "https://lesson-booking.workers.dev",
  ])
  .register(@action.ActionDef::new("create-course", create_course_action).with_require_json(false))
  .register(@action.ActionDef::new("create-availability", create_availability_action).with_require_json(false))
  .register(@action.ActionDef::new("delete-availability", delete_availability_action).with_require_json(false))
  .register(@action.ActionDef::new("create-booking-request", create_booking_request_action).with_require_json(false))
  .register(@action.ActionDef::new("approve-requests", approve_requests_action).with_require_json(false))
  .register(@action.ActionDef::new("reject-request", reject_request_action).with_require_json(false))
  .register(@action.ActionDef::new("cancel-booking-request", cancel_booking_request_action).with_require_json(false))
  .register(@action.ActionDef::new("cancel-booking", cancel_booking_action).with_require_json(false))
}
