///| Common utility functions for Island Components
///| Shared across all client-side components

///| Reload page
pub extern "js" fn reload_page() -> Unit =
  #| () => { window.location.reload(); }

///| Set timeout
pub extern "js" fn set_timeout(callback : () -> Unit, ms : Int) -> Unit =
  #| (callback, ms) => { setTimeout(callback, ms); }

///| Redirect to URL
pub extern "js" fn redirect_to(url : String) -> Unit =
  #| (url) => { window.location.href = url; }

///| Get current user ID from globalThis
pub extern "js" fn get_current_user_id() -> String =
  #| () => {
  #|   const user = globalThis.__CURRENT_USER;
  #|   return user ? user.id : '';
  #| }

///| Confirm dialog
pub extern "js" fn confirm_dialog(message : String) -> Bool =
  #| (msg) => window.confirm(msg)
