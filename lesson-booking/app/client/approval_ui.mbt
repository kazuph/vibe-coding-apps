///| Approval UI Island Component
///| Allows instructors to approve/reject booking requests with group selection

///| Props for approval UI
pub(all) struct ApprovalUiProps {
  requests : String // JSON string of requests array
  instructor_id : String
} derive(ToJson, FromJson)

///| Approval UI component
pub fn approval_ui(props : ApprovalUiProps) -> DomNode {
  let is_submitting = @signal.signal(false)
  let result_msg = @signal.signal("")
  let is_error = @signal.signal(false)
  let is_success = @signal.signal(false)
  let selected_ids = @signal.signal("") // Comma-separated selected request IDs
  let current_availability_id = @signal.signal("")

  // Parse requests from JSON prop
  let requests = parse_requests_json(props.requests)

  // Toggle selection for a request
  fn toggle_selection(request_id : String, availability_id : String) -> Unit {
    let current = selected_ids.get()
    let current_avail = current_availability_id.get()

    // If selecting from a different availability, clear previous selections
    if current_avail != "" && current_avail != availability_id {
      selected_ids.set(request_id)
      current_availability_id.set(availability_id)
      return
    }

    current_availability_id.set(availability_id)

    // Parse current selections
    let ids = if current == "" {
      []
    } else {
      split_string(current, ',')
    }

    // Check if already selected
    let mut found = false
    let new_ids : Array[String] = []
    for id in ids {
      if id == request_id {
        found = true
      } else {
        new_ids.push(id)
      }
    }

    if found {
      // Was selected, now deselected
      selected_ids.set(join_string(new_ids, ','))
      if new_ids.length() == 0 {
        current_availability_id.set("")
      }
    } else {
      // Add to selection
      new_ids.push(request_id)
      selected_ids.set(join_string(new_ids, ','))
    }
  }

  // Check if a request is selected
  fn is_selected(request_id : String) -> Bool {
    let current = selected_ids.get()
    if current == "" {
      return false
    }
    let ids = split_string(current, ',')
    for id in ids {
      if id == request_id {
        return true
      }
    }
    false
  }

  // Handle approve action
  let handle_approve : @element.MouseHandler = fn(_e) {
    let ids = selected_ids.get()
    let avail_id = current_availability_id.get()

    if ids == "" {
      is_error.set(true)
      result_msg.set("承認するリクエストを選択してください")
      return
    }

    is_submitting.set(true)
    is_error.set(false)
    is_success.set(false)
    result_msg.set("承認処理中...")

    let form_data = @js.from_entries([
      ("request_ids", @js.identity(ids)),
      ("availability_id", @js.identity(avail_id)),
      ("instructor_id", @js.identity(props.instructor_id)),
    ])

    let handle_response : (@action.ActionResponse) -> Unit = fn(response) {
      match response {
        @action.ActionResponse::Success(_) => {
          is_submitting.set(false)
          is_success.set(true)
          result_msg.set("予約を承認しました")
          // Reload page
          set_timeout(fn() { reload_page() }, 1500)
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

    @action.invoke_action("/_action/approve-requests", form_data, handle_response)
  }

  // Handle reject for a single request
  fn handle_reject(request_id : String) -> Unit {
    is_submitting.set(true)
    is_error.set(false)
    is_success.set(false)
    result_msg.set("却下処理中...")

    let form_data = @js.from_entries([
      ("request_id", @js.identity(request_id)),
    ])

    let handle_response : (@action.ActionResponse) -> Unit = fn(response) {
      match response {
        @action.ActionResponse::Success(_) => {
          is_submitting.set(false)
          is_success.set(true)
          result_msg.set("リクエストを却下しました")
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

    @action.invoke_action("/_action/reject-request", form_data, handle_response)
  }

  // Build request items
  fn build_request_items() -> Array[DomNode] {
    let items : Array[DomNode] = []
    let len = requests_len(requests)

    for i = 0; i < len; i = i + 1 {
      let req = requests_get(requests, i)
      let id = get_request_field(req, "id")
      let avail_id = get_request_field(req, "availability_id")
      let student_name = get_request_field(req, "student_name")
      let student_email = get_request_field(req, "student_email")
      let start_time = get_request_field(req, "start_time")
      let end_time = get_request_field(req, "end_time")
      let course_name = get_request_field(req, "course_name")
      let preference_order = get_request_int(req, "preference_order")
      let max_participants = get_request_int(req, "max_participants")

      let req_id = id
      let req_avail_id = avail_id

      items.push(
        div(class="approval-item", [
          input(
            type_="checkbox",
            class="approval-checkbox",
            dyn_attrs=[
              ("checked", @element.AttrValue::Dynamic(fn() {
                if is_selected(req_id) { "true" } else { "__remove__" }
              })),
            ],
            on=events().click(fn(_) {
              toggle_selection(req_id, req_avail_id)
            }),
          ),
          div(class="approval-info", [
            h4([text(student_name)]),
            p([text("📧 " + student_email)]),
            p([text("📅 " + format_datetime(start_time) + " 〜 " + format_time(end_time))]),
            p([text(if course_name == "" { "コース未指定" } else { course_name })]),
            p([text("希望順位: 第" + preference_order.to_string() + "希望")]),
            p([text("最大" + max_participants.to_string() + "名まで選択可能")]),
          ]),
          div(class="approval-item-actions", [
            button(
              class="btn btn-danger btn-small",
              on=events().click(fn(_) { handle_reject(req_id) }),
              [text("却下")],
            ),
          ]),
        ])
      )
    }
    items
  }

  // Count selected items
  fn selected_count() -> Int {
    let current = selected_ids.get()
    if current == "" {
      0
    } else {
      split_string(current, ',').length()
    }
  }

  div(class="approval-ui-island", [
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
    // Instructions
    div(class="approval-instructions", [
      p([text("チェックボックスで承認するリクエストを選択してください。")]),
      p([text("同じ時間枠の複数のリクエストを選択すると、グループレッスンとして承認できます。")]),
    ]),
    // Request list
    div(class="approval-list", build_request_items()),
    // Approve button
    div(class="approval-actions", [
      button(
        class="btn",
        on=events().click(handle_approve),
        dyn_attrs=[("disabled", @element.AttrValue::Dynamic(fn() {
          if is_submitting.get() || selected_count() == 0 { "true" } else { "__remove__" }
        }))],
        [text(
          if is_submitting.get() { "処理中..." }
          else if selected_count() == 0 { "承認するリクエストを選択" }
          else if selected_count() > 1 { "グループレッスンとして承認 (" + selected_count().to_string() + "名)" }
          else { "選択したリクエストを承認" }
        )],
      ),
    ]),
  ])
}

///| Parse requests JSON
extern "js" fn parse_requests_json(json : String) -> @js.Any =
  #| (json) => {
  #|   try {
  #|     return JSON.parse(json) || [];
  #|   } catch (e) {
  #|     return [];
  #|   }
  #| }

///| Get requests array length
extern "js" fn requests_len(requests : @js.Any) -> Int =
  #| (requests) => requests.length || 0

///| Get request at index
extern "js" fn requests_get(requests : @js.Any, idx : Int) -> @js.Any =
  #| (requests, idx) => requests[idx]

///| Get request field as string
extern "js" fn get_request_field(req : @js.Any, field : String) -> String =
  #| (req, field) => req[field] || ''

///| Get request field as int
extern "js" fn get_request_int(req : @js.Any, field : String) -> Int =
  #| (req, field) => req[field] || 0

///| Format datetime for display
extern "js" fn format_datetime(iso : String) -> String =
  #| (iso) => {
  #|   if (!iso || iso.length < 16) return iso;
  #|   const d = new Date(iso);
  #|   return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  #| }

///| Format time only
extern "js" fn format_time(iso : String) -> String =
  #| (iso) => {
  #|   if (!iso || iso.length < 16) return iso;
  #|   const d = new Date(iso);
  #|   return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  #| }

///| Split string by separator
fn split_string(s : String, sep : Char) -> Array[String] {
  let result : Array[String] = []
  let current = StringBuilder::new()
  for c in s {
    if c == sep {
      let str = current.to_string()
      if str != "" {
        result.push(str)
      }
      current.reset()
    } else {
      current.write_char(c)
    }
  }
  let final_str = current.to_string()
  if final_str != "" {
    result.push(final_str)
  }
  result
}

///| Join strings with separator
fn join_string(arr : Array[String], sep : String) -> String {
  let result = StringBuilder::new()
  for i, s in arr {
    if i > 0 {
      result.write_string(sep)
    }
    result.write_string(s)
  }
  result.to_string()
}

///| Reload page
extern "js" fn reload_page() -> Unit =
  #| () => { window.location.reload(); }

///| Set timeout
extern "js" fn set_timeout(callback : () -> Unit, ms : Int) -> Unit =
  #| (callback, ms) => { setTimeout(callback, ms); }
