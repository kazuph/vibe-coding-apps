///| Unit tests for db.mbt - Testing pure functions without FFI dependencies

// =============================================================================
// Test Helper FFI - Create JS objects for testing
// =============================================================================

///| Create empty JS object for testing
extern "js" fn make_empty_obj() -> @core.Any =
  #| () => ({})

///| Create JS object with string field
extern "js" fn make_obj_with_str(key : String, value : String) -> @core.Any =
  #| (key, value) => ({ [key]: value })

///| Create JS object with int field
extern "js" fn make_obj_with_int(key : String, value : Int) -> @core.Any =
  #| (key, value) => ({ [key]: value })

///| Create JS object with null field
extern "js" fn make_obj_with_null(key : String) -> @core.Any =
  #| (key) => ({ [key]: null })

///| Create JS array from ints
extern "js" fn make_int_array(a : Int, b : Int, c : Int) -> @core.Any =
  #| (a, b, c) => [a, b, c]

///| Create JS array from strings
extern "js" fn make_str_array(a : String, b : String, c : String) -> @core.Any =
  #| (a, b, c) => [a, b, c]

///| Create empty JS array
extern "js" fn make_empty_array() -> @core.Any =
  #| () => []

///| Create full Post-like JS object for testing
extern "js" fn make_post_obj(
  id : String,
  title : String,
  slug : String,
  content : String,
  content_html : String,
  excerpt : String,
  status : String,
  published_at : String,
  created_at : String,
  updated_at : String
) -> @core.Any =
  #| (id, title, slug, content, content_html, excerpt, status, published_at, created_at, updated_at) => ({
  #|   id, title, slug, content, content_html, excerpt, status, published_at, created_at, updated_at
  #| })

///| Create partial Post-like JS object for testing
extern "js" fn make_partial_post_obj(id : String, title : String) -> @core.Any =
  #| (id, title) => ({ id, title })

// =============================================================================
// is_null() tests
// =============================================================================

test "is_null returns true for null" {
  assert_true!(is_null(@core.null()))
}

test "is_null returns true for undefined" {
  assert_true!(is_null(@core.undefined()))
}

test "is_null returns false for empty object" {
  let obj = make_empty_obj()
  assert_false!(is_null(obj))
}

test "is_null returns false for string value" {
  let val : @core.Any = @core.any("hello")
  assert_false!(is_null(val))
}

test "is_null returns false for number value" {
  let val : @core.Any = @core.any(42)
  assert_false!(is_null(val))
}

// =============================================================================
// get_str() tests
// =============================================================================

test "get_str returns empty for null object" {
  let obj = @core.null()
  assert_eq!(get_str(obj, "field"), "")
}

test "get_str returns empty for undefined object" {
  let obj = @core.undefined()
  assert_eq!(get_str(obj, "field"), "")
}

test "get_str returns empty for missing field" {
  let obj = make_empty_obj()
  assert_eq!(get_str(obj, "nonexistent"), "")
}

test "get_str returns value for existing field" {
  let obj = make_obj_with_str("name", "test_value")
  assert_eq!(get_str(obj, "name"), "test_value")
}

test "get_str returns empty for null field value" {
  let obj = make_obj_with_null("name")
  assert_eq!(get_str(obj, "name"), "")
}

// =============================================================================
// get_int() tests
// =============================================================================

test "get_int returns 0 for null object" {
  let obj = @core.null()
  assert_eq!(get_int(obj, "field"), 0)
}

test "get_int returns 0 for undefined object" {
  let obj = @core.undefined()
  assert_eq!(get_int(obj, "field"), 0)
}

test "get_int returns 0 for missing field" {
  let obj = make_empty_obj()
  assert_eq!(get_int(obj, "count"), 0)
}

test "get_int returns value for existing field" {
  let obj = make_obj_with_int("count", 42)
  assert_eq!(get_int(obj, "count"), 42)
}

test "get_int returns 0 for null field value" {
  let obj = make_obj_with_null("count")
  assert_eq!(get_int(obj, "count"), 0)
}

// =============================================================================
// array_len() tests
// =============================================================================

test "array_len returns 0 for null" {
  assert_eq!(array_len(@core.null()), 0)
}

test "array_len returns 0 for undefined" {
  assert_eq!(array_len(@core.undefined()), 0)
}

test "array_len returns correct length for array" {
  let arr = make_int_array(1, 2, 3)
  assert_eq!(array_len(arr), 3)
}

test "array_len returns 0 for empty array" {
  let arr = make_empty_array()
  assert_eq!(array_len(arr), 0)
}

// =============================================================================
// array_get() tests
// =============================================================================

test "array_get returns correct element" {
  let arr = make_str_array("a", "b", "c")
  let elem = array_get(arr, 1)
  assert_eq!(elem.to_string(), "b")
}

test "array_get returns first element" {
  let arr = make_int_array(100, 200, 300)
  let elem = array_get(arr, 0)
  let val : Int = elem.cast()
  assert_eq!(val, 100)
}

// =============================================================================
// post_from_js() tests
// =============================================================================

test "post_from_js creates Post from null with empty fields" {
  let post = post_from_js(@core.null())
  assert_eq!(post.id, "")
  assert_eq!(post.title, "")
  assert_eq!(post.slug, "")
  assert_eq!(post.content, "")
  assert_eq!(post.content_html, "")
  assert_eq!(post.excerpt, "")
  assert_eq!(post.status, "")
  assert_eq!(post.published_at, "")
  assert_eq!(post.created_at, "")
  assert_eq!(post.updated_at, "")
}

test "post_from_js creates Post with all fields" {
  let obj = make_post_obj(
    "123",
    "Test Post",
    "test-post",
    "# Hello",
    "<h1>Hello</h1>",
    "A test",
    "published",
    "2024-01-01T00:00:00Z",
    "2024-01-01T00:00:00Z",
    "2024-01-02T00:00:00Z",
  )
  let post = post_from_js(obj)
  assert_eq!(post.id, "123")
  assert_eq!(post.title, "Test Post")
  assert_eq!(post.slug, "test-post")
  assert_eq!(post.content, "# Hello")
  assert_eq!(post.content_html, "<h1>Hello</h1>")
  assert_eq!(post.excerpt, "A test")
  assert_eq!(post.status, "published")
  assert_eq!(post.published_at, "2024-01-01T00:00:00Z")
  assert_eq!(post.created_at, "2024-01-01T00:00:00Z")
  assert_eq!(post.updated_at, "2024-01-02T00:00:00Z")
}

test "post_from_js handles partial fields" {
  let obj = make_partial_post_obj("456", "Partial Post")
  let post = post_from_js(obj)
  assert_eq!(post.id, "456")
  assert_eq!(post.title, "Partial Post")
  assert_eq!(post.slug, "")
  assert_eq!(post.status, "")
}
