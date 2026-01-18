///| Course Form Island Component
///| Allows instructors to create new courses

///| Props for course form
pub(all) struct CourseFormProps {
  instructor_id : String
} derive(ToJson, FromJson)

///| Course form component
pub fn course_form(props : CourseFormProps) -> DomNode {
  let is_submitting = @signal.signal(false)
  let result_msg = @signal.signal("")
  let is_error = @signal.signal(false)
  let is_success = @signal.signal(false)
  let name = @signal.signal("")
  let description = @signal.signal("")
  let duration = @signal.signal("60")
  let max_participants = @signal.signal("1")

  // Form submit handler
  let handle_submit : @element.FormHandler = fn(e) {
    e.preventDefault()
    is_submitting.set(true)
    is_error.set(false)
    is_success.set(false)
    result_msg.set("作成中...")

    let form_data = @js.from_entries([
      ("instructor_id", @js.identity(props.instructor_id)),
      ("name", @js.identity(name.get())),
      ("description", @js.identity(description.get())),
      ("duration_minutes", @js.identity(duration.get())),
      ("max_participants", @js.identity(max_participants.get())),
    ])

    let handle_response : (@action.ActionResponse) -> Unit = fn(response) {
      match response {
        @action.ActionResponse::Success(_) => {
          is_submitting.set(false)
          is_success.set(true)
          result_msg.set("コースを作成しました")
          // Reset form
          name.set("")
          description.set("")
          duration.set("60")
          max_participants.set("1")
          // Reload page to show new course
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

    @action.invoke_action("/_action/create-course", form_data, handle_response)
  }

  div(class="course-form-island", [
    h3([text("新規コース作成")]),
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
      class="course-create-form",
      on=events().submit(handle_submit),
      [
        div(class="form-group", [
          label(for_="course-name", [text("コース名")]),
          input(
            type_="text",
            id="course-name",
            name="name",
            attrs=[
              ("required", @element.AttrString("true")),
              ("placeholder", @element.AttrString("例: ピアノ基礎コース")),
            ],
            on=events().input(fn(e) {
              let target : @js_dom.HTMLInputElement = @js.identity(e.target())
              name.set(target.value)
            }),
          ),
        ]),
        div(class="form-group", [
          label(for_="course-description", [text("説明")]),
          textarea(
            id="course-description",
            name="description",
            attrs=[("placeholder", @element.AttrString("コースの内容を説明してください"))],
            on=events().input(fn(e) {
              let target : @js_dom.HTMLTextAreaElement = @js.identity(e.target())
              description.set(target.value)
            }),
            [],
          ),
        ]),
        div(class="form-row", [
          div(class="form-group half", [
            label(for_="duration", [text("レッスン時間（分）")]),
            create_element(
              "select",
              [
                ("id", @element.AttrValue::Static("duration")),
                ("name", @element.AttrValue::Static("duration_minutes")),
                ("oninput", @element.AttrValue::Handler(fn(e) {
                  let target : @js_dom.HTMLSelectElement = @js.identity(e)
                  duration.set(target.value)
                })),
              ],
              [
                create_element("option", [("value", @element.AttrValue::Static("30"))], [text("30分")]),
                create_element("option", [("value", @element.AttrValue::Static("45"))], [text("45分")]),
                create_element("option", [("value", @element.AttrValue::Static("60")), ("selected", @element.AttrValue::Static("true"))], [text("60分")]),
                create_element("option", [("value", @element.AttrValue::Static("90"))], [text("90分")]),
                create_element("option", [("value", @element.AttrValue::Static("120"))], [text("120分")]),
              ],
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
                create_element("option", [("value", @element.AttrValue::Static("1")), ("selected", @element.AttrValue::Static("true"))], [text("1名（個人）")]),
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
            [text(if is_submitting.get() { "作成中..." } else { "コースを作成" })],
          ),
        ]),
      ],
    ),
  ])
}

///| Reload page
extern "js" fn reload_page() -> Unit =
  #| () => { window.location.reload(); }

///| Set timeout
extern "js" fn set_timeout(callback : () -> Unit, ms : Int) -> Unit =
  #| (callback, ms) => { setTimeout(callback, ms); }
