///| Booking Form Island Component
///| Allows students to submit booking requests for available slots

///| Props for booking form
pub(all) struct BookingFormProps {
  availability_id : String
  instructor_name : String
  course_name : String
  start_time : String
  end_time : String
} derive(ToJson, FromJson)

///| Booking form component
pub fn booking_form(props : BookingFormProps) -> DomNode {
  let is_submitting = @signal.signal(false)
  let result_msg = @signal.signal("")
  let is_error = @signal.signal(false)
  let is_success = @signal.signal(false)
  let preference = @signal.signal("1")
  let message = @signal.signal("")

  // Get current user ID from globalThis
  let user_id = get_current_user_id()

  // Form submit handler
  let handle_submit : @element.FormHandler = fn(e) {
    e.preventDefault()
    is_submitting.set(true)
    is_error.set(false)
    is_success.set(false)
    result_msg.set("送信中...")

    let form_data = @js.from_entries([
      ("availability_id", @js.identity(props.availability_id)),
      ("student_id", @js.identity(user_id)),
      ("preference_order", @js.identity(preference.get())),
      ("message", @js.identity(message.get())),
    ])

    let handle_response : (@action.ActionResponse) -> Unit = fn(response) {
      match response {
        @action.ActionResponse::Success(data) => {
          is_submitting.set(false)
          is_success.set(true)
          let msg = get_message(data)
          result_msg.set(msg)
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
        @action.ActionResponse::Redirect(url) => {
          is_submitting.set(false)
          redirect_to(url)
        }
      }
    }

    @action.invoke_action("/_action/create-booking-request", form_data, handle_response)
  }

  let on_preference_change : @element.InputHandler = fn(e) {
    let target : @js_dom.HTMLSelectElement = @js.identity(e.target())
    preference.set(target.value)
  }

  let on_message_input : @element.InputHandler = fn(e) {
    let target : @js_dom.HTMLTextAreaElement = @js.identity(e.target())
    message.set(target.value)
  }

  div(class="booking-form-island", [
    // Show success state
    @element.show(
      fn() { is_success.get() },
      fn() {
        div(class="form-success", [
          p(class="success-text", [text("✓ " + result_msg.get())]),
          p([text("講師が承認すると、レッスンが確定します。")]),
          button(
            class="btn btn-secondary",
            on=events().click(fn(_) { redirect_to("/student/requests") }),
            [text("リクエスト状況を見る")],
          ),
        ])
      },
    ),
    // Show form when not success
    @element.show(
      fn() { not(is_success.get()) },
      fn() {
        form(
          class="booking-request-form",
          on=events().submit(handle_submit),
          [
            // Error message
            @element.show(
              fn() { is_error.get() },
              fn() {
                div(class="form-error", [text(result_msg.get())])
              },
            ),
            // Preference selector
            div(class="form-group", [
              label(for_="preference", [text("希望順位")]),
              create_element(
                "select",
                [
                  ("id", @element.AttrValue::Static("preference")),
                  ("name", @element.AttrValue::Static("preference_order")),
                  ("class", @element.AttrValue::Static("preference-select")),
                  ("oninput", @element.AttrValue::Handler(fn(e) {
                    let target : @js_dom.HTMLSelectElement = @js.identity(e)
                    preference.set(target.value)
                  })),
                ],
                [
                  create_element("option", [("value", @element.AttrValue::Static("1"))], [text("第1希望")]),
                  create_element("option", [("value", @element.AttrValue::Static("2"))], [text("第2希望")]),
                  create_element("option", [("value", @element.AttrValue::Static("3"))], [text("第3希望")]),
                ],
              ),
            ]),
            // Message textarea
            div(class="form-group", [
              label(for_="message", [text("メッセージ（任意）")]),
              textarea(
                id="message",
                name="message",
                class="message-input",
                attrs=[("placeholder", @element.AttrString("講師へのメッセージがあれば入力してください"))],
                on=events().input(on_message_input),
                [],
              ),
            ]),
            // Submit button
            div(class="form-actions", [
              button(
                class="btn",
                attrs=[("type", @element.AttrString("submit"))],
                dyn_attrs=[("disabled", @element.AttrValue::Dynamic(fn() {
                  if is_submitting.get() { "true" } else { "__remove__" }
                }))],
                [text(if is_submitting.get() { "送信中..." } else { "予約リクエストを送信" })],
              ),
            ]),
          ],
        )
      },
    ),
  ])
}

// get_current_user_id and redirect_to are in _common.mbt

///| Get message from response
fn get_message(data : @js.Any) -> String {
  let val = data._get("message")
  if @js.is_nullish(val) {
    "成功"
  } else {
    val.to_string()
  }
}
