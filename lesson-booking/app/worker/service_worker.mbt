///| Service Worker - MoonBit Implementation
///| Provides caching strategies for offline support and performance

// ============================================================================
// Configuration
// ============================================================================

///| Cache name for this version
let cache_name : String = "blog-admin-v1"

///| Static assets to precache
let static_assets : Array[String] = ["/loader.js", "/markdown_editor.js"]

// ============================================================================
// FFI: Service Worker APIs
// ============================================================================

///| Open cache by name
extern "js" fn caches_open(name : String) -> @js.Any =
  #| (name) => caches.open(name)

///| Get all cache keys
extern "js" fn caches_keys() -> @js.Any =
  #| () => caches.keys()

///| Delete cache by name
extern "js" fn caches_delete(name : String) -> @js.Any =
  #| (name) => caches.delete(name)

///| Add all URLs to cache
extern "js" fn cache_add_all(cache : @js.Any, urls : Array[String]) -> @js.Any =
  #| (cache, urls) => cache.addAll(urls)

///| Match request in cache
extern "js" fn cache_match(request : @js.Any) -> @js.Any =
  #| (request) => caches.match(request)

///| Put response in cache
extern "js" fn cache_put(cache : @js.Any, request : @js.Any, response : @js.Any) -> @js.Any =
  #| (cache, request, response) => cache.put(request, response)

///| Fetch from network
extern "js" fn fetch_request(request : @js.Any) -> @js.Any =
  #| (request) => fetch(request)

///| Clone response
extern "js" fn clone_response(response : @js.Any) -> @js.Any =
  #| (response) => response.clone()

///| Check if response is ok
extern "js" fn is_response_ok(response : @js.Any) -> Bool =
  #| (response) => response.ok

///| Skip waiting
extern "js" fn skip_waiting() -> Unit =
  #| () => self.skipWaiting()

///| Claim clients
extern "js" fn clients_claim() -> Unit =
  #| () => self.clients.claim()

///| Get request URL pathname
extern "js" fn get_request_pathname(request : @js.Any) -> String =
  #| (request) => new URL(request.url).pathname

///| Get request mode
extern "js" fn get_request_mode(request : @js.Any) -> String =
  #| (request) => request.mode

///| Check if string ends with suffix
fn ends_with(s : String, suffix : String) -> Bool {
  let s_len = s.length()
  let suffix_len = suffix.length()
  if s_len < suffix_len {
    return false
  }
  s.substring(start=s_len - suffix_len) == suffix
}

///| Check if pathname is static asset
fn is_static_asset(pathname : String) -> Bool {
  for asset in static_assets {
    if pathname == asset {
      return true
    }
  }
  ends_with(pathname, ".js")
}

// ============================================================================
// Event Handlers
// ============================================================================

///| Install event handler - precache static assets
extern "js" fn handle_install(event : @js.Any) -> Unit =
  #| (event) => {
  #|   const CACHE_NAME = "blog-admin-v1";
  #|   const STATIC_ASSETS = ["/loader.js", "/markdown_editor.js"];
  #|   event.waitUntil(
  #|     caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  #|   );
  #|   self.skipWaiting();
  #| }

///| Activate event handler - cleanup old caches
extern "js" fn handle_activate(event : @js.Any) -> Unit =
  #| (event) => {
  #|   const CACHE_NAME = "blog-admin-v1";
  #|   event.waitUntil(
  #|     caches.keys().then(keys =>
  #|       Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  #|     )
  #|   );
  #|   self.clients.claim();
  #| }

///| Fetch event handler - caching strategies
extern "js" fn handle_fetch(event : @js.Any) -> Unit =
  #| (event) => {
  #|   const CACHE_NAME = "blog-admin-v1";
  #|   const STATIC_ASSETS = ["/loader.js", "/markdown_editor.js"];
  #|   const url = new URL(event.request.url);
  #|
  #|   // Static assets: Cache-first
  #|   if (STATIC_ASSETS.some(a => url.pathname === a) || url.pathname.endsWith('.js')) {
  #|     event.respondWith(
  #|       caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
  #|         if (res.ok) {
  #|           const clone = res.clone();
  #|           caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
  #|         }
  #|         return res;
  #|       }))
  #|     );
  #|     return;
  #|   }
  #|
  #|   // HTML pages: Network-first with fallback
  #|   if (event.request.mode === 'navigate') {
  #|     event.respondWith(
  #|       fetch(event.request).catch(() => caches.match(event.request))
  #|     );
  #|     return;
  #|   }
  #|
  #|   // Default: Network only
  #|   event.respondWith(fetch(event.request));
  #| }

///| Register service worker event listeners
extern "js" fn register_sw_listeners(
  install_handler : (@js.Any) -> Unit,
  activate_handler : (@js.Any) -> Unit,
  fetch_handler : (@js.Any) -> Unit
) -> Unit =
  #| (installFn, activateFn, fetchFn) => {
  #|   self.addEventListener('install', installFn);
  #|   self.addEventListener('activate', activateFn);
  #|   self.addEventListener('fetch', fetchFn);
  #| }

// ============================================================================
// Initialization
// ============================================================================

///| Start the service worker (exported entry point)
pub fn start() -> Unit {
  register_sw_listeners(handle_install, handle_activate, handle_fetch)
}
