///| Unit tests for validation.mbt - Pure MoonBit validation tests (no FFI required)

// =============================================================================
// validate_required() tests
// =============================================================================

test "validate_required returns error for empty string" {
  let errors = validate_required("", "title")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    Required(field) => assert_eq!(field, "title")
    _ => fail!("Expected Required error")
  }
}

test "validate_required returns error for whitespace only" {
  let errors = validate_required("   ", "title")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    Required(field) => assert_eq!(field, "title")
    _ => fail!("Expected Required error")
  }
}

test "validate_required returns error for tabs and newlines" {
  let errors = validate_required("\t\n\r", "content")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    Required(field) => assert_eq!(field, "content")
    _ => fail!("Expected Required error")
  }
}

test "validate_required returns empty array for valid string" {
  let errors = validate_required("Hello World", "title")
  assert_eq!(errors.length(), 0)
}

test "validate_required returns empty for string with leading/trailing spaces" {
  let errors = validate_required("  Hello  ", "title")
  assert_eq!(errors.length(), 0)
}

// =============================================================================
// validate_max_length() tests
// =============================================================================

test "validate_max_length returns empty for short string" {
  let errors = validate_max_length("abc", "title", 10)
  assert_eq!(errors.length(), 0)
}

test "validate_max_length returns empty for exact length" {
  let errors = validate_max_length("abcde", "title", 5)
  assert_eq!(errors.length(), 0)
}

test "validate_max_length returns error for too long string" {
  let errors = validate_max_length("abcdefghijk", "title", 5)
  assert_eq!(errors.length(), 1)
  match errors[0] {
    TooLong(field, max) => {
      assert_eq!(field, "title")
      assert_eq!(max, 5)
    }
    _ => fail!("Expected TooLong error")
  }
}

test "validate_max_length returns empty for empty string" {
  let errors = validate_max_length("", "title", 10)
  assert_eq!(errors.length(), 0)
}

// =============================================================================
// validate_min_length() tests
// =============================================================================

test "validate_min_length returns empty for long string" {
  let errors = validate_min_length("abcdefgh", "password", 5)
  assert_eq!(errors.length(), 0)
}

test "validate_min_length returns empty for exact length" {
  let errors = validate_min_length("abcde", "password", 5)
  assert_eq!(errors.length(), 0)
}

test "validate_min_length returns error for short string" {
  let errors = validate_min_length("ab", "password", 5)
  assert_eq!(errors.length(), 1)
  match errors[0] {
    TooShort(field, min) => {
      assert_eq!(field, "password")
      assert_eq!(min, 5)
    }
    _ => fail!("Expected TooShort error")
  }
}

// =============================================================================
// validate_slug_pattern() tests
// =============================================================================

test "validate_slug_pattern accepts lowercase letters" {
  let errors = validate_slug_pattern("hello")
  assert_eq!(errors.length(), 0)
}

test "validate_slug_pattern accepts digits" {
  let errors = validate_slug_pattern("hello123")
  assert_eq!(errors.length(), 0)
}

test "validate_slug_pattern accepts hyphens" {
  let errors = validate_slug_pattern("hello-world")
  assert_eq!(errors.length(), 0)
}

test "validate_slug_pattern accepts complex valid slug" {
  let errors = validate_slug_pattern("my-post-2024-01-15")
  assert_eq!(errors.length(), 0)
}

test "validate_slug_pattern rejects uppercase letters" {
  let errors = validate_slug_pattern("Hello")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    InvalidPattern(field) => assert_eq!(field, "slug")
    _ => fail!("Expected InvalidPattern error")
  }
}

test "validate_slug_pattern rejects spaces" {
  let errors = validate_slug_pattern("hello world")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    InvalidPattern(field) => assert_eq!(field, "slug")
    _ => fail!("Expected InvalidPattern error")
  }
}

test "validate_slug_pattern rejects underscores" {
  let errors = validate_slug_pattern("hello_world")
  assert_eq!(errors.length(), 1)
}

test "validate_slug_pattern rejects special characters" {
  let errors = validate_slug_pattern("hello@world")
  assert_eq!(errors.length(), 1)
}

test "validate_slug_pattern rejects leading hyphen" {
  let errors = validate_slug_pattern("-hello")
  assert_eq!(errors.length(), 1)
}

test "validate_slug_pattern rejects trailing hyphen" {
  let errors = validate_slug_pattern("hello-")
  assert_eq!(errors.length(), 1)
}

test "validate_slug_pattern rejects consecutive hyphens" {
  let errors = validate_slug_pattern("hello--world")
  assert_eq!(errors.length(), 1)
}

test "validate_slug_pattern returns empty for empty string" {
  let errors = validate_slug_pattern("")
  assert_eq!(errors.length(), 0) // Empty is handled by validate_required
}

// =============================================================================
// validate_status() tests
// =============================================================================

test "validate_status accepts draft" {
  let errors = validate_status("draft")
  assert_eq!(errors.length(), 0)
}

test "validate_status accepts published" {
  let errors = validate_status("published")
  assert_eq!(errors.length(), 0)
}

test "validate_status rejects invalid status" {
  let errors = validate_status("pending")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    InvalidStatus(value) => assert_eq!(value, "pending")
    _ => fail!("Expected InvalidStatus error")
  }
}

