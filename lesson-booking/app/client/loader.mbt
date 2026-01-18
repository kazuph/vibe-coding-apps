///| Luna UI Loader v4 - MoonBit Implementation
///| Minimal dispatcher for Island Component hydration

///| Global state storage
let luna_state : Map[String, @js.Any] = {}

///| Loaded component tracker
let loaded_components : Map[String, Bool] = {}

// ============================================================================
// FFI: Browser DOM APIs
// ============================================================================

///| Query all elements matching selector
extern "js" fn query_selector_all(selector : String) -> @js.Any =
  #| (s) => document.querySelectorAll(s)

///| Get element by ID
extern "js" fn get_element_by_id(id : String) -> @js.Any =
  #| (id) => document.getElementById(id)

///| Get attribute from element
extern "js" fn get_attribute(el : @js.Any, name : String) -> String =
  #| (el, name) => el.getAttribute(name) ?? ""

///| Check if element has attribute
extern "js" fn has_attribute(el : @js.Any, name : String) -> Bool =
  #| (el, name) => el.hasAttribute(name)

///| Get element tag name (lowercase)
extern "js" fn get_tag_name(el : @js.Any) -> String =
  #| (el) => el.tagName.toLowerCase()

///| Get text content of element
extern "js" fn get_text_content(el : @js.Any) -> String =
  #| (el) => el.textContent ?? ""

///| Check if element is null/undefined
extern "js" fn is_null_element(el : @js.Any) -> Bool =
  #| (el) => el == null || el === undefined

///| Get array length
extern "js" fn get_length(arr : @js.Any) -> Int =
  #| (arr) => arr.length

///| Get array item at index
extern "js" fn get_item(arr : @js.Any, idx : Int) -> @js.Any =
  #| (arr, idx) => arr[idx]

///| Check document ready state
extern "js" fn is_document_loading() -> Bool =
  #| () => document.readyState === "loading"

///| Add DOMContentLoaded listener
extern "js" fn add_dom_ready_listener(callback : () -> Unit) -> Unit =
  #| (cb) => document.addEventListener("DOMContentLoaded", cb, { once: true })

// ============================================================================
// FFI: Trigger APIs
// ============================================================================

///| Request idle callback
extern "js" fn request_idle_callback(callback : () -> Unit) -> Unit =
  #| (cb) => requestIdleCallback(cb)

///| Create IntersectionObserver for visibility trigger
extern "js" fn create_visibility_observer(el : @js.Any, callback : () -> Unit) -> Unit =
  #| (el, cb) => {
  #|   new IntersectionObserver((entries, obs) => {
  #|     if (entries.some(e => e.isIntersecting)) {
  #|       obs.disconnect();
  #|       cb();
  #|     }
  #|   }, { rootMargin: "50px" }).observe(el);
  #| }

///| Create media query listener
extern "js" fn create_media_listener(query : String, callback : () -> Unit) -> Unit =
  #| (query, cb) => {
  #|   const mq = matchMedia(query);
  #|   const handler = () => {
  #|     if (mq.matches) {
  #|       mq.removeEventListener("change", handler);
  #|       cb();
  #|     }
  #|   };
  #|   mq.matches ? cb() : mq.addEventListener("change", handler);
  #| }

// ============================================================================
// FFI: MutationObserver
// ============================================================================

///| Observe DOM additions with luna:url attribute
extern "js" fn observe_dom_additions(setup_fn : (@js.Any) -> Unit) -> Unit =
  #| (setupFn) => {
  #|   new MutationObserver((mutations) => {
  #|     mutations.forEach(m => m.addedNodes.forEach(n => {
  #|       if (n.nodeType === 1 && n.hasAttribute("luna:url")) setupFn(n);
  #|     }));
  #|   }).observe(document.body ?? document.documentElement, {
  #|     childList: true,
  #|     subtree: true
  #|   });
  #| }

// ============================================================================
// FFI: Dynamic Import
// ============================================================================

///| Dynamic import and call hydrate function
extern "js" fn dynamic_import_and_hydrate(
  url : String,
  export_name : String,
  el : @js.Any,
  state : @js.Any,
  id : String
) -> Unit =
  #| async (url, exportName, el, state, id) => {
  #|   try {
  #|     const mod = await import(url);
  #|     const fn = exportName ? mod[exportName] : (mod.hydrate ?? mod.default);
  #|     if (fn) fn(el, state, id);
  #|   } catch (e) {
  #|     console.warn(`[luna] Failed to load ${url}:`, e);
  #|   }
  #| }

// ============================================================================
// FFI: Global API registration
// ============================================================================

///| Set global variable on window
extern "js" fn set_global(name : String, value : @js.Any) -> Unit =
  #| (name, value) => { window[name] = value; }

///| Create JS function wrapper for scan
extern "js" fn create_scan_wrapper(scan_fn : () -> Unit) -> @js.Any =
  #| (fn) => fn

///| Create JS function wrapper for hydrate
extern "js" fn create_hydrate_wrapper(hydrate_fn : (@js.Any) -> Unit) -> @js.Any =
  #| (fn) => fn

///| Create JS function wrapper for unload
extern "js" fn create_unload_wrapper(unload_fn : (String) -> Unit) -> @js.Any =
  #| (fn) => fn

///| Create JS function wrapper for clear
extern "js" fn create_clear_wrapper(clear_fn : () -> Unit) -> @js.Any =
  #| (fn) => fn

