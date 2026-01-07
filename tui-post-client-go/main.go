package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textarea"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Post represents a single post
type Post struct {
	ID        string    `json:"id"`
	Text      string    `json:"text"`
	CreatedAt time.Time `json:"createdAt"`
	Tags      []string  `json:"tags,omitempty"`
	Favorite  bool      `json:"favorite"`
}

// ObsidianNote represents a markdown file from Obsidian
type ObsidianNote struct {
	Name      string
	Path      string
	ModTime   time.Time
	Preview   string
}

// Window types
type windowType int

const (
	composeWindow windowType = iota
	timelineWindow
	notesWindow
)

// Model is the main application model
type model struct {
	textarea       textarea.Model
	posts          []Post
	timeline       []Post
	notes          []ObsidianNote
	memos          []ThinoMemo
	activeWindow   windowType
	selectedIndex  int
	status         string
	width          int
	height         int
	dataDir        string
	obsidianDir    string
	previewing     bool
	previewContent string
	previewTitle   string
	previewScroll  int
}

// Styles
var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("14")) // Cyan

	activeBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("14")) // Cyan

	inactiveBoxStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(lipgloss.Color("8")) // Gray

	statusStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("10")) // Green

	dimStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8")) // Gray

	selectedStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("39")).  // Bright cyan background
			Foreground(lipgloss.Color("232")). // Dark text for contrast
			Bold(true)

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("8"))
)

func initialModel() model {
	ta := textarea.New()
	ta.Placeholder = "日本語入力対応！ここに投稿を入力..."
	ta.Focus()
	ta.SetWidth(30)
	ta.SetHeight(3)
	ta.CharLimit = 280

	homeDir, _ := os.UserHomeDir()
	dataDir := filepath.Join(homeDir, ".tui-posts")
	obsidianDir := filepath.Join(homeDir, "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents", "Obsidian Vault")

	m := model{
		textarea:     ta,
		activeWindow: composeWindow,
		status:       "Ready",
		dataDir:      dataDir,
		obsidianDir:  obsidianDir,
	}

	return m
}

func (m model) Init() tea.Cmd {
	return tea.Batch(
		textarea.Blink,
		m.loadData(),
	)
}

// Load data from files
func (m model) loadData() tea.Cmd {
	return func() tea.Msg {
		// Ensure data directory exists
		os.MkdirAll(m.dataDir, 0755)

		timeline := loadPosts(filepath.Join(m.dataDir, "timeline.json"))
		posts := loadPosts(filepath.Join(m.dataDir, "my-posts.json"))
		notes := loadObsidianNotes(m.obsidianDir)
		memos := loadThinoMemos(m.obsidianDir)

		return dataLoadedMsg{timeline: timeline, posts: posts, notes: notes, memos: memos}
	}
}

// loadThinoMemos loads memos with #memo tag from daily notes
func loadThinoMemos(obsidianDir string) []ThinoMemo {
	var memos []ThinoMemo
	dailyNotesDir := filepath.Join(obsidianDir, "02_dailynotes")

	// Read daily notes directory
	entries, err := os.ReadDir(dailyNotesDir)
	if err != nil {
		return memos
	}

	// Process each daily note (most recent first)
	for i := len(entries) - 1; i >= 0 && len(memos) < 100; i-- {
		entry := entries[i]
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}

		filePath := filepath.Join(dailyNotesDir, entry.Name())
		content, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}

		// Parse date from filename (YYYY-MM-DD.md)
		datePart := strings.TrimSuffix(entry.Name(), ".md")
		fileDate, err := time.Parse("2006-01-02", datePart)
		if err != nil {
			continue
		}

		// Find lines with #memo tag
		lines := strings.Split(string(content), "\n")
		for _, line := range lines {
			if !strings.Contains(line, "#memo") {
				continue
			}

			// Parse memo line: - HH:mm content #memo
			line = strings.TrimPrefix(line, "- ")
			line = strings.TrimSpace(line)

			// Extract time if present
			memoTime := fileDate
			if len(line) >= 5 && line[2] == ':' {
				if t, err := time.Parse("15:04", line[:5]); err == nil {
					memoTime = time.Date(fileDate.Year(), fileDate.Month(), fileDate.Day(),
						t.Hour(), t.Minute(), 0, 0, time.Local)
					line = strings.TrimSpace(line[5:])
				}
			}

			// Remove #memo tag for display
			content := strings.Replace(line, "#memo", "", -1)
			content = strings.TrimSpace(content)

			if content != "" {
				memos = append(memos, ThinoMemo{
					Content:   content,
					CreatedAt: memoTime,
					FilePath:  filePath,
				})
			}
		}
	}

	// Sort by time (newest first)
	sort.Slice(memos, func(i, j int) bool {
		return memos[i].CreatedAt.After(memos[j].CreatedAt)
	})

	return memos
}

