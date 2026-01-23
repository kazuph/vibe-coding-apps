///| Availability Calendar Island Component
///| Allows instructors to register available time slots

///| Props for availability calendar
pub(all) struct AvailabilityCalendarProps {
  instructor_id : String
  courses : String // JSON string of courses array
} derive(ToJson, FromJson)

///| Availability calendar component
pub fn availability_calendar(props : AvailabilityCalendarProps) -> DomNode {
  let is_submitting = @signal.signal(false)
  let result_msg = @signal.signal("")
  let is_error = @signal.signal(false)
  let is_success = @signal.signal(false)
  let selected_date = @signal.signal("")
  let selected_time = @signal.signal("09:00")
  let end_time = @signal.signal("10:00")
  let selected_course = @signal.signal("")
  let max_participants = @signal.signal("1")

  // Parse courses from JSON prop
  let courses = parse_courses_json(props.courses)

  // Form submit handler
  let handle_submit : @element.FormHandler = fn(e) {
    e.preventDefault()

    let date = selected_date.get()
    let time = selected_time.get()
    let end = end_time.get()

    if date == "" || time == "" {
      is_error.set(true)
      result_msg.set("日付と時間を選択してください")
      return
    }

    is_submitting.set(true)
    is_error.set(false)
    is_success.set(false)
    result_msg.set("登録中...")

    // Create ISO datetime strings
    let start_iso = date + "T" + time + ":00.000Z"
    let end_iso = date + "T" + end + ":00.000Z"

    let form_data = @js.from_entries([
      ("instructor_id", @js.identity(props.instructor_id)),
      ("course_id", @js.identity(selected_course.get())),
      ("start_time", @js.identity(start_iso)),
      ("end_time", @js.identity(end_iso)),
      ("max_participants", @js.identity(max_participants.get())),
    ])

    let handle_response : (@action.ActionResponse) -> Unit = fn(response) {
      match response {
        @action.ActionResponse::Success(_) => {
          is_submitting.set(false)
          is_success.set(true)
          result_msg.set("空き時間を登録しました")
          // Reset form
          selected_date.set("")
          selected_time.set("09:00")
          end_time.set("10:00")
          // Reload page
          set_timeout(fn() { reload_page() }, 1000)
        }
        @action.ActionResponse::Error(_, error_msg) => {
          is_submitting.set(false)
          is_error.set(true)
          result_msg.set(error_msg)
        }
        @action.ActionResponse::NetworkError(error_msg) => {
          is_submitting.set(false)
          is_error.set(true)
          result_msg.set("ネットワークエラー: " + error_msg)
        }
        @action.ActionResponse::Redirect(_) => {
          is_submitting.set(false)
        }
      }
    }

    @action.invoke_action("/_action/create-availability", form_data, handle_response)
  }

  // Generate time options
  fn time_options() -> Array[DomNode] {
    let options : Array[DomNode] = []
    for hour = 6; hour <= 22; hour = hour + 1 {
      for minute in [0, 30] {
        let h = if hour < 10 { "0" + hour.to_string() } else { hour.to_string() }
        let m = if minute == 0 { "00" } else { "30" }
        let time_val = h + ":" + m
        let is_selected = time_val == selected_time.get()
        options.push(
          create_element(
            "option",
            [
              ("value", @element.AttrValue::Static(time_val)),
              ("selected", @element.AttrValue::Static(if is_selected { "true" } else { "" })),
            ],
            [text(time_val)],
          )
        )
      }
    }
    options
  }

  fn end_time_options() -> Array[DomNode] {
    let options : Array[DomNode] = []
    for hour = 6; hour <= 23; hour = hour + 1 {
      for minute in [0, 30] {
        let h = if hour < 10 { "0" + hour.to_string() } else { hour.to_string() }
        let m = if minute == 0 { "00" } else { "30" }
        let time_val = h + ":" + m
        let is_selected = time_val == end_time.get()
        options.push(
          create_element(
            "option",
            [
              ("value", @element.AttrValue::Static(time_val)),
              ("selected", @element.AttrValue::Static(if is_selected { "true" } else { "" })),
            ],
            [text(time_val)],
          )
        )
      }
    }
    options
  }

  // Course options
  fn course_options() -> Array[DomNode] {
    let options : Array[DomNode] = [
      create_element("option", [("value", @element.AttrValue::Static(""))], [text("コースを選択（任意）")]),
    ]
    let len = courses_len(courses)
    for i = 0; i < len; i = i + 1 {
      let course = courses_get(courses, i)
      let id = course_id(course)
      let name = course_name(course)
      options.push(
        create_element(
          "option",
          [("value", @element.AttrValue::Static(id))],
          [text(name)],
        )
      )
    }
    options
  }

  div(class="availability-calendar-island", [
    h3([text("空き時間を登録")]),
    // Result message
    @element.show(
      fn() { result_msg.get() != "" },
      fn() {
        div(
          class="form-result",
          dyn_class=fn() {
            if is_error.get() { "form-result error" }
            else if is_success.get() { "form-result success" }
            else { "form-result" }
          },
          [text(result_msg.get())],
        )
      },
    ),
    form(
      class="availability-form",
      on=events().submit(handle_submit),
      [
        div(class="form-group", [
          label(for_="date", [text("日付")]),
          input(
            type_="date",
            id="date",
            name="date",
            attrs=[
              ("required", @element.AttrString("true")),
              ("min", @element.AttrString(get_today_date())),
            ],
            on=events().input(fn(e) {
              let target : @js_dom.HTMLInputElement = @js.identity(e.target())
              selected_date.set(target.value)
            }),
          ),
        ]),
        div(class="form-row", [
          div(class="form-group half", [
            label(for_="start-time", [text("開始時間")]),
            create_element(
              "select",
              [
                ("id", @element.AttrValue::Static("start-time")),
                ("name", @element.AttrValue::Static("start_time")),
                ("oninput", @element.AttrValue::Handler(fn(e) {
                  let target : @js_dom.HTMLSelectElement = @js.identity(e)
                  selected_time.set(target.value)
                  // Auto-set end time to 1 hour later
                  let new_end = calculate_end_time(target.value, 60)
                  end_time.set(new_end)
                })),
              ],
              time_options(),
            ),
          ]),
          div(class="form-group half", [
            label(for_="end-time", [text("終了時間")]),
            create_element(
              "select",
              [
                ("id", @element.AttrValue::Static("end-time")),
                ("name", @element.AttrValue::Static("end_time")),
                ("oninput", @element.AttrValue::Handler(fn(e) {
                  let target : @js_dom.HTMLSelectElement = @js.identity(e)
                  end_time.set(target.value)
                })),
              ],
              end_time_options(),
            ),
          ]),
        ]),
        div(class="form-row", [
          div(class="form-group half", [
            label(for_="course", [text("コース")]),
            create_element(
              "select",
              [
                ("id", @element.AttrValue::Static("course")),
                ("name", @element.AttrValue::Static("course_id")),
                ("oninput", @element.AttrValue::Handler(fn(e) {
                  let target : @js_dom.HTMLSelectElement = @js.identity(e)
                  selected_course.set(target.value)
                })),
              ],
              course_options(),
            ),
          ]),
          div(class="form-group half", [
            label(for_="max-participants", [text("最大人数")]),
            create_element(
              "select",
              [
                ("id", @element.AttrValue::Static("max-participants")),
                ("name", @element.AttrValue::Static("max_participants")),
                ("oninput", @element.AttrValue::Handler(fn(e) {
                  let target : @js_dom.HTMLSelectElement = @js.identity(e)
                  max_participants.set(target.value)
                })),
              ],
              [
                create_element("option", [("value", @element.AttrValue::Static("1")), ("selected", @element.AttrValue::Static("true"))], [text("1名")]),
                create_element("option", [("value", @element.AttrValue::Static("2"))], [text("2名")]),
                create_element("option", [("value", @element.AttrValue::Static("3"))], [text("3名")]),
              ],
            ),
          ]),
        ]),
        div(class="form-actions", [
          button(
            class="btn",
            attrs=[("type", @element.AttrString("submit"))],
            dyn_attrs=[("disabled", @element.AttrValue::Dynamic(fn() {
              if is_submitting.get() { "true" } else { "__remove__" }
            }))],
            [text(if is_submitting.get() { "登録中..." } else { "空き時間を登録" })],
          ),
        ]),
      ],
    ),
  ])
}

