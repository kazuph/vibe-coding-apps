///| Cancel Button Island Component
///| Allows students to cancel their booking requests

///| Props for cancel button
pub(all) struct CancelButtonProps {
  request_id : String
  student_id : String
  status : String // Current status of the request
} derive(ToJson, FromJson)

///| Cancel button component
pub fn cancel_button(props : CancelButtonProps) -> DomNode {
  let is_submitting = @signal.signal(false)
  let result_msg = @signal.signal("")
  let is_error = @signal.signal(false)
  let is_success = @signal.signal(false)

  // Only show cancel button for "requested" status
  let can_cancel = props.status == "requested"

  // Handle cancel action
  let handle_cancel : @element.MouseHandler = fn(_e) {
    // Confirm before cancelling
    if not(confirm_cancel()) {
      return
    }

    is_submitting.set(true)
    is_error.set(false)
    is_success.set(false)
    result_msg.set("キャンセル中...")

    let form_data = @js.from_entries([
      ("request_id", @js.identity(props.request_id)),
      ("student_id", @js.identity(props.student_id)),
    ])

    let handle_response : (@action.ActionResponse) -> Unit = fn(response) {
      match response {
        @action.ActionResponse::Success(_) => {
          is_submitting.set(false)
          is_success.set(true)
          result_msg.set("リクエストをキャンセルしました")
          // Reload page after short delay
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

    @action.invoke_action("/_action/cancel-booking-request", form_data, handle_response)
  }

  div(class="cancel-button-island", [
    // Result message
    @element.show(
      fn() { result_msg.get() != "" },
      fn() {
        div(
          class="cancel-result",
          dyn_class=fn() {
            if is_error.get() { "cancel-result error" }
            else if is_success.get() { "cancel-result success" }
            else { "cancel-result" }
          },
          [text(result_msg.get())],
        )
      },
    ),
    // Cancel button (only if can cancel)
    @element.show(
      fn() { can_cancel && not(is_success.get()) },
      fn() {
        button(
          class="btn btn-danger btn-small",
          on=events().click(handle_cancel),
          dyn_attrs=[("disabled", @element.AttrValue::Dynamic(fn() {
            if is_submitting.get() { "true" } else { "__remove__" }
          }))],
          [text(if is_submitting.get() { "キャンセル中..." } else { "キャンセル" })],
        )
      },
    ),
  ])
}

///| Confirm cancel dialog
extern "js" fn confirm_cancel() -> Bool =
  #| () => window.confirm("予約リクエストをキャンセルしますか？")

// reload_page and set_timeout are in _common.mbt