// loadObsidianNotes scans the Obsidian directory for markdown files
func loadObsidianNotes(dir string) []ObsidianNote {
	var notes []ObsidianNote
	const maxNotes = 500 // Display limit

	// Check if directory exists
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return notes
	}

	filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // Skip errors
		}

		// Skip hidden directories and files
		if strings.HasPrefix(d.Name(), ".") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		// Skip some directories for performance
		if d.IsDir() {
			name := d.Name()
			if name == "attachment" || name == "attachments" || name == "assets" || name == "Excalidraw" {
				return filepath.SkipDir
			}
			return nil
		}

		// Only process .md files
		if !strings.HasSuffix(strings.ToLower(d.Name()), ".md") {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}

		// Get name without .md extension
		name := strings.TrimSuffix(d.Name(), ".md")

		notes = append(notes, ObsidianNote{
			Name:    name,
			Path:    path,
			ModTime: info.ModTime(),
			Preview: "",
		})

		return nil
	})

	// Sort by modification time (newest first)
	sort.Slice(notes, func(i, j int) bool {
		return notes[i].ModTime.After(notes[j].ModTime)
	})

	// Limit to maxNotes
	if len(notes) > maxNotes {
		notes = notes[:maxNotes]
	}

	// Load previews for visible notes only
	for i := range notes {
		if i >= 30 {
			break
		}
		notes[i].Preview = getFilePreview(notes[i].Path)
	}

	return notes
}

// getFilePreview reads the first non-empty, non-header line of a file
func getFilePreview(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Skip empty lines, headers, and frontmatter
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "---") {
			continue
		}
		// Return first content line (truncated)
		runes := []rune(line)
		if len(runes) > 50 {
			return string(runes[:50]) + "..."
		}
		return line
	}
	return ""
}

type dataLoadedMsg struct {
	timeline []Post
	posts    []Post
	notes    []ObsidianNote
	memos    []ThinoMemo
}

// ThinoMemo represents a memo from Thino/memos plugin
type ThinoMemo struct {
	Content   string
	CreatedAt time.Time
	FilePath  string
}

type postCreatedMsg struct {
	post Post
	err  error
}

type editorFinishedMsg struct {
	err error
}

func loadPosts(path string) []Post {
	data, err := os.ReadFile(path)
	if err != nil {
		return []Post{}
	}

	var posts []Post
	if err := json.Unmarshal(data, &posts); err != nil {
		return []Post{}
	}

	return posts
}

