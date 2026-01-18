///| MoonBit Pure Validation Functions
///| No FFI, no external dependencies - pure MoonBit validation logic

// =============================================================================
// Validation Error Types
// =============================================================================

///| バリデーションエラー
pub(all) enum ValidationError {
  Required(String) // 必須フィールドが空
  TooShort(String, Int) // 最小長未満
  TooLong(String, Int) // 最大長超過
  InvalidPattern(String) // パターン不一致
  InvalidStatus(String) // 無効なステータス
} derive(Show, Eq)

// =============================================================================
// String Helper Functions
// =============================================================================

///| Check if a character is lowercase letter (a-z)
fn is_lowercase(c : Char) -> Bool {
  c >= 'a' && c <= 'z'
}

///| Check if a character is digit (0-9)
fn is_digit(c : Char) -> Bool {
  c >= '0' && c <= '9'
}

///| Check if a character is valid for slug (a-z, 0-9, -)
fn is_valid_slug_char(c : Char) -> Bool {
  is_lowercase(c) || is_digit(c) || c == '-'
}

///| Trim whitespace from string (simple implementation)
fn is_whitespace(c : Char) -> Bool {
  c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

///| Check if string is empty or whitespace only
fn is_blank(s : String) -> Bool {
  let mut all_whitespace = true
  for c in s {
    if not(is_whitespace(c)) {
      all_whitespace = false
      break
    }
  }
  all_whitespace
}

// =============================================================================
// Validation Functions
// =============================================================================

///| 空文字チェック
pub fn validate_required(value : String, field : String) -> Array[ValidationError] {
  let errors : Array[ValidationError] = []
  if is_blank(value) {
    errors.push(Required(field))
  }
  errors
}

///| 最小長チェック
pub fn validate_min_length(
  value : String,
  field : String,
  min : Int
) -> Array[ValidationError] {
  let errors : Array[ValidationError] = []
  if value.length() < min {
    errors.push(TooShort(field, min))
  }
  errors
}

///| 最大長チェック
pub fn validate_max_length(
  value : String,
  field : String,
  max : Int
) -> Array[ValidationError] {
  let errors : Array[ValidationError] = []
  if value.length() > max {
    errors.push(TooLong(field, max))
  }
  errors
}

///| slugパターンチェック (a-z, 0-9, - のみ)
pub fn validate_slug_pattern(value : String) -> Array[ValidationError] {
  let errors : Array[ValidationError] = []
  // Empty string is handled by validate_required
  if value.length() == 0 {
    return errors
  }
  // Check each character
  let mut valid = true
  for c in value {
    if not(is_valid_slug_char(c)) {
      valid = false
      break
    }
  }
  // Additional rules: cannot start or end with hyphen
  let first_char = value[0]
  let last_char = value[value.length() - 1]
  if first_char == '-' || last_char == '-' {
    valid = false
  }
  // Cannot have consecutive hyphens
  let mut prev_hyphen = false
  for c in value {
    if c == '-' {
      if prev_hyphen {
        valid = false
        break
      }
      prev_hyphen = true
    } else {
      prev_hyphen = false
    }
  }
  if not(valid) {
    errors.push(InvalidPattern("slug"))
  }
  errors
}

///| ステータスチェック (draft, published)
pub fn validate_status(value : String) -> Array[ValidationError] {
  let errors : Array[ValidationError] = []
  if value != "draft" && value != "published" {
    errors.push(InvalidStatus(value))
  }
  errors
}

// =============================================================================
// Combined Validation Functions
// =============================================================================

///| Post作成バリデーション
pub fn validate_create_post(
  title : String,
  slug : String,
  content : String,
  status : String
) -> Result[Unit, Array[ValidationError]] {
  let all_errors : Array[ValidationError] = []
  // Title validation
  let title_required = validate_required(title, "title")
  for e in title_required {
    all_errors.push(e)
  }
  let title_max = validate_max_length(title, "title", 200)
  for e in title_max {
    all_errors.push(e)
  }
  // Slug validation
  let slug_required = validate_required(slug, "slug")
  for e in slug_required {
    all_errors.push(e)
  }
  let slug_max = validate_max_length(slug, "slug", 100)
  for e in slug_max {
    all_errors.push(e)
  }
  let slug_pattern = validate_slug_pattern(slug)
  for e in slug_pattern {
    all_errors.push(e)
  }
  // Content validation
  let content_required = validate_required(content, "content")
  for e in content_required {
    all_errors.push(e)
  }
  // Status validation
  let status_errors = validate_status(status)
  for e in status_errors {
    all_errors.push(e)
  }
  // Return result
  if all_errors.length() > 0 {
    Err(all_errors)
  } else {
    Ok(())
  }
}

///| Post更新バリデーション (同じルール)
pub fn validate_update_post(
  title : String,
  slug : String,
  content : String,
  status : String
) -> Result[Unit, Array[ValidationError]] {
  validate_create_post(title, slug, content, status)
}

// =============================================================================
// Error Message Conversion
// =============================================================================

///| エラーを日本語メッセージに変換
pub fn error_to_message(error : ValidationError) -> String {
  match error {
    Required(field) => "\{field}は必須です"
    TooShort(field, min) => "\{field}は\{min}文字以上で入力してください"
    TooLong(field, max) => "\{field}は\{max}文字以下で入力してください"
    InvalidPattern(field) => "\{field}の形式が正しくありません（半角英小文字、数字、ハイフンのみ使用可能）"
    InvalidStatus(value) => "ステータス '\{value}' は無効です（draft または published を指定してください）"
  }
}

///| 複数エラーをまとめてメッセージ化
pub fn errors_to_messages(errors : Array[ValidationError]) -> Array[String] {
  let messages : Array[String] = []
  for e in errors {
    messages.push(error_to_message(e))
  }
  messages
}

///| エラーをJSON形式の文字列に変換
pub fn errors_to_json(errors : Array[ValidationError]) -> String {
  let mut json = "{\"errors\":["
  for i, e in errors {
    if i > 0 {
      json = json + ","
    }
    let msg = error_to_message(e)
    // Simple JSON string escape (handle quotes and backslashes)
    let escaped = escape_json_string(msg)
    json = json + "\"\{escaped}\""
  }
  json = json + "]}"
  json
}

///| Simple JSON string escaping
fn escape_json_string(s : String) -> String {
  let mut result = ""
  for c in s {
    if c == '"' {
      result = result + "\\\""
    } else if c == '\\' {
      result = result + "\\\\"
    } else if c == '\n' {
      result = result + "\\n"
    } else if c == '\r' {
      result = result + "\\r"
    } else if c == '\t' {
      result = result + "\\t"
    } else {
      result = result + c.to_string()
    }
  }
  result
}
