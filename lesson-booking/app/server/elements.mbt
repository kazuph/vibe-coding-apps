///| Custom HTML element helpers
///| These elements are not provided by Luna UI's static_dom/element package

// =============================================================================
// Helper function
// =============================================================================

///| Create a static attribute
fn static_attr(value : String) -> @luna.Attr[Unit] {
  @luna.attr_static(value)
}

///| Build attribute array from common properties
fn build_attrs(
  id : String?,
  class : String?,
  style : String?,
  attrs : Array[(String, @luna.Attr[Unit])]?,
) -> Array[(String, @luna.Attr[Unit])] {
  let result : Array[(String, @luna.Attr[Unit])] = []
  if id is Some(v) {
    result.push(("id", static_attr(v)))
  }
  if class is Some(v) {
    result.push(("class", static_attr(v)))
  }
  if style is Some(v) {
    result.push(("style", static_attr(v)))
  }
  if attrs is Some(extra) {
    for attr in extra {
      result.push(attr)
    }
  }
  result
}

// =============================================================================
// Table Elements
// =============================================================================

///| Create a table element
pub fn table(
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  @luna.h("table", props, children)
}

///| Create a thead element
pub fn thead(
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  @luna.h("thead", props, children)
}

///| Create a tbody element
pub fn tbody(
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  @luna.h("tbody", props, children)
}

///| Create a tr element
pub fn tr(
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  @luna.h("tr", props, children)
}

///| Create a th element
pub fn th(
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  @luna.h("th", props, children)
}

///| Create a td element
pub fn td(
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  @luna.h("td", props, children)
}

// =============================================================================
// Form Elements
// =============================================================================

///| Create a select element
pub fn select(
  id? : String,
  name? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  if name is Some(v) {
    props.push(("name", static_attr(v)))
  }
  @luna.h("select", props, children)
}

///| Create an option element
pub fn option(
  value? : String,
  selected? : Bool,
  id? : String,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  if value is Some(v) {
    props.push(("value", static_attr(v)))
  }
  if selected is Some(true) {
    props.push(("selected", static_attr("")))
  }
  @luna.h("option", props, children)
}

///| Create a textarea element
pub fn textarea(
  id? : String,
  name? : String,
  placeholder? : String,
  required? : Bool,
  class? : String,
  style? : String,
  attrs? : Array[(String, @luna.Attr[Unit])],
  children : Array[@luna.Node[Unit]],
) -> @luna.Node[Unit] {
  let props = build_attrs(id, class, style, attrs)
  if name is Some(v) {
    props.push(("name", static_attr(v)))
  }
  if placeholder is Some(v) {
    props.push(("placeholder", static_attr(v)))
  }
  if required is Some(true) {
    props.push(("required", static_attr("")))
  }
  @luna.h("textarea", props, children)
}