func savePosts(path string, posts []Post) error {
	data, err := json.MarshalIndent(posts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (m model) createPost(text string) tea.Cmd {
	return func() tea.Msg {
		now := time.Now()
		post := Post{
			ID:        fmt.Sprintf("%d-%s", now.UnixNano(), randomString(7)),
			Text:      text,
			CreatedAt: now,
			Favorite:  false,
		}

		// Save to Thino format in daily note
		err := m.saveToThino(text, now)
		if err != nil {
			return postCreatedMsg{post: post, err: err}
		}

		return postCreatedMsg{post: post}
	}
}

// saveToThino saves a memo to the daily note in Thino format
func (m model) saveToThino(text string, t time.Time) error {
	// Daily note path: 02_dailynotes/YYYY-MM-DD.md
	dailyNotePath := filepath.Join(m.obsidianDir, "02_dailynotes", t.Format("2006-01-02")+".md")

	// Format memo line: - HH:mm content #memo
	memoLine := fmt.Sprintf("- %s %s #memo", t.Format("15:04"), text)

	// Check if daily note exists
	content, err := os.ReadFile(dailyNotePath)
	if err != nil {
		// Create new daily note with Memos section
		newContent := fmt.Sprintf("# %s\n\n## Memos\n\n%s\n", t.Format("2006-01-02"), memoLine)
		return os.WriteFile(dailyNotePath, []byte(newContent), 0644)
	}

	// Find ## Memos section and insert after it
	lines := strings.Split(string(content), "\n")
	var newLines []string
	inserted := false

	for i := 0; i < len(lines); i++ {
		line := lines[i]
		newLines = append(newLines, line)

		if !inserted && strings.TrimSpace(line) == "## Memos" {
			// Add empty line after ## Memos if not present
			if i+1 < len(lines) && strings.TrimSpace(lines[i+1]) == "" {
				i++ // Skip the empty line in source
				newLines = append(newLines, lines[i]) // Add the empty line
			} else {
				newLines = append(newLines, "") // Add empty line if missing
			}
			// Insert the new memo
			newLines = append(newLines, memoLine)
			inserted = true
		}
	}

	// If ## Memos section not found, append it
	if !inserted {
		newLines = append(newLines, "", "## Memos", "", memoLine)
	}

	return os.WriteFile(dailyNotePath, []byte(strings.Join(newLines, "\n")), 0644)
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		// Handle preview mode keys first
		if m.previewing {
			lines := strings.Split(m.previewContent, "\n")
			maxScroll := max(0, len(lines)-1)
			pageSize := m.height - 6

			switch msg.String() {
			case "esc", "q", "enter":
				m.previewing = false
				m.previewContent = ""
				m.previewTitle = ""
				m.previewScroll = 0
				return m, nil
			case "j", "down":
				if m.previewScroll < maxScroll {
					m.previewScroll++
				}
				return m, nil
			case "k", "up":
				if m.previewScroll > 0 {
					m.previewScroll--
				}
				return m, nil
			case "d", "ctrl+d": // Half page down
				m.previewScroll = min(m.previewScroll+pageSize/2, maxScroll)
				return m, nil
			case "u", "ctrl+u": // Half page up
				m.previewScroll = max(m.previewScroll-pageSize/2, 0)
				return m, nil
			case "f", "ctrl+f", "pgdown": // Full page down
				m.previewScroll = min(m.previewScroll+pageSize, maxScroll)
				return m, nil
			case "b", "ctrl+b", "pgup": // Full page up
				m.previewScroll = max(m.previewScroll-pageSize, 0)
				return m, nil
			case "g": // Go to top (gg in vim, but single g here)
				m.previewScroll = 0
				return m, nil
			case "G": // Go to bottom
				m.previewScroll = maxScroll
				return m, nil
			case "ctrl+c":
				return m, tea.Quit
			}
			return m, nil
		}

		switch msg.String() {
		case "ctrl+c":
			// If composing and has text, clear first
			if m.activeWindow == composeWindow && m.textarea.Value() != "" {
				m.textarea.Reset()
				m.status = "Text cleared"
				return m, nil
			}
			return m, tea.Quit

		case "esc":
			// If composing and has text, clear first
			if m.activeWindow == composeWindow && m.textarea.Value() != "" {
				m.textarea.Reset()
				m.status = "Text cleared"
				return m, nil
			}
			return m, tea.Quit

		case "tab":
			// Cycle through windows
			m.activeWindow = (m.activeWindow + 1) % 3
			m.selectedIndex = 0
			if m.activeWindow == composeWindow {
				m.textarea.Focus()
			} else {
				m.textarea.Blur()
			}
			return m, nil

		case "enter":
			if m.activeWindow == composeWindow {
				text := strings.TrimSpace(m.textarea.Value())
				if text != "" && len([]rune(text)) <= 280 {
					m.status = "Creating post..."
					m.textarea.Reset()
					return m, m.createPost(text)
				}
			} else if m.activeWindow == notesWindow && len(m.notes) > 0 {
				// Open note preview
				note := m.notes[m.selectedIndex]
				content, err := os.ReadFile(note.Path)
				if err == nil {
					m.previewing = true
					m.previewTitle = note.Name
					m.previewContent = string(content)
					m.previewScroll = 0
				}
				return m, nil
			}

		case "j", "down":
			if m.activeWindow != composeWindow {
				count := m.getActiveItemCount()
				if m.selectedIndex < count-1 {
					m.selectedIndex++
				}
			}

		case "k", "up":
			if m.activeWindow != composeWindow {
				if m.selectedIndex > 0 {
					m.selectedIndex--
				}
			}

		case "r":
			if m.activeWindow != composeWindow {
				m.status = "Refreshing..."
				return m, m.loadData()
			}

		case "o":
			// Open in nvim
			if m.activeWindow == notesWindow && len(m.notes) > 0 {
				note := m.notes[m.selectedIndex]
				cmd := exec.Command("nvim", note.Path)
				return m, tea.ExecProcess(cmd, func(err error) tea.Msg {
					return editorFinishedMsg{err}
				})
			}
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.textarea.SetWidth(m.width/3 - 4)

	case dataLoadedMsg:
		m.timeline = msg.timeline
		m.posts = msg.posts
		m.notes = msg.notes
		m.memos = msg.memos
		m.status = fmt.Sprintf("Ready - %d memos, %d notes", len(m.memos), len(m.notes))

	case postCreatedMsg:
		if msg.err != nil {
			m.status = fmt.Sprintf("Error: %v", msg.err)
		} else {
			m.status = "Memo saved to Thino!"
			// Reload notes to show the updated daily note
			return m, m.loadData()
		}

	case editorFinishedMsg:
		// Reload notes after editor closes
		m.status = "Reloading notes..."
		return m, m.loadData()
	}

	// Update textarea if in compose mode
	if m.activeWindow == composeWindow {
		var cmd tea.Cmd
		m.textarea, cmd = m.textarea.Update(msg)
		cmds = append(cmds, cmd)
	}

	return m, tea.Batch(cmds...)
}

func (m model) getActiveItemCount() int {
	switch m.activeWindow {
	case timelineWindow:
		return len(m.memos)
	case notesWindow:
		return len(m.notes)
	default:
		return 0
	}
}

func (m model) View() string {
	if m.width == 0 {
		return "Loading..."
	}

	// Preview mode - full screen note view
	if m.previewing {
		return m.renderPreview()
	}

	// Header
	header := titleStyle.Render("TUI Post Client (Go + Bubble Tea)")

	// Status
	status := statusStyle.Render(fmt.Sprintf("Status: %s", m.status))

	// Calculate column widths (2 columns)
	colWidth := m.width / 2

	// Left column: Compose + Thino Memos (stacked vertically)
	composeBox := m.renderComposeBox(colWidth - 2)
	memosBox := m.renderMemoList("Thino Memos", colWidth-2)
	leftColumn := lipgloss.JoinVertical(lipgloss.Left, composeBox, memosBox)

	// Right column: Obsidian Notes
	notesBox := m.renderNoteList("Obsidian Notes", colWidth-2)

	// Arrange columns
	columns := lipgloss.JoinHorizontal(lipgloss.Top, leftColumn, notesBox)

	// Help
	help := helpStyle.Render("Tab: Switch | Enter: Preview | o: Open nvim | j/k: Navigate | r: Refresh | Esc: Quit")

	return lipgloss.JoinVertical(lipgloss.Left,
		header,
		status,
		columns,
		help,
	)
}

func (m model) renderComposeBox(width int) string {
	var style lipgloss.Style
	if m.activeWindow == composeWindow {
		style = activeBoxStyle.Width(width)
	} else {
		style = inactiveBoxStyle.Width(width)
	}

	title := titleStyle.Render("Compose Post")
	if m.activeWindow == composeWindow {
		title += " (Active)"
	}

	// Count runes for proper Unicode length
	remaining := 280 - len([]rune(m.textarea.Value()))
	var remainingStyle lipgloss.Style
	if remaining < 0 {
		remainingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("9")) // Red
	} else if remaining < 20 {
		remainingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("11")) // Yellow
	} else {
		remainingStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("15")) // White
	}

	content := lipgloss.JoinVertical(lipgloss.Left,
		title,
		"",
		m.textarea.View(),
		"",
		remainingStyle.Render(fmt.Sprintf("%d chars left", remaining)),
		dimStyle.Render("Enter to post | Esc to clear"),
	)

	return style.Render(content)
}