///| Convert MoonBit hashmap to JS object for __LUNA_STATE__
extern "js" fn hashmap_to_js_object(get_fn : (String) -> @js.Any) -> @js.Any =
  #| (getFn) => new Proxy({}, { get: (_, key) => getFn(key) })

// ============================================================================
// Pure MoonBit Logic
// ============================================================================

///| Parse state from luna:state attribute
fn parse_state(el : @js.Any) -> @js.Any {
  let attr = get_attribute(el, "luna:state")
  if attr == "" {
    return @js.null()
  }
  // If starts with #, get from script element
  if attr.length() > 0 && attr[0] == '#' {
    let id = attr.substring(start=1)
    let script_el = get_element_by_id(id)
    if is_null_element(script_el) {
      return @js.null()
    }
    let text = get_text_content(script_el)
    return parse_json_to_js(text)
  }
  // Otherwise, parse as inline JSON
  parse_json_to_js(attr)
}

///| Parse JSON string to JS object
extern "js" fn parse_json_to_js(json_str : String) -> @js.Any =
  #| (s) => { try { return JSON.parse(s); } catch { return null; } }

///| Check if component is already loaded
fn is_loaded(id : String) -> Bool {
  match loaded_components.get(id) {
    Some(true) => true
    _ => false
  }
}

///| Mark component as loaded
fn mark_loaded(id : String) -> Unit {
  loaded_components.set(id, true)
}

///| Unload component
pub fn unload(id : String) -> Unit {
  loaded_components.remove(id)
}

///| Clear all loaded components
pub fn clear_loaded() -> Unit {
  loaded_components.clear()
}

///| Hydrate a single element
pub fn hydrate(el : @js.Any) -> Unit {
  let id = get_attribute(el, "luna:id")
  let component_id = if id == "" { get_tag_name(el) } else { id }

  // Skip if already loaded
  if is_loaded(component_id) {
    return
  }
  mark_loaded(component_id)

  // Parse and store state
  let state = parse_state(el)
  luna_state.set(component_id, state)

  // Get module URL
  let url = get_attribute(el, "luna:url")
  if url == "" {
    return
  }

  // Get export name
  let export_name = get_attribute(el, "luna:export")

  // Dynamic import and hydrate
  dynamic_import_and_hydrate(url, export_name, el, state, component_id)
}

///| Setup trigger for element
fn setup_trigger(el : @js.Any, trigger : String, hydrate_fn : () -> Unit) -> Unit {
  if trigger == "" || trigger == "load" {
    // Load trigger: execute when DOM ready or immediately
    if is_document_loading() {
      add_dom_ready_listener(hydrate_fn)
    } else {
      hydrate_fn()
    }
  } else if trigger == "idle" {
    // Idle trigger: execute when browser is idle
    request_idle_callback(hydrate_fn)
  } else if trigger.length() > 0 && trigger[0] == 'v' {
    // Visibility trigger: execute when element is visible
    create_visibility_observer(el, hydrate_fn)
  } else if trigger.length() > 5 && trigger.substring(end=5) == "media" {
    // Media trigger: execute when media query matches
    let query = trigger.substring(start=6) // Skip "media:"
    create_media_listener(query, hydrate_fn)
  } else {
    // Unknown trigger, default to load
    if is_document_loading() {
      add_dom_ready_listener(hydrate_fn)
    } else {
      hydrate_fn()
    }
  }
}

///| Setup a single element
fn setup_element(el : @js.Any) -> Unit {
  let trigger = get_attribute(el, "luna:trigger")
  setup_trigger(el, trigger, fn() { hydrate(el) })
}

///| Scan document for luna:url elements
pub fn scan() -> Unit {
  let elements = query_selector_all("[luna\\:url]")
  let len = get_length(elements)
  for i = 0; i < len; i = i + 1 {
    let el = get_item(elements, i)
    setup_element(el)
  }
}

///| Initialize luna/json script elements
fn init_json_scripts() -> Unit {
  let scripts = query_selector_all("script[type=\"luna/json\"]")
  let len = get_length(scripts)
  for i = 0; i < len; i = i + 1 {
    let script = get_item(scripts, i)
    let id = get_attribute(script, "id")
    if id != "" {
      let text = get_text_content(script)
      let state = parse_json_to_js(text)
      luna_state.set(id, state)
    }
  }
}

///| Get state by ID (for __LUNA_STATE__ proxy)
fn get_state(id : String) -> @js.Any {
  match luna_state.get(id) {
    Some(state) => state
    None => @js.null()
  }
}

///| Start the loader (exported entry point)
pub fn start() -> Unit {
  // Initialize luna/json scripts
  init_json_scripts()

  // Scan on DOM ready
  if is_document_loading() {
    add_dom_ready_listener(scan)
  } else {
    scan()
  }

  // Observe dynamic additions
  observe_dom_additions(setup_element)

  // Register global APIs
  set_global("__LUNA_STATE__", hashmap_to_js_object(get_state))
  set_global("__LUNA_HYDRATE__", create_hydrate_wrapper(hydrate))
  set_global("__LUNA_SCAN__", create_scan_wrapper(scan))
  set_global("__LUNA_UNLOAD__", create_unload_wrapper(unload))
  set_global("__LUNA_CLEAR_LOADED__", create_clear_wrapper(clear_loaded))
}