///| Parse courses JSON
extern "js" fn parse_courses_json(json : String) -> @js.Any =
  #| (json) => {
  #|   try {
  #|     return JSON.parse(json) || [];
  #|   } catch (e) {
  #|     return [];
  #|   }
  #| }

///| Get courses array length
extern "js" fn courses_len(courses : @js.Any) -> Int =
  #| (courses) => courses.length || 0

///| Get course at index
extern "js" fn courses_get(courses : @js.Any, idx : Int) -> @js.Any =
  #| (courses, idx) => courses[idx]

///| Get course id
extern "js" fn course_id(course : @js.Any) -> String =
  #| (course) => course.id || ''

///| Get course name
extern "js" fn course_name(course : @js.Any) -> String =
  #| (course) => course.name || ''

///| Get today's date in YYYY-MM-DD format
extern "js" fn get_today_date() -> String =
  #| () => new Date().toISOString().split('T')[0]

///| Calculate end time given start time and duration in minutes
extern "js" fn calculate_end_time(start : String, duration_minutes : Int) -> String =
  #| (start, duration) => {
  #|   const [h, m] = start.split(':').map(Number);
  #|   const totalMinutes = h * 60 + m + duration;
  #|   const newH = Math.floor(totalMinutes / 60) % 24;
  #|   const newM = totalMinutes % 60;
  #|   return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  #| }

///| Reload page
extern "js" fn reload_page() -> Unit =
  #| () => { window.location.reload(); }

///| Set timeout
extern "js" fn set_timeout(callback : () -> Unit, ms : Int) -> Unit =
  #| (callback, ms) => { setTimeout(callback, ms); }