func (m model) renderPostList(title string, posts []Post, window windowType, width int) string {
	var style lipgloss.Style
	if m.activeWindow == window {
		style = activeBoxStyle.Width(width)
	} else {
		style = inactiveBoxStyle.Width(width)
	}

	titleText := titleStyle.Render(title)
	if m.activeWindow == window {
		titleText += " (Active)"
	}

	var content strings.Builder
	content.WriteString(titleText + "\n\n")

	if len(posts) == 0 {
		content.WriteString(dimStyle.Render("No posts yet"))
	} else {
		// Calculate visible range based on selected index
		visibleCount := 6
		startIdx := 0
		endIdx := min(visibleCount, len(posts))

		// Scroll window to keep selected item visible
		if m.activeWindow == window && m.selectedIndex >= visibleCount {
			startIdx = m.selectedIndex - visibleCount + 1
			endIdx = m.selectedIndex + 1
		}

		// Show "more above" indicator
		if startIdx > 0 {
			content.WriteString(dimStyle.Render(fmt.Sprintf("↑ %d more\n", startIdx)))
		}

		for i := startIdx; i < endIdx && i < len(posts); i++ {
			post := posts[i]
			line := m.formatPost(post)
			if m.activeWindow == window && i == m.selectedIndex {
				line = selectedStyle.Render(line)
			}
			content.WriteString(line + "\n")
		}

		// Show "more below" indicator
		if endIdx < len(posts) {
			content.WriteString(dimStyle.Render(fmt.Sprintf("↓ %d more", len(posts)-endIdx)))
		}
	}

	return style.Render(content.String())
}