test "validate_status rejects empty string" {
  let errors = validate_status("")
  assert_eq!(errors.length(), 1)
  match errors[0] {
    InvalidStatus(value) => assert_eq!(value, "")
    _ => fail!("Expected InvalidStatus error")
  }
}

test "validate_status rejects case mismatch" {
  let errors = validate_status("Draft")
  assert_eq!(errors.length(), 1)
}

// =============================================================================
// validate_create_post() tests
// =============================================================================

test "validate_create_post returns Ok for valid input" {
  let result = validate_create_post(
    "My Blog Post",
    "my-blog-post",
    "This is the content",
    "published",
  )
  match result {
    Ok(_) => () // Success
    Err(_) => fail!("Expected Ok result")
  }
}

test "validate_create_post returns Err for empty title" {
  let result = validate_create_post("", "my-slug", "content", "draft")
  match result {
    Ok(_) => fail!("Expected Err result")
    Err(errors) => {
      assert_true!(errors.length() >= 1)
      // Should contain Required("title")
      let mut found = false
      for e in errors {
        match e {
          Required(field) =>
            if field == "title" {
              found = true
            }
          _ => ()
        }
      }
      assert_true!(found)
    }
  }
}

test "validate_create_post returns Err for invalid slug" {
  let result = validate_create_post("Title", "Invalid Slug", "content", "draft")
  match result {
    Ok(_) => fail!("Expected Err result")
    Err(errors) => {
      let mut found = false
      for e in errors {
        match e {
          InvalidPattern(_) => found = true
          _ => ()
        }
      }
      assert_true!(found)
    }
  }
}

test "validate_create_post returns Err for invalid status" {
  let result = validate_create_post("Title", "valid-slug", "content", "invalid")
  match result {
    Ok(_) => fail!("Expected Err result")
    Err(errors) => {
      let mut found = false
      for e in errors {
        match e {
          InvalidStatus(_) => found = true
          _ => ()
        }
      }
      assert_true!(found)
    }
  }
}

test "validate_create_post returns multiple errors" {
  let result = validate_create_post("", "", "", "invalid")
  match result {
    Ok(_) => fail!("Expected Err result")
    Err(errors) => {
      // Should have at least: Required(title), Required(slug), Required(content), InvalidStatus
      assert_true!(errors.length() >= 4)
    }
  }
}

test "validate_create_post enforces title max length" {
  // Create a title longer than 200 chars
  let mut long_title = ""
  for i = 0; i < 250; i = i + 1 {
    long_title = long_title + "a"
  }
  let result = validate_create_post(long_title, "valid-slug", "content", "draft")
  match result {
    Ok(_) => fail!("Expected Err result")
    Err(errors) => {
      let mut found = false
      for e in errors {
        match e {
          TooLong(field, _) =>
            if field == "title" {
              found = true
            }
          _ => ()
        }
      }
      assert_true!(found)
    }
  }
}

// =============================================================================
// error_to_message() tests
// =============================================================================

test "error_to_message for Required" {
  let msg = error_to_message(Required("title"))
  assert_eq!(msg, "titleは必須です")
}

test "error_to_message for TooShort" {
  let msg = error_to_message(TooShort("password", 8))
  assert_eq!(msg, "passwordは8文字以上で入力してください")
}

test "error_to_message for TooLong" {
  let msg = error_to_message(TooLong("title", 200))
  assert_eq!(msg, "titleは200文字以下で入力してください")
}

test "error_to_message for InvalidPattern" {
  let msg = error_to_message(InvalidPattern("slug"))
  assert_eq!(
    msg, "slugの形式が正しくありません（半角英小文字、数字、ハイフンのみ使用可能）",
  )
}

test "error_to_message for InvalidStatus" {
  let msg = error_to_message(InvalidStatus("pending"))
  assert_eq!(
    msg, "ステータス 'pending' は無効です（draft または published を指定してください）",
  )
}

// =============================================================================
// errors_to_messages() tests
// =============================================================================

test "errors_to_messages converts multiple errors" {
  let errors : Array[ValidationError] = [
    Required("title"),
    InvalidPattern("slug"),
  ]
  let messages = errors_to_messages(errors)
  assert_eq!(messages.length(), 2)
  assert_eq!(messages[0], "titleは必須です")
  assert_eq!(
    messages[1], "slugの形式が正しくありません（半角英小文字、数字、ハイフンのみ使用可能）",
  )
}

test "errors_to_messages returns empty for no errors" {
  let errors : Array[ValidationError] = []
  let messages = errors_to_messages(errors)
  assert_eq!(messages.length(), 0)
}

// =============================================================================
// errors_to_json() tests
// =============================================================================

test "errors_to_json creates valid JSON" {
  let errors : Array[ValidationError] = [Required("title")]
  let json = errors_to_json(errors)
  assert_eq!(json, "{\"errors\":[\"titleは必須です\"]}")
}

test "errors_to_json handles multiple errors" {
  let errors : Array[ValidationError] = [
    Required("title"),
    Required("content"),
  ]
  let json = errors_to_json(errors)
  assert_eq!(json, "{\"errors\":[\"titleは必須です\",\"contentは必須です\"]}")
}

test "errors_to_json returns empty array for no errors" {
  let errors : Array[ValidationError] = []
  let json = errors_to_json(errors)
  assert_eq!(json, "{\"errors\":[]}")
}