func (m model) formatPost(post Post) string {
	// Truncate text if too long (count runes for Unicode)
	runes := []rune(post.Text)
	text := post.Text
	if len(runes) > 40 {
		text = string(runes[:40]) + "..."
	}

	ago := formatTimeAgo(post.CreatedAt)
	star := ""
	if post.Favorite {
		star = " *"
	}

	return fmt.Sprintf("%s%s\n%s", dimStyle.Render(ago), star, text)
}

func (m model) renderMemoList(title string, width int) string {
	var style lipgloss.Style
	if m.activeWindow == timelineWindow {
		style = activeBoxStyle.Width(width)
	} else {
		style = inactiveBoxStyle.Width(width)
	}

	titleText := titleStyle.Render(title)
	if m.activeWindow == timelineWindow {
		titleText += " (Active)"
	}

	var content strings.Builder
	content.WriteString(titleText + "\n\n")

	if len(m.memos) == 0 {
		content.WriteString(dimStyle.Render("No memos found"))
	} else {
		// Calculate visible range based on selected index
		visibleCount := 8
		startIdx := 0
		endIdx := min(visibleCount, len(m.memos))

		// Scroll window to keep selected item visible
		if m.activeWindow == timelineWindow && m.selectedIndex >= visibleCount {
			startIdx = m.selectedIndex - visibleCount + 1
			endIdx = m.selectedIndex + 1
		}

		// Show "more above" indicator
		if startIdx > 0 {
			content.WriteString(dimStyle.Render(fmt.Sprintf("↑ %d more above\n", startIdx)))
		}

		for i := startIdx; i < endIdx && i < len(m.memos); i++ {
			memo := m.memos[i]
			line := m.formatMemo(memo)
			if m.activeWindow == timelineWindow && i == m.selectedIndex {
				line = selectedStyle.Render(line)
			}
			content.WriteString(line + "\n")
		}

		// Show "more below" indicator
		if endIdx < len(m.memos) {
			content.WriteString(dimStyle.Render(fmt.Sprintf("↓ %d more below", len(m.memos)-endIdx)))
		}
	}

	return style.Render(content.String())
}

func (m model) formatMemo(memo ThinoMemo) string {
	// Format content (truncate if too long)
	runes := []rune(memo.Content)
	text := memo.Content
	if len(runes) > 50 {
		text = string(runes[:50]) + "..."
	}

	// Format time
	timeStr := memo.CreatedAt.Format("01/02 15:04")

	return fmt.Sprintf("%s\n%s", dimStyle.Render(timeStr), text)
}

func (m model) renderNoteList(title string, width int) string {
	var style lipgloss.Style
	if m.activeWindow == notesWindow {
		style = activeBoxStyle.Width(width)
	} else {
		style = inactiveBoxStyle.Width(width)
	}

	titleText := titleStyle.Render(title)
	if m.activeWindow == notesWindow {
		titleText += " (Active)"
	}

	var content strings.Builder
	content.WriteString(titleText + "\n\n")

	if len(m.notes) == 0 {
		content.WriteString(dimStyle.Render("No notes found"))
	} else {
		// Calculate visible range based on selected index
		visibleCount := 8
		startIdx := 0
		endIdx := min(visibleCount, len(m.notes))

		// Scroll window to keep selected item visible
		if m.activeWindow == notesWindow && m.selectedIndex >= visibleCount {
			startIdx = m.selectedIndex - visibleCount + 1
			endIdx = m.selectedIndex + 1
		}

		// Show "more above" indicator
		if startIdx > 0 {
			content.WriteString(dimStyle.Render(fmt.Sprintf("↑ %d more above\n", startIdx)))
		}

		for i := startIdx; i < endIdx && i < len(m.notes); i++ {
			note := m.notes[i]
			line := m.formatNote(note)
			if m.activeWindow == notesWindow && i == m.selectedIndex {
				line = selectedStyle.Render(line)
			}
			content.WriteString(line + "\n")
		}

		// Show "more below" indicator
		if endIdx < len(m.notes) {
			content.WriteString(dimStyle.Render(fmt.Sprintf("↓ %d more below", len(m.notes)-endIdx)))
		}
	}

	return style.Render(content.String())
}

func (m model) formatNote(note ObsidianNote) string {
	// Format name (truncate if too long)
	runes := []rune(note.Name)
	name := note.Name
	if len(runes) > 35 {
		name = string(runes[:35]) + "..."
	}

	ago := formatTimeAgo(note.ModTime)

	// Preview
	preview := note.Preview
	if preview == "" {
		preview = "(empty)"
	}
	previewRunes := []rune(preview)
	if len(previewRunes) > 35 {
		preview = string(previewRunes[:35]) + "..."
	}

	return fmt.Sprintf("%s\n%s\n%s", name, dimStyle.Render(ago), dimStyle.Render(preview))
}

func (m model) renderPreview() string {
	// Header with title
	header := titleStyle.Render("📄 " + m.previewTitle)
	help := helpStyle.Render("j/k: Line | d/u: Half | f/b: Page | g/G: Top/Bottom | q: Close")

	// Calculate available height for content
	contentHeight := m.height - 4 // header + help + padding

	// Split content into lines
	lines := strings.Split(m.previewContent, "\n")

	// Apply scroll offset
	startLine := m.previewScroll
	if startLine >= len(lines) {
		startLine = max(0, len(lines)-1)
	}

	endLine := startLine + contentHeight
	if endLine > len(lines) {
		endLine = len(lines)
	}

	// Get visible lines
	var visibleLines []string
	if startLine < len(lines) {
		visibleLines = lines[startLine:endLine]
	}

	// Join visible content
	content := strings.Join(visibleLines, "\n")

	// Scroll indicator
	scrollInfo := dimStyle.Render(fmt.Sprintf("Line %d/%d", startLine+1, len(lines)))

	// Create preview box
	previewBox := activeBoxStyle.
		Width(m.width - 4).
		Height(contentHeight).
		Render(content)

	return lipgloss.JoinVertical(lipgloss.Left,
		header,
		scrollInfo,
		previewBox,
		help,
	)
}

func formatTimeAgo(t time.Time) string {
	diff := time.Since(t)
	if diff < time.Minute {
		return "just now"
	} else if diff < time.Hour {
		return fmt.Sprintf("%dm ago", int(diff.Minutes()))
	} else if diff < 24*time.Hour {
		return fmt.Sprintf("%dh ago", int(diff.Hours()))
	}
	return fmt.Sprintf("%dd ago", int(diff.Hours()/24))
}

func main() {
	p := tea.NewProgram(initialModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
}
