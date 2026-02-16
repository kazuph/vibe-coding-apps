#include <Arduino.h>
#include <M5Unified.h>
#include "robot_voice_effects.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <esp_heap_caps.h>
#include <cstdlib>
#include <cstring>
#include <cstdarg>
#include <cctype>

namespace {

using Tick = TickType_t;

constexpr int kScreenW = 128;
constexpr int kScreenH = 128;
constexpr int kFramePeriodMs = 55;   // ~18 FPS
constexpr int kPooIntervalMs = 60000;
constexpr int kEmotionTimeMs = 1100;
constexpr int kCleaningTimeMs = 900;
constexpr int kBlinkInterval = 420;
constexpr int kBlinkHoldFrames = 4;
constexpr uint16_t kBootAnnouncementDelayMs = 1300;
constexpr uint16_t kSpeakerVolumePercent[] = {8, 14, 20, 30, 40};
constexpr uint8_t kSpeakerVolumeLevels[] = {
    static_cast<uint8_t>((kSpeakerVolumePercent[0] * 255u) / 100u),
    static_cast<uint8_t>((kSpeakerVolumePercent[1] * 255u) / 100u),
    static_cast<uint8_t>((kSpeakerVolumePercent[2] * 255u) / 100u),
    static_cast<uint8_t>((kSpeakerVolumePercent[3] * 255u) / 100u),
    static_cast<uint8_t>((kSpeakerVolumePercent[4] * 255u) / 100u),
};
constexpr uint16_t kCrySampleRate = 11025;
constexpr size_t kCrySamples = 5500;
constexpr size_t kVoiceAltSamples = 4200;
constexpr size_t kSpeakerVolumeCount = sizeof(kSpeakerVolumeLevels) / sizeof(kSpeakerVolumeLevels[0]);
constexpr uint16_t kPooBrown = 0xA145;
constexpr size_t kMaxVoiceBytes = 192 * 1024;
constexpr size_t kMiottsMaxWavBytes = 384 * 1024;
constexpr size_t kAutoDownloadVoiceCount = 0;
constexpr uint32_t kVoiceConnectTimeoutMs = 12000;
constexpr uint32_t kVoiceChunkTimeoutMs = 15000;
constexpr uint32_t kVoiceReadTimeoutMs = 15000;
constexpr uint16_t kVoiceRetryDelayMs = 5000;
// HTTP handler tasks allocate Strings + JSON buffers; keep stacks roomy to avoid canary resets.
constexpr uint16_t kSimpleHttpTaskStackBytes = 8192;
constexpr uint8_t kSimpleHttpTaskPriority = 1;
constexpr uint16_t kVoiceDownloadTaskStackBytes = 12288;
constexpr size_t kVoiceStateMsgLen = 12;
constexpr uint32_t kVoiceChunkBytes = 2048;
constexpr size_t kVoiceStreamChunkBytes = 2048;
constexpr uint16_t kHttpServerPort = 8080;
constexpr uint16_t kSimpleHttpServerPort = 8081;
constexpr const char* kDeviceHostName = "atom-tamagotchi";
constexpr const char* kLogRelayUrl = "";
constexpr bool kLogRelayEnabled = (kLogRelayUrl[0] != '\0');
constexpr uint32_t kLogRelayIntervalMs = 7000;
constexpr size_t kHttpTaskStackBytes = 8192;
constexpr uint8_t kHttpTaskPriority = 2;
constexpr size_t kLogRelayBodyLen = 2048;
constexpr size_t kDiagLineCount = 16;
constexpr size_t kDiagLineLen = 104;
constexpr const char* kWiFiSsid = "Buffalo-2G-1CA0";
constexpr const char* kWiFiPassword = "cu46bk8te35ub";
constexpr const char* kVoiceDefaultUrlPrimary = "https://raw.githubusercontent.com/pdx-cs-sound/wavs/main/voice-note.wav";
constexpr const char* kVoiceDefaultUrlFallback = "https://cdn.jsdelivr.net/gh/pdx-cs-sound/wavs@main/voice-note.wav";
constexpr const char* kVoiceBeep2UrlPrimary = "https://raw.githubusercontent.com/pdx-cs-sound/wavs/main/overdrive.wav";
constexpr const char* kVoiceBeep2UrlFallback = "https://cdn.jsdelivr.net/gh/pdx-cs-sound/wavs@main/overdrive.wav";
constexpr const char* kVoiceUrls[2][2] = {
    {kVoiceDefaultUrlPrimary, kVoiceDefaultUrlFallback},
    {kVoiceBeep2UrlPrimary, kVoiceBeep2UrlFallback},
};
constexpr const char* kMiottsPhraseBeep2 = "ピーッ";
// Default target for MioTTS API server on the same LAN (FastAPI: /health, /v1/tts).
// If you run miotts elsewhere, override via /miotts?host=...&port=... or change this constant.
constexpr const char* kMiottsHostDefaultOverride = "192.168.11.12:8001";
constexpr const char* kMiottsHostFallbackCandidates[] = {"miotts.local", "miotts", "audio.local", "localhost"};
constexpr size_t kMiottsHostFallbackCandidateCount = sizeof(kMiottsHostFallbackCandidates) / sizeof(kMiottsHostFallbackCandidates[0]);
constexpr uint16_t kMiottsPorts[] = {8001, 7860, 80, 8080, 8000, 5000, 3000};
constexpr size_t kMiottsPortCount = sizeof(kMiottsPorts) / sizeof(kMiottsPorts[0]);
constexpr uint32_t kMiottsHttpTimeoutMs = 6000;
constexpr uint32_t kMiottsRetryDelayMs = 140;
constexpr uint32_t kMiottsProbeTimeoutMs = 2200;
constexpr uint32_t kMiottsProbeQuickTimeoutMs = 750;
constexpr const char* kMiottsPresetDefault = "jp_female";
constexpr const char* kMiottsPresetAlt = "en_female";
constexpr const char* kMiottsPresetFallback = "jp_male";
constexpr const char* kMiottsOutputFormat = "wav";
constexpr const char* kMiottsVoicePrimary = "alloy";
constexpr const char* kMiottsVoiceFallback = "nova";
constexpr const char* kMiottsModelPrimary = "tts-1";
constexpr const char* kMiottsModelFallback = "gpt-4o-mini-tts";
constexpr uint8_t kMiottsPayloadVariantCount = 9;
constexpr const char* kMiottsProbePaths[] = {
    "/health",
    "/v1/health",
    "/v1/presets",
    "/v1/models",
    "/v1/voices",
    "/docs",
    "/openapi.json",
    "/",
};
constexpr size_t kMiottsProbePathCount = sizeof(kMiottsProbePaths) / sizeof(kMiottsProbePaths[0]);
constexpr const char* kMiottsQuickProbePaths[] = {
    "/health",
    "/v1/presets",
    "/v1/health",
    "/v1/tts",
};
constexpr size_t kMiottsQuickProbePathCount = sizeof(kMiottsQuickProbePaths) / sizeof(kMiottsQuickProbePaths[0]);
enum class MiottsMethod : uint8_t { kGet = 0, kPost = 1 };
struct MiottsEndpoint {
  const char* path;
  MiottsMethod method;
};
constexpr MiottsEndpoint kMiottsEndpoints[] = {
  {"/v1/tts", MiottsMethod::kPost},
  {"/tts", MiottsMethod::kPost},
  {"/audio/speech", MiottsMethod::kPost},
  {"/v1/audio/speech", MiottsMethod::kPost},
  {"/v1/speech", MiottsMethod::kPost},
  {"/api/tts", MiottsMethod::kPost},
  {"/audio", MiottsMethod::kGet},
  {"/api/audio", MiottsMethod::kGet},
  {"/speak", MiottsMethod::kPost},
  {"/api/speak", MiottsMethod::kPost},
  {"/api/tts.mp3", MiottsMethod::kGet},
  {"/tts", MiottsMethod::kGet},
  {"/speak", MiottsMethod::kGet},
};

// STT (Speech-to-Text) constants
constexpr uint16_t kSttSampleRate = 16000;
constexpr size_t kSttMaxSecondsPsram = 5;
constexpr size_t kSttMaxSecondsInternal = 2;  // Fallback for no-PSRAM boards
size_t g_stt_max_samples = 0;  // Set at runtime based on available memory
constexpr uint16_t kSttPort = 8002;
constexpr const char* kSttEndpointPath = "/v1/stt";

enum class EventType : uint8_t {
  kTap = 0,
  kHold = 1,
  kDoubleTap = 2,
  kHoldRelease = 3,
};

struct ButtonEvent {
  EventType type;
};

struct VoiceRequest {
  uint8_t char_idx;
  uint8_t request_type;  // 0=happy, 1=sad, 2=clean, 3=boot/intro, 4=STT process+TTS
};

enum Emotion : uint8_t {
  Neutral = 0,
  Happy = 1,
  Sad = 2,
};

struct CharacterStyle {
  const char* name;
  uint16_t head;
  uint16_t body;
  uint16_t accent;
  uint16_t eye;
  const char* phrase_boot;
  const char* phrase_happy;
  const char* phrase_sad;
  const char* phrase_clean;
};

struct AppState {
  uint8_t character_index = 0;
  Emotion emotion = Neutral;
  Tick emotion_until = 0;
  bool has_poop = false;
  bool cleaning = false;
  Tick cleaning_until = 0;
  Tick last_poop_tick = 0;
  uint16_t frame = 0;
};

constexpr uint16_t kBrown = kPooBrown;

enum VoiceTone : uint8_t {
  kVoiceDefault = 0,
  kVoiceBeep2 = 1,
  kVoiceCount = 2,
};

enum class WifiStatus : uint8_t {
  kUnknown = 0,
  kConnecting = 1,
  kConnected = 2,
  kFailed = 3,
};

enum class VoiceState : uint8_t {
  kPending = 0,
  kDownloading = 1,
  kDownloaded = 2,
  kFailed = 3,
};

struct WavStreamInfo {
  uint16_t channels = 0;
  uint16_t bits_per_sample = 0;
  uint16_t block_size = 0;
  uint32_t sample_rate = 0;
  uint32_t data_bytes = 0;
};

CharacterStyle kCharacters[] = {
    {"アンパンボーヤ", 0xFEE0, 0xFE60, 0xF800, TFT_BLACK, "ぼく、アンパンボーヤ！", "げんきをだして！", "かなしいなあ", "きれいにしたよ！"},
    {"はやぶさ", 0x07FF, 0x07E0, 0x07FF, TFT_BLACK, "はやぶさ、しゅっぱつ！", "やったー！", "うぅ", "ぴかぴか！"},
    {"もこ", 0xFCF0, 0xFDF0, 0xF8B2, TFT_BLACK, "もこだよ、よろしくね！", "うれしいな！", "えーん", "おそうじできた！"},
};

// --- セリフバリエーション（ランダムで選ばれる） ---
constexpr size_t kPhraseVariants = 4;
const char* kPhrasesHappy[][kPhraseVariants] = {
    {"げんきをだして！", "きみはひとりじゃない！", "えがおがいちばん！", "ぼくがまもるよ！"},          // アンパンボーヤ
    {"やったー！", "はしるのだいすき！", "しゅっぱつしんこう！", "かぜになるぞ！"},                // はやぶさ
    {"うれしいな！", "ふわふわ〜", "おはなばたけいきたい", "だいすきだよ〜"},                     // もこ
};
const char* kPhrasesSad[][kPhraseVariants] = {
    {"かなしいなあ", "おなかがすいたよ", "たすけてほしいな", "ちからがでない"},                    // アンパンボーヤ
    {"うぅ", "おくれちゃうよ", "とまりたくない", "しんごうがあかだ"},                            // はやぶさ
    {"えーん", "さびしいよう", "おみみがつめたい", "ぴえん"},                                    // もこ
};
const char* kPhrasesClean[][kPhraseVariants] = {
    {"きれいにしたよ！", "ぴかぴかだね！", "おそうじだいすき！", "せいけつがいちばん！"},          // アンパンボーヤ
    {"ぴかぴか！", "そうじかんりょう！", "しゃたいせいび！", "つるつるだね！"},                    // はやぶさ
    {"おそうじできた！", "きれいきれい〜", "ふわぁすっきり", "もこもこになった！"},                // もこ
};
const char* kPhrasesBoot[][kPhraseVariants] = {
    {"ぼくアンパンボーヤ！みんなのことまもるからね、いっしょにあそぼう！", "やあ、げんきかな？ぼくアンパンボーヤだよ、こまったことがあったらいつでもよんでね！", "こんにちは！きょうもいいてんきだね、なにしてあそぶ？", "あたらしいかおになったよ！ちからもりもりだ！"},  // アンパンボーヤ
    {"はやぶさ、しゅっぱつしんこう！きょうもいっしょにはしろうね！", "みんなおまたせ！E5けいはやぶさだよ、のってくれるかな？", "いくよー！つぎのえきまでぜんそくぜんしんだ！", "はやぶさけんざん！きょうもかぜみたいにはしるぞー！"},  // はやぶさ
    {"もこだよ、よろしくね！きょうもふわふわいいきもち！", "おはよう！もこはきょうもげんきだよ、いっしょにあそぼ！", "もこもこ〜、おみみであたたかいね、きょうもなかよくしよう！", "あそぼう！もこといっしょにおさんぽしよ！"},  // もこ
};

volatile uint8_t g_current_character_index = 0;
QueueHandle_t g_events = nullptr;
QueueHandle_t g_voice_queue = nullptr;
bool g_speaker_ready = false;
uint8_t g_speaker_volume_index = 3;
int16_t g_cry_wave[kCrySamples];
bool g_cry_wave_initialized = false;
int16_t g_voice_alt_wave[kVoiceAltSamples];
bool g_voice_alt_wave_initialized = false;
bool g_voice_wifi_ok = false;
uint32_t g_psram_size = 0;
WebServer g_debug_server(kHttpServerPort);
bool g_debug_server_started = false;
bool g_debug_routes_registered = false;
WiFiServer g_simple_http_server(kSimpleHttpServerPort);
bool g_simple_http_server_started = false;
uint32_t g_last_wifi_connect_attempt_ms = 0;
uint32_t g_last_log_push_ms = 0;
bool g_mdns_started = false;
M5Canvas g_frame_canvas(&M5.Display);
volatile uint8_t g_wifi_status = static_cast<uint8_t>(WifiStatus::kUnknown);
uint32_t g_diag_seq = 1;
size_t g_diag_line_index = 0;
size_t g_diag_line_count = 0;
char g_diag_lines[kDiagLineCount][kDiagLineLen] = {};
bool g_boot_announcement_done = false;
uint32_t g_boot_announcement_due_ms = 0;
char g_miotts_host_override[64] = "";
uint16_t g_miotts_port_override = 0;
char g_miotts_last_host[64] = "";
uint16_t g_miotts_last_port = 0;
char g_miotts_last_url[192] = "";
char g_miotts_last_method[8] = "";
int g_miotts_last_code = 0;
uint32_t g_miotts_last_elapsed_ms = 0;
uint32_t g_miotts_last_probe_ms = 0;
int32_t g_miotts_last_payload_len = -1;
char g_miotts_last_content_type[64] = "";
uint8_t g_miotts_last_error_flag = 0;
char g_miotts_probe_last[512] = "";
uint32_t g_miotts_probe_last_ms = 0;
uint32_t g_http_request_seq = 0;
uint32_t g_http_last_request_ms = 0;
uint32_t g_simple_http_request_seq = 0;
uint32_t g_simple_http_last_request_ms = 0;
// STT state
int16_t* g_stt_buffer = nullptr;  // Allocated in PSRAM
volatile bool g_stt_recording = false;
volatile size_t g_stt_samples_recorded = 0;
char g_stt_result[256] = "";
volatile bool g_stt_has_result = false;
// セリフ表示用
char g_display_phrase[64] = "";
volatile uint32_t g_display_phrase_until_ms = 0;
// Forward declarations for STT
void startSttRecording();
void stopSttRecording();
void sttRecordChunk();
bool sendSttRequest();
void voiceDownloadTask(void*);
void debugHttpServerTask(void*);
void simpleHttpServerTask(void*);
bool downloadVoiceByIndex(size_t idx);
bool ensureVoiceDownloaded(VoiceTone tone, bool fallback_blocking = true);
bool ensureSpeakerForPlayback(const char* context);
bool initSpeakerHardware();
static bool isWavHeader(const uint8_t* data, size_t len);
uint16_t readLe16(const uint8_t* data);
uint32_t readLe32(const uint8_t* data);
bool readFromStreamWithTimeout(
    WiFiClient* stream, HTTPClient& http, uint8_t* dst, const size_t need, size_t& got, const bool fixed_size);
bool skipStreamBytes(WiFiClient* stream, HTTPClient& http, size_t bytes);
bool parseWavHeaderFromStream(WiFiClient* stream, HTTPClient& http, WavStreamInfo& info, size_t idx);
bool playDecodedWavFromHttp(VoiceTone type, HTTPClient& http, const char* success_msg, float rate_scale = 1.0f);
String escapeJsonText(const char* text);
String encodeUriComponent(const char* text);
bool extractJsonStringValue(const String& json, const char* key, String& value);
bool playStreamingAudioFromHttp(VoiceTone type, HTTPClient& http, const char* success_msg, float rate_scale = 1.0f);
bool playStreamingVoiceByUrl(VoiceTone type, const char* url);
bool playMiottsSpeechByText(const char* text, VoiceTone tone, bool quick_mode = false, float rate_scale = 1.0f);
bool playStreamingVoiceWithPhrase(VoiceTone tone, const char* phrase, bool quick_mode = false, float rate_scale = 1.0f);
bool playStreamingVoice(VoiceTone type);
void playCharacterIntro(uint8_t char_idx);
bool connectToWiFi();
void setVoiceStateMessage(size_t idx, const char* msg);
void postDiagnosticsToRelay();
bool playAltVoiceSound();
void setMiottsHostOverride(const char* raw_host);
void clearMiottsHostOverride();
bool findQueryValue(const char* query, const char* key, String& value);
uint16_t parseUInt16(const String& text, bool& ok);
void buildMiottsPayloadVariants(String& payload, const String& escaped_text, size_t variant);
void buildMiottsHostCandidates(String* candidates, const size_t max_count, size_t& count);
void setMiottsProbeLast(const char* msg);
String urlDecode(const String& value);
bool collectMiottsProbeResult(String& result, bool quick_mode = false, bool verbose = false);
void setMiottsLastAttempt(const char* method, const char* host, uint16_t port, const char* path, int code,
                         uint32_t elapsed_ms, int32_t payload_len, const char* content_type = nullptr);
bool isAffirmativeArg(const String& value);
void handleDebugHttpRequest();
void registerDebugHttpRoutes();
void startDebugHttpServer();
void stopDebugHttpServer();
void startDebugHttpServerTask();
void startSimpleHttpServer();
void stopSimpleHttpServer();
void markBootAnnouncementIfReady();
void processBootAnnouncement();
alignas(4) uint8_t g_voice_stream_buf[kVoiceStreamChunkBytes];
// トリプルバッファ: playRawはポインタのみキューするためDMA読み出し中の上書きを防ぐ
constexpr size_t kStreamBufferCount = 3;
alignas(4) uint8_t g_voice_stream_buffers[kStreamBufferCount][kVoiceStreamChunkBytes];
uint8_t* g_voice_data[static_cast<size_t>(kVoiceCount)] = {};
size_t g_voice_data_len[static_cast<size_t>(kVoiceCount)] = {};
bool g_voice_loaded[static_cast<size_t>(kVoiceCount)] = {};
char g_voice_state_msg[static_cast<size_t>(kVoiceCount)][kVoiceStateMsgLen] = {"..."};
volatile uint8_t g_voice_state[static_cast<size_t>(kVoiceCount)] = {
    static_cast<uint8_t>(VoiceState::kPending),
};
TaskHandle_t g_voice_task = nullptr;
TaskHandle_t g_http_task = nullptr;
TaskHandle_t g_simple_http_task = nullptr;

void appendDiagLine(const char* line) {
  if (!line) {
    return;
  }
  const int idx = static_cast<int>(g_diag_line_index % kDiagLineCount);
  snprintf(g_diag_lines[idx], kDiagLineLen, "[%lu] %s", (unsigned long)g_diag_seq++, line);
  g_diag_line_index = (g_diag_line_index + 1) % kDiagLineCount;
  if (g_diag_line_count < kDiagLineCount) {
    ++g_diag_line_count;
  }
}

void logDiag(const char* fmt, ...) {
  char line[kDiagLineLen];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(line, sizeof(line), fmt, ap);
  va_end(ap);
  Serial.println(line);
  appendDiagLine(line);
}

const char* wifiStatusText() {
  switch (static_cast<WifiStatus>(g_wifi_status)) {
    case WifiStatus::kConnecting:
      return "CONNECT";
    case WifiStatus::kConnected:
      return "OK";
    case WifiStatus::kFailed:
      return "FAIL";
    case WifiStatus::kUnknown:
    default:
      return "WAIT";
  }
}

void dumpSpeakerConfig() {
  const auto cfg = M5.Speaker.config();
  logDiag("speaker cfg: ready=%d enabled=%d running=%d p_data=%d p_bck=%d p_ws=%d p_mck=%d i2s=%d",
          (int)g_speaker_ready, (int)M5.Speaker.isEnabled(), (int)M5.Speaker.isRunning(),
          cfg.pin_data_out, cfg.pin_bck, cfg.pin_ws, cfg.pin_mck, (int)cfg.i2s_port);
}

void startVoiceDownloadTask() {
  if (g_voice_task) {
    return;
  }
  if (kAutoDownloadVoiceCount == 0) {
    logDiag("voiceDownload skipped (disabled)");
    return;
  }
  if (!kWiFiSsid[0] || !kWiFiPassword[0]) {
    logDiag("voiceDownload skipped (Wi-Fi credentials not set)");
    return;
  }
  xTaskCreatePinnedToCore(voiceDownloadTask, "voiceDownload", kVoiceDownloadTaskStackBytes, nullptr, 1, &g_voice_task, 0);
  if (!g_voice_task) {
    logDiag("voiceDownload task failed to start");
  } else {
    logDiag("voiceDownload started");
  }
}

void setSpeakerVolume() {
  if (!g_speaker_ready || !M5.Speaker.isEnabled()) {
    return;
  }
  M5.Speaker.setVolume(kSpeakerVolumeLevels[g_speaker_volume_index]);
}

void markBootAnnouncementIfReady() {
  if (g_boot_announcement_done) {
    return;
  }
  if (g_boot_announcement_due_ms == 0) {
    g_boot_announcement_due_ms = millis() + kBootAnnouncementDelayMs;
    logDiag("boot announcement scheduled");
  }
}

void processBootAnnouncement() {
  if (g_boot_announcement_done) {
    return;
  }
  if (!WiFi.isConnected() || !g_speaker_ready) {
    return;
  }
  if (g_boot_announcement_due_ms == 0) {
    markBootAnnouncementIfReady();
    return;
  }
  if (millis() < g_boot_announcement_due_ms) {
    return;
  }
  g_boot_announcement_due_ms = 0;
  g_boot_announcement_done = true;
  playCharacterIntro(g_current_character_index);
  logDiag("boot announcement queued");
}

bool findQueryValue(const char* query, const char* key, String& value) {
  if (!query || !key || !key[0]) {
    return false;
  }
  const size_t key_len = strlen(key);
  const char* p = query;
  while (*p) {
    while (*p == '&') {
      ++p;
    }
    if (!*p) {
      break;
    }
    const char* sep = strchr(p, '=');
    if (!sep) {
      break;
    }
    if ((size_t)(sep - p) == key_len && strncmp(p, key, key_len) == 0) {
      const char* val_start = sep + 1;
      const char* val_end = strchr(val_start, '&');
      if (!val_end) {
        val_end = query + strlen(query);
      }
      value = String(val_start).substring(0, static_cast<unsigned>(val_end - val_start));
      return true;
    }
    p = strchr(sep, '&');
    if (!p) {
      break;
    }
  }
  return false;
}

uint16_t parseUInt16(const String& text, bool& ok) {
  ok = false;
  if (text.length() == 0) {
    return 0;
  }
  char* end = nullptr;
  const long v = strtol(text.c_str(), &end, 10);
  if (end == text.c_str() || *end != '\0' || v < 1 || v > 65535) {
    return 0;
  }
  ok = true;
  return static_cast<uint16_t>(v);
}

void clearMiottsHostOverride() {
  g_miotts_host_override[0] = '\0';
  g_miotts_port_override = 0;
}

void setMiottsLastAttempt(const char* method, const char* host, const uint16_t port, const char* path, const int code,
                         const uint32_t elapsed_ms, const int32_t payload_len, const char* content_type) {
  strncpy(g_miotts_last_host, host ? host : "", sizeof(g_miotts_last_host) - 1);
  g_miotts_last_host[sizeof(g_miotts_last_host) - 1] = '\0';
  g_miotts_last_port = port;
  g_miotts_last_code = code;
  g_miotts_last_elapsed_ms = elapsed_ms;
  g_miotts_last_payload_len = payload_len;
  g_miotts_last_probe_ms = millis();
  if (content_type) {
    strncpy(g_miotts_last_content_type, content_type, sizeof(g_miotts_last_content_type) - 1);
    g_miotts_last_content_type[sizeof(g_miotts_last_content_type) - 1] = '\0';
  } else {
    g_miotts_last_content_type[0] = '\0';
  }
  if (method) {
    strncpy(g_miotts_last_method, method, sizeof(g_miotts_last_method) - 1);
    g_miotts_last_method[sizeof(g_miotts_last_method) - 1] = '\0';
  } else {
    g_miotts_last_method[0] = '\0';
  }
  String u = String("http://");
  u += host ? host : "";
  if (port != 80) {
    u += ":" + String(port);
  }
  if (path) {
    u += path;
  }
  const size_t u_len = u.length();
  strncpy(g_miotts_last_url, u.c_str(), u_len >= sizeof(g_miotts_last_url) ? sizeof(g_miotts_last_url) - 1 : u_len);
  g_miotts_last_url[sizeof(g_miotts_last_url) - 1] = '\0';
  g_miotts_last_error_flag = (code >= 200 && code < 300) ? 0 : 1;
}

void buildMiottsHostCandidates(String* candidates, const size_t max_count, size_t& count) {
  count = 0;
  if (!candidates || max_count == 0) {
    return;
  }
  const auto try_add_host = [&](const String& host) {
    if (host.length() == 0 || count >= max_count) {
      return;
    }
    for (size_t i = 0; i < count; ++i) {
      if (candidates[i] == host) {
        return;
      }
    }
    candidates[count++] = host;
  };

  const IPAddress gateway = WiFi.gatewayIP();
  if (g_miotts_host_override[0]) {
    try_add_host(g_miotts_host_override);
  } else if (!(gateway == IPAddress(0, 0, 0, 0) || gateway == INADDR_NONE)) {
    try_add_host(gateway.toString());
  }
  for (size_t i = 0; i < kMiottsHostFallbackCandidateCount; ++i) {
    try_add_host(kMiottsHostFallbackCandidates[i]);
  }
}

void setMiottsProbeLast(const char* msg) {
  if (!msg) {
    g_miotts_probe_last[0] = '\0';
    return;
  }
  strncpy(g_miotts_probe_last, msg, sizeof(g_miotts_probe_last) - 1);
  g_miotts_probe_last[sizeof(g_miotts_probe_last) - 1] = '\0';
  g_miotts_probe_last_ms = millis();
}

void setMiottsHostOverride(const char* raw_host) {
  if (!raw_host || !raw_host[0]) {
    clearMiottsHostOverride();
    return;
  }

  String host = raw_host;
  host.trim();
  if (host.startsWith("http://")) {
    host.remove(0, 7);
  } else if (host.startsWith("https://")) {
    host.remove(0, 8);
  }
  const int slash = host.indexOf('/');
  if (slash >= 0) {
    host = host.substring(0, static_cast<size_t>(slash));
  }
  const int hash = host.indexOf('#');
  if (hash >= 0) {
    host = host.substring(0, static_cast<size_t>(hash));
  }

  int col = host.lastIndexOf(':');
  if (col > 0) {
    const String host_part = host.substring(0, static_cast<size_t>(col));
    const String port_part = host.substring(static_cast<size_t>(col + 1));
    bool port_ok = false;
    const uint16_t port = parseUInt16(port_part, port_ok);
    if (port_ok && host_part.length() > 0) {
      g_miotts_port_override = port;
      host = host_part;
    } else {
      g_miotts_port_override = 0;
    }
  } else {
    g_miotts_port_override = 0;
  }

  host.trim();
  if (host.length() == 0 || host.length() >= sizeof(g_miotts_host_override)) {
    clearMiottsHostOverride();
    return;
  }
  strncpy(g_miotts_host_override, host.c_str(), sizeof(g_miotts_host_override) - 1);
  g_miotts_host_override[sizeof(g_miotts_host_override) - 1] = '\0';
  logDiag("miotts override set host=%s port=%u", g_miotts_host_override, (unsigned)g_miotts_port_override);
}

static void appendMiottsProbeLine(String& dst, const char* src) {
  if (!src || !src[0]) {
    return;
  }
  if (dst.length() > 0) {
    dst += "; ";
  }
  dst += src;
}

void buildMiottsPayloadVariants(String& payload, const String& escaped_text, size_t variant) {
  payload = "";
  switch (variant % kMiottsPayloadVariantCount) {
    case 0:
      payload = "{\"text\":\"" + escaped_text + "\",\"reference\":{\"type\":\"preset\",\"preset_id\":\"" + kMiottsPresetDefault + "\"},\"output\":{\"format\":\"" +
                kMiottsOutputFormat + "\"}}";
      break;
    case 1:
      payload = "{\"text\":\"" + escaped_text + "\",\"reference\":{\"type\":\"preset\",\"preset_id\":\"" + kMiottsPresetAlt +
                "\"},\"output\":{\"format\":\"" + kMiottsOutputFormat + "\"}}";
      break;
    case 2:
      payload = "{\"text\":\"" + escaped_text + "\",\"reference\":{\"type\":\"preset\",\"preset_id\":\"" + kMiottsPresetFallback +
                "\"},\"output\":{\"format\":\"" + kMiottsOutputFormat + "\"}}";
      break;
    case 3:
      payload = "{\"text\":\"" + escaped_text + "\",\"preset\":\"" + kMiottsPresetDefault + "\",\"format\":\"" + kMiottsOutputFormat + "\"}";
      break;
    case 4:
      payload = "{\"text\":\"" + escaped_text + "\",\"reference\":{\"type\":\"preset\",\"preset_id\":\"" + kMiottsPresetDefault +
                "\"}}";
      break;
    case 5:
      payload = "{\"text\":\"" + escaped_text +
               "\",\"reference\":{\"type\":\"preset\",\"preset_id\":\"" + kMiottsPresetAlt + "\"},\"output\":{\"format\":\"" + kMiottsOutputFormat + "\"}}";
      break;
    case 6:
      payload = "{\"input\":\"" + escaped_text + "\",\"model\":\"" + kMiottsModelPrimary + "\",\"voice\":\"" + kMiottsVoicePrimary +
                "\",\"response_format\":\"" + kMiottsOutputFormat + "\"}";
      break;
    case 7:
      payload = "{\"input\":\"" + escaped_text + "\",\"model\":\"" + kMiottsModelFallback + "\",\"voice\":\"" + kMiottsVoiceFallback +
                "\",\"response_format\":\"" + kMiottsOutputFormat + "\"}";
      break;
    default:
      payload = "{\"text\":\"" + escaped_text +
               "\",\"reference\":{\"type\":\"preset\",\"preset_id\":\"" + kMiottsPresetFallback + "\"},\"output\":{\"format\":\"" + kMiottsOutputFormat +
               "\"},\"llm\":{\"temperature\":0.85}}";
      break;
  }
}

bool collectMiottsProbeResult(String& result, bool quick_mode, bool verbose) {
  result = "";
  String candidates[8];
  size_t host_count = 0;
  buildMiottsHostCandidates(candidates, sizeof(candidates) / sizeof(candidates[0]), host_count);
  if (host_count == 0) {
    setMiottsProbeLast("NO_HOST");
    appendMiottsProbeLine(result, "NO_HOST");
    return false;
  }

  const uint16_t force_port = g_miotts_port_override;
  for (size_t h = 0; h < host_count; ++h) {
    const String& host = candidates[h];
    const size_t port_count = force_port > 0 ? 1 : kMiottsPortCount;
    for (size_t p = 0; p < port_count; ++p) {
      const uint16_t port = force_port > 0 ? force_port : kMiottsPorts[p];
      const String base = String("http://") + host + (port == 80 ? "" : ":" + String(port));
      bool any_for_host = false;
      const size_t probe_path_count = quick_mode ? kMiottsQuickProbePathCount : kMiottsProbePathCount;
      const auto* probe_paths = quick_mode ? kMiottsQuickProbePaths : kMiottsProbePaths;
      for (size_t i = 0; i < probe_path_count; ++i) {
        const char* probe_path = probe_paths[i];
        if (!probe_path || !probe_path[0]) {
          continue;
        }
        String url = base + probe_path;
        WiFiClient client;
        HTTPClient http;
        if (!http.begin(client, url)) {
          continue;
        }
        http.addHeader("User-Agent", "M5AtomS3R/1.0");
        http.setTimeout(quick_mode ? kMiottsProbeQuickTimeoutMs : kMiottsProbeTimeoutMs);
        const uint32_t start_ms = millis();
        const int code = http.GET();
        const uint32_t elapsed_ms = millis() - start_ms;
        const String ct = http.header("Content-Type");
        setMiottsLastAttempt("GET", host.c_str(), port, probe_path, code, elapsed_ms, http.getSize(), ct.c_str());
        http.end();

        if (code >= 0) {
          any_for_host = true;
        }

        String line = String(host);
        line += ":";
        line += String(port);
        line += probe_path;
        if (verbose) {
          line += " -> ";
        } else {
          line += " ";
        }
        if (code >= 0) {
          line += String(code);
        } else {
          line += "ERR";
        }
        line += verbose ? ", " : " ct=";
        line += (ct.length() > 0) ? ct : "none";
        if (verbose) {
          line += ", ms=";
          line += String(elapsed_ms);
        } else {
          line += " ms=";
          line += String(elapsed_ms);
        }
        if (verbose) {
          line += ", ";
          line += "attempt=";
          line += String(h + 1);
          line += "/";
          line += String(host_count);
        }
        appendMiottsProbeLine(result, line.c_str());
        if (code == HTTP_CODE_OK) {
          setMiottsProbeLast(line.c_str());
          return true;
        }
      }
      if (any_for_host) {
        break;
      }
    }
  }

  if (result.length() == 0) {
    setMiottsProbeLast("NO_RESPONSE");
    appendMiottsProbeLine(result, "NO_RESPONSE");
    return false;
  }
  setMiottsProbeLast(result.c_str());
  return false;
}

bool isAffirmativeArg(const String& value) {
  return value == "1" || value == "true" || value == "yes" || value == "on";
}

static bool isWavHeader(const uint8_t* data, size_t len) {
  return (len >= 12) && (memcmp(data, "RIFF", 4) == 0) && (memcmp(data + 8, "WAVE", 4) == 0);
}

uint16_t readLe16(const uint8_t* data) {
  return static_cast<uint16_t>(data[0] | (data[1] << 8));
}

uint32_t readLe32(const uint8_t* data) {
  return static_cast<uint32_t>(data[0] | (static_cast<uint32_t>(data[1]) << 8) | (static_cast<uint32_t>(data[2]) << 16) |
                               (static_cast<uint32_t>(data[3]) << 24));
}

class BufferWriteStream final : public Stream {
 public:
  BufferWriteStream(uint8_t* dst, const size_t cap) : dst_(dst), cap_(cap) {}

  size_t write(uint8_t b) override { return write(&b, 1); }

  size_t write(const uint8_t* buffer, size_t size) override {
    if (!dst_ || !buffer || size == 0) {
      return 0;
    }
    if (pos_ >= cap_) {
      setWriteError();
      return 0;
    }
    size_t n = size;
    if (pos_ + n > cap_) {
      n = cap_ - pos_;
      setWriteError();
    }
    memcpy(dst_ + pos_, buffer, n);
    pos_ += n;
    return n;
  }

  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}

  size_t length() const { return pos_; }

 private:
  uint8_t* dst_ = nullptr;
  size_t cap_ = 0;
  size_t pos_ = 0;
};

String escapeJsonText(const char* text) {
  String escaped;
  if (!text) {
    return escaped;
  }
  escaped.reserve(strlen(text) + 16);
  for (const char* p = text; *p; ++p) {
    const char c = *p;
    switch (c) {
      case '\"':
        escaped += "\\\"";
        break;
      case '\\':
        escaped += "\\\\";
        break;
      case '\n':
        escaped += "\\n";
        break;
      case '\r':
        escaped += "\\r";
        break;
      case '\t':
        escaped += "\\t";
        break;
      default:
        if (static_cast<unsigned char>(c) < 0x20) {
          char seq[7];
          snprintf(seq, sizeof(seq), "\\u%04x", static_cast<uint8_t>(c));
          escaped += seq;
        } else {
          escaped += c;
        }
        break;
    }
  }
  return escaped;
}

String encodeUriComponent(const char* text) {
  String encoded;
  if (!text) {
    return encoded;
  }
  const char hex[] = "0123456789ABCDEF";
  encoded.reserve(strlen(text) * 3);
  for (const char* p = text; *p; ++p) {
    const uint8_t b = static_cast<uint8_t>(*p);
    if ((b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '-' || b == '_' || b == '.' || b == '~') {
      encoded += static_cast<char>(b);
    } else {
      encoded += '%';
      encoded += hex[(b >> 4) & 0x0F];
      encoded += hex[b & 0x0F];
    }
  }
  return encoded;
}

String urlDecode(const String& value) {
  String decoded;
  decoded.reserve(value.length());
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    if (c == '+') {
      decoded += ' ';
      continue;
    }
    if (c == '%' && i + 2 < value.length()) {
      const char h1 = value[i + 1];
      const char h2 = value[i + 2];
      auto hex = [](const char ch) -> int {
        if (ch >= '0' && ch <= '9') {
          return ch - '0';
        }
        if (ch >= 'A' && ch <= 'F') {
          return ch - 'A' + 10;
        }
        if (ch >= 'a' && ch <= 'f') {
          return ch - 'a' + 10;
        }
        return -1;
      };
      const int v1 = hex(h1);
      const int v2 = hex(h2);
      if (v1 >= 0 && v2 >= 0) {
        decoded += static_cast<char>((v1 << 4) | v2);
        i += 2;
        continue;
      }
    }
    decoded += c;
  }
  return decoded;
}

bool extractJsonStringValue(const String& json, const char* key, String& value) {
  value = "";
  if (!key || !key[0]) {
    return false;
  }

  const String key_token = String("\"") + key + "\"";
  const int key_pos = json.indexOf(key_token);
  if (key_pos < 0) {
    return false;
  }
  const int colon = json.indexOf(':', key_pos + key_token.length());
  if (colon < 0) {
    return false;
  }

  int i = colon + 1;
  while (i < static_cast<int>(json.length()) && isspace(json[i])) {
    ++i;
  }
  if (i >= static_cast<int>(json.length()) || json[i] != '"') {
    return false;
  }

  ++i;
  for (int j = i; j < static_cast<int>(json.length()); ++j) {
    const char c = json[j];
    if (c == '\\') {
      if (j + 1 >= static_cast<int>(json.length())) {
        return false;
      }
      value += json[j + 1];
      ++j;
      continue;
    }
    if (c == '"') {
      return true;
    }
    value += c;
  }
  return false;
}

bool readFromStreamWithTimeout(
    WiFiClient* stream, HTTPClient& http, uint8_t* dst, const size_t need, size_t& got, const bool fixed_size) {
  if (!stream || !dst || !need) {
    got = 0;
    return need == 0;
  }

  size_t read_total = 0;
  TickType_t last_activity = xTaskGetTickCount();
  while (read_total < need) {
    const TickType_t now = xTaskGetTickCount();
    if (now - last_activity > pdMS_TO_TICKS(kVoiceReadTimeoutMs)) {
      return false;
    }

    const int available = stream->available();
    if (available <= 0) {
      if (!fixed_size && !http.connected()) {
        break;
      }
      if (fixed_size && !http.connected()) {
        return false;
      }
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }

    const size_t room = need - read_total;
    const size_t read_now = static_cast<size_t>(available > static_cast<int>(room) ? room : static_cast<int>(room));
    const int n = stream->read(dst + read_total, static_cast<int>(read_now));
    if (n <= 0) {
      vTaskDelay(pdMS_TO_TICKS(5));
      continue;
    }
    read_total += static_cast<size_t>(n);
    last_activity = now;
  }

  got = read_total;
  return read_total == need;
}

bool skipStreamBytes(WiFiClient* stream, HTTPClient& http, size_t bytes) {
  while (bytes > 0) {
    const size_t chunk = bytes < kVoiceStreamChunkBytes ? bytes : kVoiceStreamChunkBytes;
    size_t skipped = 0;
    if (!readFromStreamWithTimeout(stream, http, g_voice_stream_buf, chunk, skipped, true)) {
      return false;
    }
    if (skipped != chunk) {
      return false;
    }
    bytes -= skipped;
  }
  return true;
}

bool parseWavHeaderFromStream(WiFiClient* stream, HTTPClient& http, WavStreamInfo& info, size_t idx) {
  memset(&info, 0, sizeof(WavStreamInfo));
  setVoiceStateMessage(idx, "HDR");
  uint8_t riff[12];
  size_t got = 0;
  if (!readFromStreamWithTimeout(stream, http, riff, sizeof(riff), got, true) || got != sizeof(riff)) {
    setVoiceStateMessage(idx, "HDR_FAIL");
    return false;
  }
  if (!isWavHeader(riff, got)) {
    setVoiceStateMessage(idx, "BAD_WAV");
    return false;
  }

  bool got_fmt = false;
  for (;;) {
    uint8_t chunk_hdr[8];
    if (!readFromStreamWithTimeout(stream, http, chunk_hdr, sizeof(chunk_hdr), got, true) || got != sizeof(chunk_hdr)) {
      setVoiceStateMessage(idx, "HDR_FAIL");
      return false;
    }
    uint32_t chunk_size = readLe32(chunk_hdr + 4);

    if (memcmp(chunk_hdr, "fmt ", 4) == 0) {
      if (chunk_size < 16) {
        setVoiceStateMessage(idx, "BAD_FMT");
        return false;
      }
      uint8_t fmt[16];
      if (!readFromStreamWithTimeout(stream, http, fmt, sizeof(fmt), got, true) || got != sizeof(fmt)) {
        setVoiceStateMessage(idx, "BAD_FMT");
        return false;
      }
      const uint16_t audiofmt = readLe16(fmt + 0);
      const uint16_t channels = readLe16(fmt + 2);
      const uint32_t sample_rate = readLe32(fmt + 4);
      const uint16_t block_size = readLe16(fmt + 12);
      const uint16_t bits = readLe16(fmt + 14);
      if (audiofmt != 1 || channels == 0 || channels > 2 || sample_rate == 0 || (bits != 8 && bits != 16) ||
          block_size == 0) {
        setVoiceStateMessage(idx, "FMT_UNSUP");
        return false;
      }
      if (block_size != (channels * (bits / 8u))) {
        setVoiceStateMessage(idx, "FMT_BADBLK");
        return false;
      }

      if (chunk_size > sizeof(fmt)) {
        if (!skipStreamBytes(stream, http, chunk_size - sizeof(fmt))) {
          setVoiceStateMessage(idx, "FMT_SKIP");
          return false;
        }
      }
      if (chunk_size & 1u) {
        if (!skipStreamBytes(stream, http, 1)) {
          setVoiceStateMessage(idx, "FMT_PAD");
          return false;
        }
      }

      info.channels = channels;
      info.bits_per_sample = bits;
      info.sample_rate = sample_rate;
      info.block_size = block_size;
      got_fmt = true;
      continue;
    }

    if (memcmp(chunk_hdr, "data", 4) == 0) {
      if (!got_fmt) {
        setVoiceStateMessage(idx, "FMT_FIRST");
        return false;
      }
      info.data_bytes = chunk_size;
      if (info.data_bytes == 0) {
        setVoiceStateMessage(idx, "NO_DATA");
        return false;
      }
      return true;
    }

    if (!skipStreamBytes(stream, http, chunk_size)) {
      setVoiceStateMessage(idx, "CHUNK_SKIP");
      return false;
    }
    if (chunk_size & 1u) {
      if (!skipStreamBytes(stream, http, 1)) {
        setVoiceStateMessage(idx, "CHUNK_PAD");
        return false;
      }
    }
  }
}

// ストリーミング再生用カスタムStream: writeToStream()に渡してchunked encoding対応
// トリプルバッファでplayRawに送り出す（メモリ制約なし）
class PlaybackWriteStream : public Stream {
private:
  uint8_t header_buf_[44];
  size_t header_pos_ = 0;
  bool header_parsed_ = false;
  uint32_t play_rate_ = 24000;
  bool stereo_ = false;
  int buf_idx_ = 0;
  size_t write_pos_ = 0;
  bool play_ok_ = true;
  float rate_scale_;
  size_t total_pcm_ = 0;

  void parseHeader() {
    uint32_t sr = header_buf_[24] | (header_buf_[25] << 8) | (header_buf_[26] << 16) | (header_buf_[27] << 24);
    uint16_t ch = header_buf_[22] | (header_buf_[23] << 8);
    play_rate_ = (uint32_t)(sr * rate_scale_);
    stereo_ = ch > 1;
    logDiag("StreamPlay: %uHz -> %uHz, %uch", (unsigned)sr, (unsigned)play_rate_, (unsigned)ch);
  }

  void flushBuffer() {
    if (write_pos_ == 0) return;
    write_pos_ -= write_pos_ % 2;  // 16bit align
    if (write_pos_ == 0) return;

    size_t sample_len = write_pos_ / 2;
    // キューが空くまで待つ（DMAが前のバッファを読み終えるまで）
    uint32_t wait_start = millis();
    while (M5.Speaker.isPlaying(0) >= 2 && (millis() - wait_start) < 3000) {
      vTaskDelay(pdMS_TO_TICKS(5));
    }
    play_ok_ = M5.Speaker.playRaw(
        reinterpret_cast<const int16_t*>(g_voice_stream_buffers[buf_idx_]),
        sample_len, play_rate_, stereo_, 1, 0, false);
    total_pcm_ += write_pos_;
    buf_idx_ = (buf_idx_ + 1) % kStreamBufferCount;
    write_pos_ = 0;
  }

public:
  PlaybackWriteStream(float rate_scale) : rate_scale_(rate_scale) {}

  size_t write(uint8_t b) override { return write(&b, 1); }

  size_t write(const uint8_t* buf, size_t len) override {
    if (!play_ok_) return 0;
    size_t consumed = 0;

    // WAVヘッダー蓄積フェーズ（最初の44バイト）
    if (!header_parsed_) {
      while (consumed < len && header_pos_ < 44) {
        header_buf_[header_pos_++] = buf[consumed++];
      }
      if (header_pos_ >= 44) {
        parseHeader();
        header_parsed_ = true;
      }
      if (consumed >= len) return len;
    }

    // PCMデータをトリプルバッファに蓄積 → 一杯になったらplayRaw
    while (consumed < len && play_ok_) {
      size_t space = kVoiceStreamChunkBytes - write_pos_;
      size_t to_copy = len - consumed;
      if (to_copy > space) to_copy = space;
      memcpy(g_voice_stream_buffers[buf_idx_] + write_pos_, buf + consumed, to_copy);
      write_pos_ += to_copy;
      consumed += to_copy;

      if (write_pos_ >= kVoiceStreamChunkBytes) {
        flushBuffer();
      }
    }
    return len;
  }

  void finish() {
    if (write_pos_ > 0 && play_ok_) {
      flushBuffer();
    }
    // 全データ再生完了まで待つ
    uint32_t wait_start = millis();
    while (M5.Speaker.isPlaying(0) > 0 && (millis() - wait_start) < 15000) {
      vTaskDelay(pdMS_TO_TICKS(10));
    }
    logDiag("StreamPlay: done, %u bytes PCM played", (unsigned)total_pcm_);
  }

  bool isOk() const { return play_ok_ && header_parsed_; }

  // Stream interface (read系は不使用)
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
};

bool playDecodedWavFromHttp(VoiceTone type, HTTPClient& http, const char* success_msg, float rate_scale) {
  const size_t idx = static_cast<size_t>(type);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }

  if (!ensureSpeakerForPlayback("playDecodedWavFromHttp")) {
    setVoiceStateMessage(idx, "SPK_FAIL");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  setVoiceStateMessage(idx, "DECODE");
  setSpeakerVolume();
  M5.Speaker.stop();

  // ストリーミング再生: writeToStream()でchunked encoding対応 + トリプルバッファでplayRaw
  PlaybackWriteStream sink(rate_scale);
  const int written = http.writeToStream(&sink);
  sink.finish();

  if (written < 0 || !sink.isOk()) {
    logDiag("miotts streaming play failed written=%d ok=%d", written, (int)sink.isOk());
    setVoiceStateMessage(idx, "PLAY_FAIL");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  if (g_voice_data[idx]) {
    heap_caps_free(g_voice_data[idx]);
    g_voice_data[idx] = nullptr;
  }
  g_voice_data_len[idx] = 0;
  g_voice_loaded[idx] = false;
  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloaded);
  setVoiceStateMessage(idx, success_msg && success_msg[0] ? success_msg : "MIOTTS");
  return true;
}

bool playStreamingAudioFromHttp(VoiceTone type, HTTPClient& http, const char* success_msg, float rate_scale) {
  const size_t idx = static_cast<size_t>(type);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  if (!stream) {
    setVoiceStateMessage(idx, "NOSTREAM");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  WavStreamInfo info {};
  if (!parseWavHeaderFromStream(stream, http, info, idx)) {
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  if (!ensureSpeakerForPlayback("playStreamingAudioFromHttp")) {
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    setVoiceStateMessage(idx, "SPK_FAIL");
    return false;
  }

  setSpeakerVolume();
  M5.Speaker.stop();

  // トリプルバッファリング: playRawはポインタのみキューするため
  // DMAが読み出し中のバッファを上書きしないようローテーションする
  const int channel = 0;
  int buf_idx = 0;
  const size_t frame_bytes = static_cast<size_t>(info.block_size);
  const size_t sample_bytes = static_cast<size_t>(info.bits_per_sample / 8u);
  const uint32_t play_rate = (uint32_t)(info.sample_rate * rate_scale);
  uint32_t data_left = info.data_bytes;

  logDiag("streaming: %u bytes, %uHz -> %uHz, %uch", (unsigned)data_left, (unsigned)info.sample_rate, (unsigned)play_rate, (unsigned)info.channels);

  while (data_left > 0) {
    size_t want = data_left < kVoiceStreamChunkBytes ? static_cast<size_t>(data_left) : kVoiceStreamChunkBytes;
    want -= want % frame_bytes;
    if (want == 0) {
      if (!skipStreamBytes(stream, http, data_left)) {
        setVoiceStateMessage(idx, "READ_DROP");
        g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
        return false;
      }
      data_left = 0;
      break;
    }

    // 現在のバッファにデータ読み込み
    size_t got = 0;
    if (!readFromStreamWithTimeout(stream, http, g_voice_stream_buffers[buf_idx], want, got, true) || got != want) {
      setVoiceStateMessage(idx, "READ_ERR");
      g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
      return false;
    }
    data_left -= static_cast<uint32_t>(got);

    // 再生開始（ポインタをキューに入れる、stop_current_sound=false）
    const size_t sample_len = got / sample_bytes;
    const bool ok = (info.bits_per_sample == 16)
                        ? M5.Speaker.playRaw(reinterpret_cast<const int16_t*>(g_voice_stream_buffers[buf_idx]), sample_len, play_rate,
                                            info.channels > 1, 1, channel, false)
                        : M5.Speaker.playRaw(g_voice_stream_buffers[buf_idx], got, play_rate, info.channels > 1, 1, channel, false);
    if (!ok) {
      setVoiceStateMessage(idx, "PLAY_FAIL");
      g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
      return false;
    }

    // 次のバッファへローテーション
    buf_idx = (buf_idx + 1) % kStreamBufferCount;

    // キューが満杯（2つ以上キュー中）なら待つ
    while (M5.Speaker.isPlaying(channel) >= 2) {
      vTaskDelay(pdMS_TO_TICKS(5));
    }
  }

  // 全データ再生完了まで待つ
  while (M5.Speaker.isPlaying(channel) > 0) {
    vTaskDelay(pdMS_TO_TICKS(10));
  }

  if (g_voice_data[idx]) {
    heap_caps_free(g_voice_data[idx]);
    g_voice_data[idx] = nullptr;
  }
  g_voice_data_len[idx] = 0;
  g_voice_loaded[idx] = false;
  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloaded);
  setVoiceStateMessage(idx, success_msg && success_msg[0] ? success_msg : "STREAM");
  return true;
}

bool playStreamingVoiceByUrl(VoiceTone type, const char* url) {
  const size_t idx = static_cast<size_t>(type);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }
  if (!url || !url[0]) {
    setVoiceStateMessage(idx, "NO_URL");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }
  if (!connectToWiFi()) {
    setVoiceStateMessage(idx, "NOWIFI");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  bool begin_ok = http.begin(client, url);
  if (!begin_ok) {
    logDiag("voice begin failed: %s", url);
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    setVoiceStateMessage(idx, "HTTP_BEGIN");
    return false;
  }
  http.addHeader("User-Agent", "M5AtomS3R/1.0");
  http.setTimeout(kVoiceChunkTimeoutMs);
  const int code = http.GET();
  if (code != HTTP_CODE_OK) {
    logDiag("voice http error: %s code=%d", url, code);
    snprintf(g_voice_state_msg[idx], kVoiceStateMsgLen, "HTTP_%d", code);
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    http.end();
    return false;
  }

  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloading);
  const bool ok = playStreamingAudioFromHttp(type, http, "URL");
  http.end();
  if (ok) {
    logDiag("voice stream play ok: index=%u url=%s", (unsigned)idx, url);
  }
  return ok;
}

bool playStreamingVoice(VoiceTone type) {
  return playStreamingVoiceWithPhrase(type, (type == kVoiceBeep2) ? kMiottsPhraseBeep2 : kCharacters[g_current_character_index].phrase_happy);
}

bool playMiottsSpeechByText(const char* text, VoiceTone tone, bool quick_mode, float rate_scale) {
  const size_t idx = static_cast<size_t>(tone);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }
  if (!text || !text[0]) {
    text = kCharacters[g_current_character_index].phrase_happy;
  }
  if (!connectToWiFi()) {
    setVoiceStateMessage(idx, "NOWIFI");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  String host_candidates[8];
  size_t host_count = 0;
  buildMiottsHostCandidates(host_candidates, sizeof(host_candidates) / sizeof(host_candidates[0]), host_count);
  if (host_count == 0) {
    setVoiceStateMessage(idx, "GW_NONE");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }
  const String escaped_text = escapeJsonText(text);
  const String encoded_text = encodeUriComponent(text);

  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloading);
  setVoiceStateMessage(idx, "MIOTTS");

  const uint16_t force_port = g_miotts_port_override;
  for (size_t h = 0; h < host_count; ++h) {
    const String& host = host_candidates[h];
    const size_t port_count = force_port > 0 ? 1 : kMiottsPortCount;
    for (size_t i = 0; i < port_count; ++i) {
      const uint16_t port = force_port > 0 ? force_port : kMiottsPorts[i];
      String base = "http://" + host;
      if (port != 80) {
        base += ":" + String(port);
      }
      const size_t total_endpoints = sizeof(kMiottsEndpoints) / sizeof(kMiottsEndpoints[0]);
      const size_t endpoint_start = 0;  // /v1/tts is now first
      const size_t endpoint_count = quick_mode ? 1 : total_endpoints;
      for (size_t e = endpoint_start; e < endpoint_start + endpoint_count; ++e) {
        const auto& endpoint = kMiottsEndpoints[e];
        const size_t payload_count = quick_mode ? 1 : kMiottsPayloadVariantCount;
        for (size_t v = 0; v < payload_count; ++v) {
          WiFiClient client;
          HTTPClient http;
          const bool is_post = endpoint.method == MiottsMethod::kPost;
          String req_url = base + endpoint.path;
          String payload;
          if (is_post) {
            buildMiottsPayloadVariants(payload, escaped_text, v);
          } else {
            req_url += "?text=" + encoded_text;
            if (v > 0) {
              req_url += "&response_format=wav";
            }
            if (v == 4 || v == 5 || v == 6 || v == 7 || v == 8) {
              req_url += "&speaker=0";
            }
            if (v == 5 || v == 7) {
              req_url += "&voice=alloy";
            }
            if (v == 6 || v == 8) {
              req_url += "&model=tts-1";
            }
          }

          client.setTimeout(kMiottsHttpTimeoutMs / 1000);  // WiFiClient timeout in seconds
          const bool begin_ok = http.begin(client, req_url);
          if (!begin_ok) {
            logDiag("miotts begin failed: %s", req_url.c_str());
            setMiottsLastAttempt(is_post ? "POST" : "GET", host.c_str(), port, endpoint.path, -1, 0, -1, nullptr);
            setVoiceStateMessage(idx, "MI_BEGIN");
            vTaskDelay(pdMS_TO_TICKS(kMiottsRetryDelayMs));
            continue;
          }
          http.addHeader("User-Agent", "M5AtomS3R/1.0");
          http.addHeader("Accept", "audio/wav, audio/x-wav, audio/wave, application/json, text/plain, */*");
          http.setTimeout(kMiottsHttpTimeoutMs);
          if (is_post) {
            http.addHeader("Content-Type", "application/json");
          }
          const uint32_t start_ms = millis();
          const int code = is_post ? http.POST(payload) : http.GET();
          const uint32_t elapsed_ms = millis() - start_ms;
          const String content_type = http.header("Content-Type");
          setMiottsLastAttempt(is_post ? "POST" : "GET", host.c_str(), port, endpoint.path, code, elapsed_ms, http.getSize(), content_type.c_str());

          if (code != HTTP_CODE_OK) {
            logDiag("miotts http error: %s code=%d", req_url.c_str(), code);
            snprintf(g_voice_state_msg[idx], kVoiceStateMsgLen, "MI_%d", code);
            g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
            http.end();
            vTaskDelay(pdMS_TO_TICKS(kMiottsRetryDelayMs));
            continue;
          }

          const bool looks_wav = content_type.indexOf("audio/wav") >= 0 || content_type.indexOf("audio/x-wav") >= 0 ||
                                 content_type.indexOf("audio/wave") >= 0;
          if (looks_wav || content_type.length() == 0 || content_type == "application/octet-stream") {
            // PlaybackWriteStream: writeToStream()でchunked encoding対応 + トリプルバッファ
            if (playDecodedWavFromHttp(tone, http, "MIOTTS", rate_scale)) {
              logDiag("miotts hit: %s", req_url.c_str());
              g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloaded);
              setVoiceStateMessage(idx, "MI_OK");
              http.end();
              return true;
            }
            http.end();
            vTaskDelay(pdMS_TO_TICKS(kMiottsRetryDelayMs));
            continue;
          }

          if (content_type.indexOf("audio/") >= 0) {
            logDiag("miotts unsupported audio type: %s", content_type.c_str());
            http.end();
            vTaskDelay(pdMS_TO_TICKS(kMiottsRetryDelayMs));
            continue;
          }

          if (content_type.indexOf("json") >= 0 || content_type.indexOf("text/plain") >= 0) {
            String body = http.getString();
            String audio_url;
            if (extractJsonStringValue(body, "audio", audio_url) || extractJsonStringValue(body, "url", audio_url) ||
                extractJsonStringValue(body, "path", audio_url) || extractJsonStringValue(body, "result", audio_url)) {
              if (audio_url.startsWith("http://") || audio_url.startsWith("https://")) {
                if (playStreamingVoiceByUrl(tone, audio_url.c_str())) {
                  http.end();
                  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloaded);
                  setVoiceStateMessage(idx, "MI_OK_URL");
                  return true;
                }
              } else if (audio_url.startsWith("/")) {
                const String abs_url = base + audio_url;
                if (playStreamingVoiceByUrl(tone, abs_url.c_str())) {
                  http.end();
                  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloaded);
                  setVoiceStateMessage(idx, "MI_OK_URL");
                  return true;
                }
              } else {
                logDiag("miotts json audio ref unexpected=%s", audio_url.c_str());
              }
            } else {
              logDiag("miotts unsupported json payload ct=%s", content_type.c_str());
            }
          }

          http.end();
          vTaskDelay(pdMS_TO_TICKS(kMiottsRetryDelayMs));
        }
      }
      if (quick_mode) {
        return false;
      }
    }
  }

  setVoiceStateMessage(idx, "M_FAIL");
  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
  return false;
}

bool playStreamingVoiceWithPhrase(VoiceTone type, const char* phrase, const bool quick_mode, float rate_scale) {
  if (playMiottsSpeechByText(phrase, type, quick_mode, rate_scale)) {
    return true;
  }
  const size_t idx = static_cast<size_t>(type);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }

  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloading);
  for (size_t attempt = 0; attempt < 2; ++attempt) {
    const char* url = kVoiceUrls[idx][attempt];
    setVoiceStateMessage(idx, attempt == 0 ? "TRY1" : "TRY2");
    if (playStreamingVoiceByUrl(static_cast<VoiceTone>(idx), url)) {
      return true;
    }
    if (attempt + 1 < 2) {
      vTaskDelay(pdMS_TO_TICKS(350));
    }
  }

  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
  if (g_voice_state_msg[idx][0] == '\0' || strncmp(g_voice_state_msg[idx], "OK", 2) == 0) {
    setVoiceStateMessage(idx, "FAIL");
  }
  return false;
}

void setVoiceStateMessage(size_t idx, const char* msg) {
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return;
  }
  if (!msg || !msg[0]) {
    g_voice_state_msg[idx][0] = '\0';
    return;
  }
  strncpy(g_voice_state_msg[idx], msg, kVoiceStateMsgLen - 1);
  g_voice_state_msg[idx][kVoiceStateMsgLen - 1] = '\0';
}

void startMdns() {
  if (g_mdns_started) {
    return;
  }
  if (!MDNS.begin(kDeviceHostName)) {
    logDiag("mDNS begin failed");
    return;
  }
  g_mdns_started = true;
  logDiag("mDNS started: %s.local", kDeviceHostName);
}

void resetMdnsIfNeeded() {
  if (!WiFi.isConnected()) {
    if (g_mdns_started) {
      MDNS.end();
      g_mdns_started = false;
    }
    return;
  }
  if (!g_mdns_started) {
    startMdns();
  }
}

void postDiagnosticsToRelay() {
  if (!kLogRelayUrl[0]) {
    return;
  }
  if ((millis() - g_last_log_push_ms) < kLogRelayIntervalMs) {
    return;
  }
  g_last_log_push_ms = millis();

  if (!g_voice_wifi_ok || WiFi.status() != WL_CONNECTED) {
    return;
  }
  if (g_diag_line_count == 0) {
    return;
  }

  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secure_client;
  bool begin_ok = false;
  const bool use_https = (strncmp(kLogRelayUrl, "https://", 8) == 0);
  if (use_https) {
    secure_client.setInsecure();
    begin_ok = http.begin(secure_client, kLogRelayUrl);
  } else {
    begin_ok = http.begin(client, kLogRelayUrl);
  }
  if (!begin_ok) {
    logDiag("relay begin failed");
    return;
  }

  http.addHeader("Content-Type", "text/plain; charset=utf-8");
  http.setTimeout(kVoiceChunkTimeoutMs);
  const auto cfg = M5.Speaker.config();

  String body;
  body.reserve(kLogRelayBodyLen);
  body += "M5 Tamagotchi debug report\n";
  body += "device=";
  body += kDeviceHostName;
  body += "\n";
  body += "ip=" + WiFi.localIP().toString() + "\n";
  body += "wifi=" + String(wifiStatusText()) + "\n";
  body += "speakerReady=" + String(g_speaker_ready ? "1" : "0") + "\n";
  body += "speakerEnabled=" + String(M5.Speaker.isEnabled() ? "1" : "0") + "\n";
  body += "speakerRunning=" + String(M5.Speaker.isRunning() ? "1" : "0") + "\n";
  body += "speakerPins=" + String(cfg.pin_data_out) + "," + String(cfg.pin_bck) + "," + String(cfg.pin_ws) + "," +
          String((int)cfg.i2s_port) + "\n";
  body += "voiceLoaded=" + String(g_voice_loaded[static_cast<size_t>(kVoiceDefault)] ? "1" : "0") + "\n";
  body += "voiceState=" + String(g_voice_state_msg[static_cast<size_t>(kVoiceDefault)]) + "\n";
  body += "voice2Loaded=" + String(g_voice_loaded[static_cast<size_t>(kVoiceBeep2)] ? "1" : "0") + "\n";
  body += "voice2State=" + String(g_voice_state_msg[static_cast<size_t>(kVoiceBeep2)]) + "\n";
  body += "diagSeq=" + String((unsigned long)g_diag_seq) + "\n";
  body += "----\n";

  const size_t start = (g_diag_line_index + kDiagLineCount - g_diag_line_count) % kDiagLineCount;
  for (size_t i = 0; i < g_diag_line_count; ++i) {
    const size_t idx = (start + i) % kDiagLineCount;
    body += g_diag_lines[idx];
    body += "\n";
  }

  const int code = http.POST(body);
  if (code < 0) {
    logDiag("relay post send fail code=%d", code);
  } else if (code < 200 || code >= 300) {
    logDiag("relay post error code=%d", code);
  } else {
    logDiag("relay post ok code=%d", code);
  }
  http.end();
}

bool connectToWiFi() {
  if (!kWiFiSsid[0] || !kWiFiPassword[0]) {
    g_voice_wifi_ok = false;
    g_wifi_status = static_cast<uint8_t>(WifiStatus::kFailed);
    return false;
  }
  if (g_voice_wifi_ok && WiFi.status() == WL_CONNECTED) {
    g_wifi_status = static_cast<uint8_t>(WifiStatus::kConnected);
    return true;
  }

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  g_wifi_status = static_cast<uint8_t>(WifiStatus::kConnecting);
  WiFi.begin(kWiFiSsid, kWiFiPassword);
  const TickType_t deadline = xTaskGetTickCount() + pdMS_TO_TICKS(kVoiceConnectTimeoutMs);
  while (xTaskGetTickCount() < deadline) {
    if (WiFi.status() == WL_CONNECTED) {
      g_voice_wifi_ok = true;
      g_wifi_status = static_cast<uint8_t>(WifiStatus::kConnected);
      logDiag("Wi-Fi connected: %s", WiFi.localIP().toString().c_str());
      return true;
    }
    vTaskDelay(pdMS_TO_TICKS(200));
  }
  g_voice_wifi_ok = false;
  WiFi.disconnect(true);
  g_wifi_status = static_cast<uint8_t>(WifiStatus::kFailed);
  logDiag("Wi-Fi connect timeout");
  return false;
}

bool downloadVoiceData(const char* url, uint8_t*& dst, size_t& dst_len, const size_t idx) {
  if (!connectToWiFi() || !url || !url[0]) {
    setVoiceStateMessage(idx, "NO_WIFI");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  bool begin_ok = http.begin(client, url);
  if (!begin_ok) {
    logDiag("voice secure begin failed: %s", url);
    logDiag("voice begin fallback plain tls: %s", url);
    begin_ok = http.begin(url);
  }
  if (!begin_ok) {
    setVoiceStateMessage(idx, "HTTP_BEGIN");
    return false;
  }
  http.addHeader("User-Agent", "M5AtomS3R/1.0");
  http.setTimeout(kVoiceChunkTimeoutMs);
  const int code = http.GET();
  if (code != HTTP_CODE_OK) {
    logDiag("voice http error: %s code=%d", url, code);
    snprintf(g_voice_state_msg[idx], kVoiceStateMsgLen, "HTTP_%d", code);
    http.end();
    return false;
  }

  const int32_t payload_len = http.getSize();
  const bool fixed_size = payload_len > 0;
  const uint32_t expected_len = fixed_size ? static_cast<uint32_t>(payload_len) : kMaxVoiceBytes;
  const String content_type = http.header("Content-Type");
  if (content_type.length() > 0 && !content_type.startsWith("audio/") &&
      content_type.indexOf("application/octet-stream") < 0) {
    logDiag("voice content-type suspicious: %s", content_type.c_str());
    setVoiceStateMessage(idx, "BAD_TYPE");
  }
  if (fixed_size && payload_len > static_cast<int32_t>(kMaxVoiceBytes)) {
    logDiag("voice size too large: got=%d max=%u", payload_len, static_cast<unsigned>(kMaxVoiceBytes));
    setVoiceStateMessage(idx, "BAD_SIZE");
    http.end();
    return false;
  }
  if (!fixed_size) {
    logDiag("voice size unknown (chunked).");
    setVoiceStateMessage(idx, "UNK_SIZE");
  }

  uint8_t* buffer = static_cast<uint8_t*>(heap_caps_malloc(expected_len, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!buffer) {
    logDiag("voice alloc fail on SPIRAM: size=%lu", static_cast<unsigned long>(expected_len));
    setVoiceStateMessage(idx, "ALLOC_SPIRAM");
    buffer = static_cast<uint8_t*>(heap_caps_malloc(expected_len, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT));
    if (!buffer) {
      logDiag("voice alloc fail");
      setVoiceStateMessage(idx, "ALLOC_FAIL");
      http.end();
      return false;
    }
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t read_total = 0;
  TickType_t last_activity = xTaskGetTickCount();
  while (read_total < expected_len) {
    const TickType_t now = xTaskGetTickCount();
    if (now - last_activity > pdMS_TO_TICKS(kVoiceReadTimeoutMs)) {
      logDiag("voice read timeout: url=%s read=%u/%s", url, static_cast<unsigned>(read_total),
              fixed_size ? "fixed" : "chunked");
      setVoiceStateMessage(idx, "TIMEOUT");
      break;
    }
    const int available = stream->available();
    if (available <= 0) {
      if (fixed_size) {
        if (read_total >= expected_len) {
          break;
        }
      } else if (!http.connected()) {
        break;
      }
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }
    const size_t room = expected_len - read_total;
    const size_t read_bytes = static_cast<size_t>(available > static_cast<int>(kVoiceChunkBytes) ? kVoiceChunkBytes : available);
    const int n = stream->read(buffer + read_total, room < read_bytes ? room : read_bytes);
    if (n <= 0) {
      vTaskDelay(pdMS_TO_TICKS(5));
      continue;
    }
    read_total += static_cast<size_t>(n);
    last_activity = now;
  }
  http.end();

  if (read_total == 0) {
    logDiag("voice empty: url=%s", url);
    setVoiceStateMessage(idx, "EMPTY");
    heap_caps_free(buffer);
    return false;
  }
  if (fixed_size && read_total != static_cast<size_t>(payload_len)) {
    logDiag("voice download incomplete: url=%s got=%u/%d", url, static_cast<unsigned>(read_total), payload_len);
    setVoiceStateMessage(idx, "INCOMPLETE");
    heap_caps_free(buffer);
    return false;
  }
  if (!isWavHeader(buffer, read_total)) {
    logDiag("voice header invalid: url=%s got=%u", url, static_cast<unsigned>(read_total));
    setVoiceStateMessage(idx, "BAD_HEADER");
    heap_caps_free(buffer);
    return false;
  }

  if (dst) {
    heap_caps_free(dst);
  }
  dst = buffer;
  dst_len = read_total;
  setVoiceStateMessage(idx, "OK");
  return true;
}

bool playVoice(VoiceTone type) {
  const size_t idx = static_cast<size_t>(type);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }
  if (!g_voice_loaded[idx]) {
    return false;
  }
  if (!ensureSpeakerForPlayback("playVoice")) {
    return false;
  }
  setSpeakerVolume();
  const uint8_t before = M5.Speaker.getPlayingChannels();
  M5.Speaker.stop();
  if (!M5.Speaker.playWav(g_voice_data[idx], g_voice_data_len[idx], 1, 0, true)) {
    logDiag("playWav queue rejected idx=%u", (unsigned)idx);
    return false;
  }
  vTaskDelay(pdMS_TO_TICKS(8));
  const uint8_t after = M5.Speaker.getPlayingChannels();
  if (after == 0) {
    logDiag("playWav queue not reflected yet idx=%u before=%u", (unsigned)idx, (unsigned)before);
  }
  return true;
}

bool downloadVoiceByIndex(size_t idx) {
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }
  if (!connectToWiFi()) {
    setVoiceStateMessage(idx, "NOWIFI");
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
    return false;
  }

  constexpr size_t kCandidatesPerVoice = 2;
  g_voice_loaded[idx] = false;
  for (size_t attempt = 0; attempt < kCandidatesPerVoice; ++attempt) {
    g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloading);
    const char* url = kVoiceUrls[idx][attempt];
    setVoiceStateMessage(idx, attempt == 0 ? "TRY1" : "TRY2");
    if (downloadVoiceData(url, g_voice_data[idx], g_voice_data_len[idx], idx)) {
      g_voice_loaded[idx] = true;
      g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kDownloaded);
      logDiag("voice downloaded: index=%u len=%u", (unsigned)idx, (unsigned)g_voice_data_len[idx]);
      return true;
    }
    if (attempt + 1 < kCandidatesPerVoice) {
      vTaskDelay(pdMS_TO_TICKS(400));
    }
  }

  g_voice_state[idx] = static_cast<uint8_t>(VoiceState::kFailed);
  if (g_voice_state_msg[idx][0] == '\0' || strncmp(g_voice_state_msg[idx], "OK", 2) == 0) {
    setVoiceStateMessage(idx, "FAIL");
  }
  return false;
}

bool ensureVoiceDownloaded(VoiceTone type, const bool fallback_blocking) {
  const size_t idx = static_cast<size_t>(type);
  if (idx >= static_cast<size_t>(kVoiceCount)) {
    return false;
  }
  if (g_voice_loaded[idx] && g_voice_data[idx] && g_voice_data_len[idx] > 0) {
    return true;
  }

  if (g_voice_task && idx < kAutoDownloadVoiceCount) {
    for (size_t i = 0; i < 120; ++i) {
      if (g_voice_loaded[idx] && g_voice_data[idx] && g_voice_data_len[idx] > 0) {
        return true;
      }
      if (static_cast<VoiceState>(g_voice_state[idx]) == VoiceState::kFailed) {
        if (fallback_blocking) {
          break;
        }
        return false;
      }
      vTaskDelay(pdMS_TO_TICKS(25));
    }
    if (!fallback_blocking) {
      return false;
    }
  }

  return downloadVoiceByIndex(idx);
}

bool forceAtomicEchoSpeakerPins() {
  auto cfg = M5.Speaker.config();
  cfg.pin_data_out = GPIO_NUM_5;
  cfg.pin_bck = GPIO_NUM_8;
  cfg.pin_ws = GPIO_NUM_6;
  cfg.pin_mck = I2S_PIN_NO_CHANGE;
  cfg.i2s_port = I2S_NUM_1;
  cfg.sample_rate = 16000;  // Atomic Echo Base公式推奨レート
  cfg.magnification = 1;
  cfg.stereo = false;
  cfg.buzzer = false;
  cfg.use_dac = false;
  cfg.dac_zero_level = 0;
  M5.Speaker.config(cfg);
  M5.Speaker.end();
  const bool ok = M5.Speaker.begin();
  logDiag("force audio pins data=%d bck=%d ws=%d i2s=%d begin=%d", cfg.pin_data_out, cfg.pin_bck, cfg.pin_ws, (int)cfg.i2s_port,
          (int)ok);
  return ok;
}

bool initSpeakerHardware() {
  g_speaker_ready = M5.Speaker.isEnabled();
  if (!g_speaker_ready) {
    logDiag("speaker is not enabled by config");
    return false;
  }
  bool ok = M5.Speaker.begin();
  if (!ok || !M5.Speaker.isRunning()) {
    logDiag("speaker begin failed (enabled=%d) fallback force pins", (int)M5.Speaker.isEnabled());
    ok = forceAtomicEchoSpeakerPins();
  }
  if (ok) {
    setSpeakerVolume();
    dumpSpeakerConfig();
  }
  g_speaker_ready = ok && M5.Speaker.isEnabled();
  return g_speaker_ready;
}

bool ensureSpeakerForPlayback(const char* context) {
  if (!g_speaker_ready) {
    logDiag("%s: speaker_ready=%d", context, (int)g_speaker_ready);
    return false;
  }
  if (!M5.Speaker.isEnabled()) {
    logDiag("%s: speaker pin not configured", context);
    return false;
  }
  if (!M5.Speaker.isRunning()) {
    if (!initSpeakerHardware()) {
      logDiag("%s: speaker begin failed", context);
      return false;
    }
  }
  if (!M5.Speaker.isRunning()) {
    logDiag("%s: speaker still not running", context);
    return false;
  }
  return true;
}

bool playTestTone(uint16_t frequency, uint32_t duration_ms) {
  if (!ensureSpeakerForPlayback("playTestTone")) {
    return false;
  }
  setSpeakerVolume();
  M5.Speaker.stop();
  const bool ok = M5.Speaker.tone(frequency, duration_ms);
  vTaskDelay(pdMS_TO_TICKS(3));
  if (!ok || M5.Speaker.getPlayingChannels() == 0) {
    logDiag("tone failed: freq=%u duration=%u", frequency, (unsigned)duration_ms);
    return false;
  }
  return true;
}

void voiceDownloadTask(void*) {
  if (!connectToWiFi()) {
    for (size_t i = 0; i < static_cast<size_t>(kAutoDownloadVoiceCount); ++i) {
      setVoiceStateMessage(i, "NOWIFI");
      g_voice_state[i] = static_cast<uint8_t>(VoiceState::kFailed);
    }
    g_voice_task = nullptr;
    vTaskDelete(nullptr);
    return;
  }

  for (size_t i = 0; i < kAutoDownloadVoiceCount; ++i) {
    if (!downloadVoiceByIndex(i)) {
      vTaskDelay(pdMS_TO_TICKS(kVoiceRetryDelayMs));
    }
    vTaskDelay(pdMS_TO_TICKS(200));
  }
  g_voice_task = nullptr;
  vTaskDelete(nullptr);
}

void printVoiceStatus() {
  logDiag("=== voice status ===");
  logDiag("WiFi status=%u", static_cast<unsigned>(g_wifi_status));
  logDiag("speaker_ready=%d volume=%u%%", (int)g_speaker_ready, static_cast<unsigned>(kSpeakerVolumePercent[g_speaker_volume_index]));
  for (size_t i = 0; i < static_cast<size_t>(kVoiceCount); ++i) {
    logDiag("[%u] state=%u msg=%s len=%u loaded=%d", (unsigned)i, static_cast<unsigned>(g_voice_state[i]), g_voice_state_msg[i],
            static_cast<unsigned>(g_voice_data_len[i]), (int)g_voice_loaded[i]);
  }
}

void registerDebugHttpRoutes() {
  if (g_debug_routes_registered) {
    return;
  }

  const WebServer::THandlerFunction debug_handler = []() { handleDebugHttpRequest(); };
  g_debug_server.on("/", HTTP_ANY, debug_handler);
  g_debug_server.on("/status", HTTP_ANY, debug_handler);
  g_debug_server.on("/ping", HTTP_ANY, debug_handler);
  g_debug_server.on("/miotts", HTTP_ANY, debug_handler);
  g_debug_server.on("/diag", HTTP_ANY, debug_handler);
  g_debug_server.on("/beep", HTTP_ANY, debug_handler);
  g_debug_server.on("/beep2", HTTP_ANY, debug_handler);
  g_debug_server.on("/voice", HTTP_ANY, debug_handler);
  g_debug_server.on("/download", HTTP_ANY, debug_handler);
  g_debug_server.on("/relay", HTTP_ANY, debug_handler);
  g_debug_server.onNotFound([]() {
    g_debug_server.send(404, "text/plain; charset=utf-8", "not found");
  });
  g_debug_routes_registered = true;
}

void startDebugHttpServer() {
  if (g_debug_server_started || !WiFi.isConnected()) {
    return;
  }
  registerDebugHttpRoutes();
  g_debug_server.begin();
  g_debug_server_started = true;
  logDiag("debug server started: http://%s:%u/status", WiFi.localIP().toString().c_str(), (unsigned)kHttpServerPort);
}

void stopDebugHttpServer() {
  if (!g_debug_server_started) {
    return;
  }
  g_debug_server.stop();
  g_debug_server_started = false;
  logDiag("debug server stopped");
}

void debugHttpServerTask(void*) {
  for (;;) {
    if (g_debug_server_started && WiFi.isConnected()) {
      g_debug_server.handleClient();
      vTaskDelay(pdMS_TO_TICKS(2));
    } else {
      vTaskDelay(pdMS_TO_TICKS(20));
    }
  }
}

void startDebugHttpServerTask() {
  if (g_http_task) {
    return;
  }

  xTaskCreatePinnedToCore(
      debugHttpServerTask,
      "httpServerTask",
      kHttpTaskStackBytes,
      nullptr,
      kHttpTaskPriority,
      &g_http_task,
      1
  );
  if (!g_http_task) {
    logDiag("debug http task start failed");
  }
}

void simpleHttpServerTask(void*) {
  for (;;) {
    if (!g_simple_http_server_started || !WiFi.isConnected()) {
      vTaskDelay(pdMS_TO_TICKS(20));
      continue;
    }

    WiFiClient client = g_simple_http_server.available();
    if (!client) {
      vTaskDelay(pdMS_TO_TICKS(4));
      continue;
    }

    client.setTimeout(1500);
    const String request_line = client.readStringUntil('\n');
    if (request_line.length() == 0) {
      client.stop();
      continue;
    }

    int method_end = request_line.indexOf(' ');
    int path_end = -1;
    const int first_space = method_end;
    if (first_space > 0) {
      path_end = request_line.indexOf(' ', first_space + 1);
    }
    const String method = (first_space > 0) ? request_line.substring(0, static_cast<size_t>(first_space)) : String("GET");
    String path = ((first_space > 0) && (path_end > first_space))
                      ? request_line.substring(static_cast<size_t>(first_space + 1),
                                             static_cast<size_t>(path_end))
                      : String("/");
    const int query = path.indexOf('?');
    if (query >= 0) {
      path = path.substring(0, static_cast<size_t>(query));
    }

    const uint32_t req_id = ++g_simple_http_request_seq;
    g_simple_http_last_request_ms = millis();
    logDiag("SHTTP[%lu] %s %s", static_cast<unsigned long>(req_id), method.c_str(), path.c_str());

    while (client.available()) {
      const String header = client.readStringUntil('\n');
      if (header.length() <= 1) {
        break;
      }
    }

    auto send_text = [&](int code, const char* status_text, const char* content_type, const String& body) {
      client.printf("HTTP/1.1 %d %s\r\n", code, status_text);
      client.printf("Content-Type: %s\r\n", content_type);
      client.printf("Content-Length: %d\r\n", body.length());
      client.println("Connection: close");
      client.println("Cache-Control: no-store");
      client.println();
      client.print(body);
      client.flush();
      client.stop();
    };

    if (method != "GET" && method != "POST") {
      send_text(405, "Method Not Allowed", "text/plain; charset=utf-8", "method-not-allowed");
      continue;
    }

    if (path == "/ping") {
      char pong[64];
      const int written = snprintf(pong, sizeof(pong), "pong %lu", (unsigned long)millis());
      send_text(200, "OK", "text/plain; charset=utf-8", written > 0 ? String(pong) : String("pong"));
      continue;
    }

    if (path == "/" || path == "/status") {
      if (path == "/status") {
        const String ip = WiFi.localIP().toString();
        char body[700];
        const int written = snprintf(
            body, sizeof(body),
            "{\"ip\":\"%s\",\"host\":\"%s.local\",\"wifi\":%u,\"speakerReady\":%d,\"speakerRunning\":%d,\"miottsHost\":\"%s\","
            "\"miottsPort\":%u,\"miottsLastHost\":\"%s\",\"miottsLastPort\":%u,\"miottsLastUrl\":\"%s\",\"miottsLastMethod\":\"%s\","
            "\"miottsLastCode\":%d,\"miottsLastMs\":%u,\"miottsLastElapsed\":%u,\"miottsLastPayload\":%ld,\"miottsLastCt\":\"%s\","
            "\"miottsLastErr\":%u,\"mdns\":%d,\"httpReq\":%lu,\"httpReqMs\":%u,\"server\":\"simple\"}",
            ip.c_str(), kDeviceHostName, (unsigned)g_wifi_status, (int)g_speaker_ready, (int)M5.Speaker.isRunning(),
            g_miotts_host_override[0] ? g_miotts_host_override : "", (unsigned)g_miotts_port_override, g_miotts_last_host,
            (unsigned)g_miotts_last_port, g_miotts_last_url, g_miotts_last_method, (int)g_miotts_last_code,
            (unsigned)g_miotts_last_probe_ms, (unsigned)g_miotts_last_elapsed_ms, (long)g_miotts_last_payload_len,
            g_miotts_last_content_type, (unsigned)g_miotts_last_error_flag, (int)g_mdns_started, (unsigned long)g_simple_http_request_seq,
            (unsigned)g_simple_http_last_request_ms);
        if (written > 0 && written < static_cast<int>(sizeof(body))) {
          send_text(200, "OK", "application/json; charset=utf-8", String(body));
        } else {
          send_text(500, "Internal Server Error", "text/plain; charset=utf-8", "{}");
        }
      } else {
        send_text(200, "OK", "text/plain; charset=utf-8", "M5Tamagotchi simple debug server");
      }
      continue;
    }

    send_text(404, "Not Found", "text/plain; charset=utf-8", "not found");
  }
}

void startSimpleHttpServer() {
  if (!g_simple_http_server_started && WiFi.isConnected()) {
    g_simple_http_server.begin();
    g_simple_http_server_started = true;
    logDiag("simple server started: http://%s:%u/status", WiFi.localIP().toString().c_str(), (unsigned)kSimpleHttpServerPort);
  }
  if (g_simple_http_task) {
    return;
  }

  xTaskCreatePinnedToCore(
      simpleHttpServerTask,
      "simpleHttpServerTask",
      kSimpleHttpTaskStackBytes,
      nullptr,
      kSimpleHttpTaskPriority,
      &g_simple_http_task,
      1
  );
  if (!g_simple_http_task) {
    logDiag("simple http task start failed");
  }
}

void stopSimpleHttpServer() {
  if (!g_simple_http_server_started) {
    return;
  }
  g_simple_http_server.stop();
  g_simple_http_server_started = false;
  logDiag("simple server stopped");
}

void handleDebugHttpRequest() {
  if (!g_debug_server_started) {
    return;
  }

  if (g_debug_server.method() != HTTP_GET && g_debug_server.method() != HTTP_POST) {
    g_debug_server.send(405, "text/plain; charset=utf-8", "method-not-allowed");
    return;
  }
  const String path = g_debug_server.uri();
  const uint32_t req_id = ++g_http_request_seq;
  g_http_last_request_ms = millis();
  logDiag("HTTP[%lu] %s %s", static_cast<unsigned long>(req_id),
          (g_debug_server.method() == HTTP_GET) ? "GET" : "POST", path.c_str());
  auto send_text = [&](const char* content_type, const String& body) {
    g_debug_server.sendHeader("Connection", "close");
    g_debug_server.sendHeader("Cache-Control", "no-store");
    g_debug_server.send(200, content_type, body);
  };

  auto arg_true = [](const String& value) {
    String lower = value;
    lower.toLowerCase();
    return isAffirmativeArg(lower);
  };

  if (path == "/ping") {
    char pong[64];
    const int written = snprintf(pong, sizeof(pong), "pong %lu", (unsigned long)millis());
    send_text("text/plain; charset=utf-8", written > 0 ? String(pong) : String("pong"));
    return;
  }

  if (path == "/" || path == "/status") {
    if (path == "/status") {
      char json[1500];
      const String ip_string = WiFi.localIP().toString();
      const char* ip = ip_string.c_str();
      const auto sc = M5.Speaker.config();
      const int written = snprintf(json, sizeof(json), "{\"ip\":\"%s\",\"host\":\"%s.local\",\"board\":%d,\"wifi\":%u,\"wifiText\":\"%s\","
                                       "\"speakerReady\":%d,\"speakerEnabled\":%d,\"speakerRunning\":%d,"
                                       "\"speakerPinData\":%d,\"speakerPinBck\":%d,\"speakerPinWs\":%d,\"speakerI2s\":%d,"
                                       "\"miottsHost\":\"%s\",\"miottsPort\":%u,\"miottsProbe\":\"%s\",\"miottsProbeMs\":%u,"
                                       "\"miottsLastHost\":\"%s\",\"miottsLastPort\":%u,\"miottsLastUrl\":\"%s\",\"miottsLastMethod\":\"%s\","
                                       "\"miottsLastCode\":%d,\"miottsLastMs\":%u,\"miottsLastElapsed\":%u,\"miottsLastPayload\":%ld,"
                                       "\"miottsLastCt\":\"%s\",\"miottsLastErr\":%u,"
                                       "\"mdns\":%d,\"relay\":%d,\"diagLines\":%u,"
                                       "\"voiceLoaded\":%d,\"voiceState\":%u,\"voiceMsg\":\"%s\",\"voiceLen\":%u,"
                                       "\"voice2Loaded\":%d,\"voice2State\":%u,\"voice2Msg\":\"%s\",\"voice2Len\":%u,"
                                       "\"httpServer\":%d,\"httpReq\":%lu,\"httpReqMs\":%u}",
                                       ip, kDeviceHostName, (int)M5.getBoard(), (unsigned)g_wifi_status, wifiStatusText(),
                                       (int)g_speaker_ready, (int)M5.Speaker.isEnabled(), (int)M5.Speaker.isRunning(),
                                       sc.pin_data_out, sc.pin_bck, sc.pin_ws, (int)sc.i2s_port,
                                       g_miotts_host_override[0] ? g_miotts_host_override : "", (unsigned)g_miotts_port_override,
                                       g_miotts_probe_last, (unsigned)g_miotts_probe_last_ms, g_miotts_last_host,
                                       (unsigned)g_miotts_last_port, g_miotts_last_url, g_miotts_last_method, (int)g_miotts_last_code,
                                       (unsigned)g_miotts_last_probe_ms, (unsigned)g_miotts_last_elapsed_ms, (long)g_miotts_last_payload_len,
                                       g_miotts_last_content_type, (unsigned)g_miotts_last_error_flag,
                                       (int)g_mdns_started, (int)kLogRelayEnabled, (unsigned)g_diag_line_count,
                                       (int)g_voice_loaded[static_cast<size_t>(kVoiceDefault)],
                                       (unsigned)g_voice_state[static_cast<size_t>(kVoiceDefault)], g_voice_state_msg[static_cast<size_t>(kVoiceDefault)],
                                       (unsigned)g_voice_data_len[static_cast<size_t>(kVoiceDefault)],
                                       (int)g_voice_loaded[static_cast<size_t>(kVoiceBeep2)],
                                       (unsigned)g_voice_state[static_cast<size_t>(kVoiceBeep2)], g_voice_state_msg[static_cast<size_t>(kVoiceBeep2)],
                                       (unsigned)g_voice_data_len[static_cast<size_t>(kVoiceBeep2)], (int)g_debug_server_started,
                                       (unsigned long)g_http_request_seq, (unsigned)g_http_last_request_ms);
      if (written < 0 || written >= static_cast<int>(sizeof(json))) {
        send_text("application/json; charset=utf-8", "{}");
      } else {
        send_text("application/json; charset=utf-8", String(json));
      }
    } else {
      send_text("text/plain; charset=utf-8", "M5Tamagotchi debug ready");
    }
    return;
  }

  if (path == "/miotts") {
    String probe_result;
    String test_voice;
    bool quick_probe = false;
    bool quick_speak = false;
    bool verbose_probe = false;

    if (g_debug_server.hasArg("host")) {
      const String host_value = g_debug_server.arg("host");
      if (host_value == "clear" || host_value == "none") {
        clearMiottsHostOverride();
      } else {
        setMiottsHostOverride(host_value.c_str());
      }
    }

    if (g_debug_server.hasArg("port")) {
      const String port_value = g_debug_server.arg("port");
      bool port_ok = false;
      const uint16_t explicit_port = parseUInt16(port_value, port_ok);
      if (port_ok) {
        g_miotts_port_override = explicit_port;
      } else if (port_value == "default" || port_value == "0") {
        g_miotts_port_override = 0;
      } else {
        logDiag("miotts port parse failed: %s", port_value.c_str());
      }
    }

    if (g_debug_server.hasArg("clear") && arg_true(g_debug_server.arg("clear"))) {
      g_miotts_port_override = 0;
    }

    if (g_debug_server.hasArg("probe") && arg_true(g_debug_server.arg("probe"))) {
      if (!connectToWiFi()) {
        setMiottsProbeLast("NO_WIFI");
        probe_result = "NO_WIFI";
      } else {
        if (g_debug_server.hasArg("verbose") && arg_true(g_debug_server.arg("verbose"))) {
          verbose_probe = true;
        }
        if (g_debug_server.hasArg("quick") && arg_true(g_debug_server.arg("quick"))) {
          quick_probe = true;
        }
        collectMiottsProbeResult(probe_result, quick_probe, verbose_probe);
      }
    }

    if (g_debug_server.hasArg("speak")) {
      test_voice = urlDecode(g_debug_server.arg("speak"));
      if (g_debug_server.hasArg("quick") && arg_true(g_debug_server.arg("quick"))) {
        quick_speak = true;
      }
    }

    if (test_voice.length() > 0) {
      const bool ok = playMiottsSpeechByText(test_voice.c_str(), kVoiceDefault, quick_speak);
      const String escaped_text = escapeJsonText(test_voice.c_str());
      const String test_payload = String("{\"ok\":") + (ok ? "true" : "false") + ",\"text\":\"" + escaped_text + "\"}";
      send_text("application/json; charset=utf-8", test_payload);
      return;
    }

    if (probe_result.length() == 0) {
      probe_result = "not run";
    }
    const String payload = String("{\"host\":\"") + (g_miotts_host_override[0] ? g_miotts_host_override : "") +
                           "\",\"portOverride\":" + String(g_miotts_port_override) +
                           ",\"state\":\"" + (g_miotts_host_override[0] ? "override" : "auto") +
                           "\",\"probe\":\"" + g_miotts_probe_last + "\",\"probeLastMs\":" +
                           String(g_miotts_probe_last_ms) + ",\"probeNow\":\"" + probe_result +
                           "\",\"candidates\":[\"miotts.local\",\"miotts\",\"audio.local\",\"localhost\"]}";
    send_text("application/json; charset=utf-8", payload);
    return;
  }

  if (path == "/diag") {
    char out[1536];
    size_t out_len = 0;
    const String ip_string = WiFi.localIP().toString();
    const char* ip = ip_string.c_str();
    out_len += static_cast<size_t>(snprintf(out + out_len, sizeof(out) - out_len, "M5 Tamagotchi debug log\nIP: %s\n", ip));
    if (out_len >= sizeof(out)) {
      out_len = sizeof(out) - 1;
      out[out_len] = '\0';
    }
    if (!g_diag_line_count) {
      out_len += static_cast<size_t>(snprintf(out + out_len, sizeof(out) - out_len, "no logs\n"));
    } else {
      const size_t start = (g_diag_line_index + kDiagLineCount - g_diag_line_count) % kDiagLineCount;
      for (size_t i = 0; i < g_diag_line_count; ++i) {
        const size_t idx = (start + i) % kDiagLineCount;
        out_len += static_cast<size_t>(snprintf(out + out_len, sizeof(out) - out_len, "%s\n", g_diag_lines[idx]));
        if (out_len >= sizeof(out)) {
          out[sizeof(out) - 1] = '\0';
          out_len = sizeof(out) - 1;
          break;
        }
      }
    }
    send_text("text/plain; charset=utf-8", String(out));
    return;
  }

  if (path == "/beep") {
    const bool ok = playTestTone(880, 120);
    send_text("text/plain; charset=utf-8", ok ? "beep:ok" : "beep:fail");
    return;
  }
  if (path == "/beep2") {
    bool ok = playStreamingVoiceWithPhrase(kVoiceBeep2, kMiottsPhraseBeep2);
    if (!ok) {
      ok = playAltVoiceSound();
    }
    send_text("text/plain; charset=utf-8", ok ? "beep2:ok" : "beep2:fail");
    return;
  }

  if (path == "/voice") {
    const bool ok = playStreamingVoiceWithPhrase(kVoiceDefault, kCharacters[g_current_character_index].phrase_happy);
    send_text("text/plain; charset=utf-8", ok ? "voice:ok" : "voice:fail");
    return;
  }

  if (path == "/download") {
    if (kAutoDownloadVoiceCount == 0) {
      send_text("text/plain; charset=utf-8", "download:disabled");
      return;
    }
    if (!g_voice_task) {
      startVoiceDownloadTask();
      send_text("text/plain; charset=utf-8", "download:started");
    } else {
      send_text("text/plain; charset=utf-8", "download:running");
    }
    return;
  }

  if (path == "/relay") {
    postDiagnosticsToRelay();
    send_text("text/plain; charset=utf-8", "relay:requested");
    return;
  }

  send_text("text/plain; charset=utf-8", "not found");
}

void initCryWave() {
  if (g_cry_wave_initialized) {
    return;
  }

  for (size_t i = 0; i < kCrySamples; ++i) {
    const float t = static_cast<float>(i) / kCrySampleRate;
    const float base = 780.0f + 90.0f * sinf(2.0f * PI * 2.8f * t);
    const float glide = 120.0f * sinf(2.0f * PI * 0.9f * t);
    const float pitch = base + glide;
    float env = 1.0f;
    if (t < 0.03f) {
      env = t / 0.03f;
    } else if (t > 0.42f) {
      env = 1.0f - ((t - 0.42f) / 0.20f);
      if (env < 0) {
        env = 0;
      }
    }
    const float wave = sinf(2.0f * PI * pitch * t) * 8000.0f;
    const float trem = (sinf(2.0f * PI * 35.0f * t) * 0.18f + 0.82f);
    g_cry_wave[i] = static_cast<int16_t>(wave * env * trem);
  }
  g_cry_wave_initialized = true;
}

bool playCrySound() {
  if (!ensureSpeakerForPlayback("playCrySound")) {
    return false;
  }
  if (!g_cry_wave_initialized) {
    initCryWave();
  }
  M5.Speaker.stop();
  const bool ok = M5.Speaker.playRaw(g_cry_wave, kCrySamples, kCrySampleRate, false, 1, 0, true);
  vTaskDelay(pdMS_TO_TICKS(3));
  if (!ok || M5.Speaker.getPlayingChannels() == 0) {
    logDiag("playRaw failed");
    return false;
  }
  return true;
}

void initAltVoiceWave() {
  if (g_voice_alt_wave_initialized) {
    return;
  }
  for (size_t i = 0; i < kVoiceAltSamples; ++i) {
    const float t = static_cast<float>(i) / kCrySampleRate;
    const float base = 660.0f + 90.0f * sinf(2.0f * PI * 2.4f * t);
    const float formant = 180.0f + 45.0f * sinf(2.0f * PI * 0.8f * t);
    const float pitch = base + 120.0f * sinf(2.0f * PI * 0.4f * t) + formant * sinf(2.0f * PI * 1.8f * t);
    float env = 1.0f;
    if (t < 0.06f) {
      env = t / 0.06f;
    } else if (t > 0.60f) {
      const float tail = (0.7f - t) / 0.30f;
      env = tail < 0 ? 0 : tail;
    }
    const float wave = (sinf(2.0f * PI * pitch * t) + 0.38f * sinf(2.0f * PI * (pitch * 2.0f + 120.0f) * t)) * 9000.0f;
    g_voice_alt_wave[i] = static_cast<int16_t>(wave * env);
  }
  g_voice_alt_wave_initialized = true;
}

bool playAltVoiceSound() {
  if (!ensureSpeakerForPlayback("playAltVoiceSound")) {
    return false;
  }
  if (!g_voice_alt_wave_initialized) {
    initAltVoiceWave();
  }
  M5.Speaker.stop();
  const bool ok = M5.Speaker.playRaw(g_voice_alt_wave, kVoiceAltSamples, kCrySampleRate, false, 1, 0, true);
  vTaskDelay(pdMS_TO_TICKS(3));
  if (!ok || M5.Speaker.getPlayingChannels() == 0) {
    logDiag("playAltVoiceSound failed");
    return false;
  }
  return true;
}

void drawCharacterBody(uint16_t x, uint16_t y, const CharacterStyle& style,
                       bool happy, bool sad, int bounce, uint16_t frame) {
  M5Canvas& gfx = g_frame_canvas;
  const int base_y = y + bounce;

  // Round body
  gfx.fillCircle(x, base_y, 20, style.body);
  // Slightly lighter belly
  gfx.fillCircle(x, base_y + 4, 12, style.head);

  // Eyes
  const bool blink = (frame % kBlinkInterval) >= (kBlinkInterval - kBlinkHoldFrames);
  const int eye_y = base_y - 6;
  if (blink) {
    gfx.drawFastHLine(x - 8, eye_y, 5, style.eye);
    gfx.drawFastHLine(x + 3, eye_y, 5, style.eye);
  } else {
    gfx.fillCircle(x - 6, eye_y, 2, style.eye);
    gfx.fillCircle(x + 6, eye_y, 2, style.eye);
    gfx.fillCircle(x - 5, eye_y - 1, 1, TFT_WHITE);
    gfx.fillCircle(x + 7, eye_y - 1, 1, TFT_WHITE);
  }

  // Mouth
  const int mouth_y = base_y + 4;
  if (happy) {
    // Smile arc
    for (int i = -5; i <= 5; i++) {
      const int yy = mouth_y + (i * i) / 8;
      gfx.drawPixel(x + i, yy, style.eye);
    }
  } else if (sad) {
    // Frown arc
    for (int i = -5; i <= 5; i++) {
      const int yy = mouth_y + 3 - (i * i) / 8;
      gfx.drawPixel(x + i, yy, style.eye);
    }
  } else {
    // Neutral dot
    gfx.fillCircle(x, mouth_y + 1, 1, style.eye);
  }

  // Tiny circle feet
  gfx.fillCircle(x - 8, base_y + 20, 4, style.accent);
  gfx.fillCircle(x + 8, base_y + 20, 4, style.accent);
}

// ── アンパンボーヤ専用描画 ──
void drawAnpanman(uint16_t x, uint16_t y, bool happy, bool sad, int bounce, uint16_t frame) {
  M5Canvas& gfx = g_frame_canvas;
  const int by = y + bounce;

  // --- マント (behind body) ---
  gfx.fillTriangle(x - 22, by + 6, x - 10, by - 8, x - 6, by + 18, 0xF800);  // 左マント
  gfx.fillTriangle(x + 22, by + 6, x + 10, by - 8, x + 6, by + 18, 0xF800);  // 右マント

  // --- 丸い顔 (肌色) ---
  gfx.fillCircle(x, by, 22, 0xFE60);  // パン色の顔
  gfx.drawCircle(x, by, 22, 0xC440);  // 輪郭線

  // --- ほっぺた (大きく赤い) ---
  gfx.fillCircle(x - 14, by + 2, 6, 0xF800);   // 左ほっぺ
  gfx.fillCircle(x + 14, by + 2, 6, 0xF800);   // 右ほっぺ
  gfx.fillCircle(x - 13, by + 1, 2, 0xFB2C);   // ほっぺハイライト
  gfx.fillCircle(x + 13, by + 1, 2, 0xFB2C);

  // --- 鼻 (大きく赤い丸) ---
  gfx.fillCircle(x, by + 2, 7, 0xF800);         // 赤い鼻
  gfx.fillCircle(x - 2, by, 2, 0xFBE0);          // 鼻ハイライト

  // --- 眉毛 (太くてしっかり) ---
  gfx.fillRoundRect(x - 12, by - 14, 8, 3, 1, 0x6200);  // 左眉
  gfx.fillRoundRect(x + 4, by - 14, 8, 3, 1, 0x6200);   // 右眉

  // --- 目 ---
  const bool blink = (frame % kBlinkInterval) >= (kBlinkInterval - kBlinkHoldFrames);
  if (blink) {
    gfx.drawFastHLine(x - 10, by - 8, 6, TFT_BLACK);
    gfx.drawFastHLine(x + 4, by - 8, 6, TFT_BLACK);
  } else {
    // 白目 + 黒目（大きめ）
    gfx.fillCircle(x - 7, by - 8, 4, TFT_WHITE);
    gfx.fillCircle(x + 7, by - 8, 4, TFT_WHITE);
    gfx.fillCircle(x - 6, by - 7, 2, TFT_BLACK);
    gfx.fillCircle(x + 6, by - 7, 2, TFT_BLACK);
    gfx.fillCircle(x - 6, by - 8, 1, TFT_WHITE);  // ハイライト
    gfx.fillCircle(x + 6, by - 8, 1, TFT_WHITE);
  }

  // --- 口 ---
  if (happy) {
    // 大きなニッコリ口
    for (int i = -8; i <= 8; i++) {
      gfx.drawPixel(x + i, by + 12 + (i * i) / 16, TFT_BLACK);
      gfx.drawPixel(x + i, by + 13 + (i * i) / 16, TFT_BLACK);
    }
  } else if (sad) {
    for (int i = -6; i <= 6; i++) {
      gfx.drawPixel(x + i, by + 15 - (i * i) / 12, TFT_BLACK);
    }
  } else {
    gfx.drawFastHLine(x - 4, by + 12, 8, TFT_BLACK);
  }

  // --- 小さい手足 ---
  gfx.fillCircle(x - 10, by + 24, 4, 0xFE60);
  gfx.fillCircle(x + 10, by + 24, 4, 0xFE60);
}

// ── はやぶさ E5系 専用描画（斜め前方からの視点） ──
void drawHayabusa(uint16_t x, uint16_t y, bool happy, bool sad, int bounce, uint16_t frame) {
  M5Canvas& gfx = g_frame_canvas;
  const int by = y + bounce;

  // E5系カラー定義
  const uint16_t kGreen  = 0x0600;   // E5系ダークグリーン
  const uint16_t kGreenL = 0x2EC4;   // 明るめグリーン（ハイライト面）
  const uint16_t kWhite  = 0xFFFF;
  const uint16_t kPink   = 0xF81F;   // E5系ピンクライン
  const uint16_t kGray   = 0x7BEF;
  const uint16_t kDkGray = 0x4208;
  const uint16_t kNavy   = 0x0013;   // 窓の紺色
  const uint16_t kSky    = 0x4A7F;   // 窓の反射

  // === 斜め45度ビュー（右を向いた姿、左手前に車体側面） ===

  // --- 車体側面（左手前、白い面） ---
  // 台形で奥行き感を出す（左が広く、右に向かって狭まる）
  gfx.fillTriangle(x - 20, by - 8,  x - 20, by + 16,  x + 4, by + 10, kWhite);
  gfx.fillTriangle(x - 20, by - 8,  x + 4, by - 14,   x + 4, by + 10, kWhite);
  // 側面の輪郭
  gfx.drawLine(x - 20, by - 8,  x + 4, by - 14, kGray);
  gfx.drawLine(x - 20, by + 16, x + 4, by + 10, kGray);
  gfx.drawLine(x - 20, by - 8,  x - 20, by + 16, kGray);

  // --- 車体上面（屋根、グリーン） ---
  // パースのかかった平行四辺形
  gfx.fillTriangle(x - 20, by - 8,  x + 4, by - 14,  x + 18, by - 18, kGreen);
  gfx.fillTriangle(x - 20, by - 8,  x + 18, by - 18, x - 6, by - 12, kGreen);
  // 手前側を少し明るいグリーンでハイライト
  gfx.fillTriangle(x - 20, by - 8,  x - 6, by - 12,  x - 18, by - 10, kGreenL);

  // --- ノーズ（右奥に伸びる流線型の先端） ---
  // 先端は右上方向に鋭く伸びる
  gfx.fillTriangle(x + 4, by - 14,  x + 4, by + 10,  x + 24, by - 4, kWhite);
  // ノーズ上面（グリーン）
  gfx.fillTriangle(x + 4, by - 14,  x + 18, by - 18, x + 24, by - 4, kGreen);
  // ノーズ先端のキャップ
  gfx.fillTriangle(x + 24, by - 4,  x + 18, by - 18, x + 26, by - 8, kGreenL);
  // ノーズ輪郭
  gfx.drawLine(x + 4, by + 10,  x + 24, by - 4, kGray);
  gfx.drawLine(x + 18, by - 18, x + 26, by - 8, kGray);
  gfx.drawLine(x + 24, by - 4,  x + 26, by - 8, kDkGray);

  // --- ピンクのアクセントライン（E5系の象徴！車体側面を横断） ---
  gfx.drawLine(x - 20, by + 2,  x + 4, by - 3, kPink);
  gfx.drawLine(x - 20, by + 3,  x + 4, by - 2, kPink);
  gfx.drawLine(x + 4, by - 3,   x + 24, by - 4, kPink);
  gfx.drawLine(x + 4, by - 2,   x + 24, by - 3, kPink);

  // --- 側面の窓（3つ並び、パースで右ほど小さく） ---
  gfx.fillRect(x - 17, by - 5, 5, 5, kNavy);
  gfx.fillRect(x - 10, by - 6, 4, 4, kNavy);
  gfx.fillRect(x - 4, by - 7, 3, 4, kNavy);
  // 窓の反射
  gfx.drawPixel(x - 16, by - 4, kSky);
  gfx.drawPixel(x - 9, by - 5, kSky);
  gfx.drawPixel(x - 3, by - 6, kSky);

  // --- フロントウィンドウ（ノーズ上の大きな窓） ---
  gfx.fillTriangle(x + 8, by - 12, x + 6, by - 2, x + 20, by - 8, kNavy);
  // 窓の反射ハイライト
  gfx.drawLine(x + 10, by - 10, x + 16, by - 8, kSky);

  // --- ヘッドライト（ノーズ先端付近） ---
  gfx.fillCircle(x + 22, by - 2, 2, 0xFFE0);  // 黄色ライト
  gfx.fillCircle(x + 22, by - 2, 1, kWhite);   // ライト中心

  // --- かわいい目（フロントウィンドウの中に） ---
  const bool blink = (frame % kBlinkInterval) >= (kBlinkInterval - kBlinkHoldFrames);
  if (blink) {
    gfx.drawFastHLine(x + 9, by - 8, 4, kWhite);
    gfx.drawFastHLine(x + 15, by - 9, 3, kWhite);
  } else {
    // 左目（手前、大きめ）
    gfx.fillCircle(x + 10, by - 8, 3, kWhite);
    gfx.fillCircle(x + 11, by - 7, 1, TFT_BLACK);
    // 右目（奥、パースで小さめ）
    gfx.fillCircle(x + 17, by - 9, 2, kWhite);
    gfx.fillCircle(x + 17, by - 8, 1, TFT_BLACK);
    // ハイライト
    gfx.drawPixel(x + 9, by - 9, kWhite);
    gfx.drawPixel(x + 16, by - 10, kWhite);
  }

  // --- 口（ノーズ下部） ---
  if (happy) {
    for (int i = 0; i < 6; i++) {
      gfx.drawPixel(x + 14 + i, by - 1 + (i > 2 ? (i - 2) : (2 - i)), kDkGray);
    }
  } else if (sad) {
    for (int i = 0; i < 5; i++) {
      gfx.drawPixel(x + 14 + i, by + 1 - (i > 2 ? (i - 2) : (2 - i)), kDkGray);
    }
  } else {
    gfx.drawFastHLine(x + 14, by, 5, kDkGray);
  }

  // --- 車輪（パース付き、手前が大きく奥が小さい） ---
  gfx.fillCircle(x - 14, by + 18, 3, kDkGray);  // 手前の車輪（大）
  gfx.fillCircle(x - 6, by + 16, 3, kDkGray);
  gfx.fillCircle(x + 2, by + 13, 2, kDkGray);   // 奥の車輪（小）
  // 車輪のハブ
  gfx.fillCircle(x - 14, by + 18, 1, kGray);
  gfx.fillCircle(x - 6, by + 16, 1, kGray);
  gfx.fillCircle(x + 2, by + 13, 1, kGray);
}

void drawCharacterVariant(int idx, uint16_t x, uint16_t y, const CharacterStyle& style, bool happy,
                         bool sad, int bounce, uint16_t frame) {
  M5Canvas& gfx = g_frame_canvas;
  const int base_y = y + bounce;

  // アンパンボーヤ・はやぶさは完全専用描画
  if (idx == 0) { drawAnpanman(x, y, happy, sad, bounce, frame); return; }
  if (idx == 1) { drawHayabusa(x, y, happy, sad, bounce, frame); return; }

  // Pre-body decorations (things that go BEHIND the body)
  if (idx == 2) {
    // もこ: Two long rabbit ears on top (behind body)
    gfx.fillRoundRect(x - 10, base_y - 42, 7, 22, 3, style.accent);
    gfx.fillRoundRect(x + 3, base_y - 42, 7, 22, 3, style.accent);
    gfx.fillRoundRect(x - 8, base_y - 38, 3, 14, 2, 0xFDB8);
    gfx.fillRoundRect(x + 5, base_y - 38, 3, 14, 2, 0xFDB8);
  }

  // Draw the main body
  drawCharacterBody(x, y, style, happy, sad, bounce, frame);
}

void drawPoo(int base_x, int base_y, Tick now, const AppState& state) {
  M5Canvas& gfx = g_frame_canvas;
  if (!state.has_poop && !state.cleaning) {
    return;
  }

  int lift = 0;
  if (state.cleaning) {
    const Tick start = state.cleaning_until - pdMS_TO_TICKS(kCleaningTimeMs);
    const Tick elapsed = now - start;
    if (elapsed < pdMS_TO_TICKS(kCleaningTimeMs)) {
      lift = map(elapsed, 0, pdMS_TO_TICKS(kCleaningTimeMs), 0, 36);
    }
  }

  const int y = base_y - lift;
  // Small cute poop: 3 stacked circles (~10-12px tall)
  gfx.fillCircle(base_x, y, 4, kPooBrown);
  gfx.fillCircle(base_x - 1, y - 5, 3, kPooBrown);
  gfx.fillCircle(base_x, y - 9, 2, kPooBrown);
}

void renderStatus(int character_index, Emotion emotion, Tick now, const AppState& state) {
  (void)character_index;
  (void)emotion;
  M5Canvas& gfx = g_frame_canvas;

  // Show IP address for first 10 seconds after boot
  if (state.frame < (10000 / kFramePeriodMs) && WiFi.status() == WL_CONNECTED) {
    gfx.setTextSize(1);
    gfx.setTextColor(TFT_WHITE);
    gfx.setCursor(4, 4);
    gfx.print(WiFi.localIP().toString().c_str());
  } else if (state.frame < (10000 / kFramePeriodMs) && WiFi.status() != WL_CONNECTED) {
    gfx.setTextSize(1);
    gfx.setTextColor(TFT_YELLOW);
    gfx.setCursor(4, 4);
    gfx.print("WiFi...");
  }

  // STT recording indicator
  if (g_stt_recording) {
    gfx.fillCircle(120, 8, 5, TFT_RED);
    gfx.setTextSize(1);
    gfx.setTextColor(TFT_WHITE);
    gfx.setCursor(108, 16);
    gfx.print("REC");
  }
}

void renderBackground() {
  M5Canvas& gfx = g_frame_canvas;
  // === ゴッチ風のお部屋 ===
  // 壁（上2/3）: クリーム色のやさしい壁紙
  const uint16_t kWall = 0xF71C;       // 薄いクリーム
  const uint16_t kWallLine = 0xEF1B;   // 壁紙の模様
  for (int y = 0; y < 85; ++y) {
    gfx.drawFastHLine(0, y, kScreenW, kWall);
  }
  // 壁紙にドット柄（レトロゲーム風）
  for (int dy = 8; dy < 85; dy += 12) {
    for (int dx = 6; dx < kScreenW; dx += 12) {
      gfx.drawPixel(dx, dy, kWallLine);
    }
  }

  // 床（下1/3）: 木目フローリング風
  const uint16_t kFloor = 0xCC60;      // 明るい茶色
  const uint16_t kFloorLine = 0xBB40;  // 床の線
  gfx.fillRect(0, 85, kScreenW, kScreenH - 85, kFloor);
  // 床の境界線
  gfx.drawFastHLine(0, 85, kScreenW, 0xA520);
  gfx.drawFastHLine(0, 86, kScreenW, 0xB560);
  // 木目の横線
  for (int y = 92; y < kScreenH; y += 8) {
    gfx.drawFastHLine(0, y, kScreenW, kFloorLine);
  }

  // 窓（左上）: 小さなまる窓
  gfx.fillRoundRect(8, 8, 24, 24, 4, 0x9E1F);   // 水色の空
  gfx.drawRoundRect(8, 8, 24, 24, 4, 0xA520);   // 窓枠
  gfx.drawFastHLine(8, 20, 24, 0xA520);          // 窓の十字
  gfx.drawFastVLine(20, 8, 24, 0xA520);
  // 窓の中に雲
  gfx.fillCircle(16, 14, 3, TFT_WHITE);
  gfx.fillCircle(20, 13, 2, TFT_WHITE);

  // 時計（右上）: 小さな丸時計
  gfx.fillCircle(112, 18, 9, TFT_WHITE);
  gfx.drawCircle(112, 18, 9, 0xA520);
  gfx.drawLine(112, 18, 112, 12, TFT_BLACK);     // 長針
  gfx.drawLine(112, 18, 116, 18, TFT_BLACK);     // 短針
  gfx.fillCircle(112, 18, 1, TFT_RED);           // 中心
}

void drawFrame(AppState& state) {
  M5Canvas& gfx = g_frame_canvas;
  const Tick now = xTaskGetTickCount();
  const CharacterStyle& style = kCharacters[state.character_index];
  const bool happy = state.emotion == Emotion::Happy;
  const bool sad = state.emotion == Emotion::Sad;

  gfx.fillSprite(TFT_BLACK);
  renderBackground();
  renderStatus(state.character_index, state.emotion, now, state);

  const int bounce = ((state.frame % 14) < 7) ? ((state.frame % 14) - 3) : (16 - (state.frame % 14) - 3);
  // キャラを上方に配置（y=50）、大きく表示
  drawCharacterVariant(state.character_index, 64, 50, style, happy, sad, bounce, state.frame);

  // うんちをランダム位置に表示（位置はlast_poop_tickをシードに固定）
  if (state.has_poop || state.cleaning) {
    const uint32_t seed = state.last_poop_tick;
    const int poo_x = 20 + (seed * 7 + 13) % 88;       // 20〜107の範囲
    const int poo_y = 90 + (seed * 11 + 37) % 28;      // 90〜117の範囲
    drawPoo(poo_x, poo_y, now, state);
  }

  // セリフ表示（画面下部、ひらがな・日本語フォント）
  if (g_display_phrase[0] && millis() < g_display_phrase_until_ms) {
    gfx.setFont(&fonts::efontJA_10);
    gfx.setTextSize(1);
    gfx.setTextColor(TFT_WHITE);
    // テキスト幅を計測
    int tw = gfx.textWidth(g_display_phrase);
    if (tw > 120) tw = 120;
    const int bx = 64 - tw / 2 - 4;
    const int bw = tw + 8;
    gfx.fillRoundRect(bx, 108, bw, 16, 3, 0x2104);  // 暗めの背景
    gfx.drawRoundRect(bx, 108, bw, 16, 3, 0x4A69);  // 枠線
    gfx.setCursor(bx + 4, 110);
    gfx.print(g_display_phrase);
    // デフォルトフォントに戻す
    gfx.setFont(nullptr);
  }

  gfx.pushSprite(0, 0);
}

// ─── STT (Speech-to-Text) functions ───

void startSttRecording() {
  // Dynamically allocate STT buffer (freed after use to avoid TTS memory conflict)
  if (!g_stt_buffer) {
    // Try PSRAM first, then internal
    size_t psram_samples = kSttSampleRate * kSttMaxSecondsPsram;
    g_stt_buffer = (int16_t*)heap_caps_malloc(psram_samples * sizeof(int16_t), MALLOC_CAP_SPIRAM);
    if (g_stt_buffer) {
      g_stt_max_samples = psram_samples;
    } else {
      size_t internal_samples = kSttSampleRate * kSttMaxSecondsInternal;
      g_stt_buffer = (int16_t*)malloc(internal_samples * sizeof(int16_t));
      if (g_stt_buffer) {
        g_stt_max_samples = internal_samples;
      }
    }
  }
  if (!g_stt_buffer || g_stt_max_samples == 0) {
    logDiag("STT: buffer alloc failed");
    return;
  }
  M5.Speaker.end();  // Mic and speaker can't work simultaneously
  M5.Mic.begin();
  g_stt_samples_recorded = 0;
  g_stt_recording = true;
  logDiag("STT: recording started (max %u samples, %u bytes)", (unsigned)g_stt_max_samples, (unsigned)(g_stt_max_samples * 2));
}

void stopSttRecording() {
  g_stt_recording = false;
  M5.Mic.end();
  M5.Speaker.begin();
  logDiag("STT: recording stopped, samples=%u", (unsigned)g_stt_samples_recorded);
}

void sttRecordChunk() {
  if (!g_stt_recording || !g_stt_buffer) return;
  if (g_stt_samples_recorded >= g_stt_max_samples) {
    // Buffer full - auto-stop and send
    stopSttRecording();
    if (g_voice_queue) {
      VoiceRequest req{};
      req.char_idx = g_current_character_index;
      req.request_type = 4;
      xQueueSend(g_voice_queue, &req, 0);
    }
    return;
  }
  const size_t remaining = g_stt_max_samples - g_stt_samples_recorded;
  const size_t chunk = min((size_t)1600, remaining);  // 100ms worth at 16kHz
  if (M5.Mic.record(&g_stt_buffer[g_stt_samples_recorded], chunk, kSttSampleRate)) {
    g_stt_samples_recorded += chunk;
  }
}

void writeWavHeader(uint8_t* header, uint32_t data_size, uint16_t sample_rate) {
  uint32_t file_size = data_size + 36;
  memcpy(header, "RIFF", 4);
  memcpy(header + 4, &file_size, 4);
  memcpy(header + 8, "WAVE", 4);
  memcpy(header + 12, "fmt ", 4);
  uint32_t fmt_size = 16;
  memcpy(header + 16, &fmt_size, 4);
  uint16_t audio_format = 1;  // PCM
  memcpy(header + 20, &audio_format, 2);
  uint16_t num_channels = 1;  // Mono
  memcpy(header + 22, &num_channels, 2);
  uint32_t sr32 = sample_rate;
  memcpy(header + 24, &sr32, 4);
  uint32_t byte_rate = sr32 * 2;  // 16-bit mono
  memcpy(header + 28, &byte_rate, 4);
  uint16_t block_align = 2;
  memcpy(header + 32, &block_align, 2);
  uint16_t bits = 16;
  memcpy(header + 34, &bits, 2);
  memcpy(header + 36, "data", 4);
  memcpy(header + 40, &data_size, 4);
}

bool sendSttRequest() {
  if (g_stt_samples_recorded < 1600) {  // At least 100ms
    logDiag("STT: too short, skipping");
    return false;
  }

  // Build URL – use /v1/stt-raw endpoint (accepts raw WAV body, no multipart)
  char url[128];
  const char* host = g_miotts_last_host[0] ? g_miotts_last_host : "192.168.11.12";
  snprintf(url, sizeof(url), "http://%s:%u/v1/stt-raw", host, (unsigned)kSttPort);

  uint32_t data_size = g_stt_samples_recorded * 2;  // 16-bit = 2 bytes per sample

  // Write WAV header directly into the start of stt_buffer memory
  // We reserved space by shifting recording start by 22 samples (44 bytes)
  // Actually, we can send WAV header + PCM data using WiFiClient streaming
  uint8_t wav_header[44];
  writeWavHeader(wav_header, data_size, kSttSampleRate);

  WiFiClient client;
  client.setTimeout(15);
  HTTPClient http;
  http.begin(client, url);
  http.setTimeout(15000);
  http.addHeader("Content-Type", "audio/wav");

  size_t total_size = 44 + data_size;
  logDiag("STT: POST %s (%u bytes)", url, (unsigned)total_size);

  // Use chunked streaming: send header + data without extra buffer
  http.addHeader("Content-Length", String(total_size));

  // Get raw WiFi client to write header + data separately
  if (!client.connect(host, kSttPort)) {
    logDiag("STT: connect failed");
    http.end();
    return false;
  }

  // Send HTTP request manually to avoid extra buffer
  client.printf("POST /v1/stt-raw HTTP/1.1\r\n");
  client.printf("Host: %s:%u\r\n", host, (unsigned)kSttPort);
  client.printf("Content-Type: audio/wav\r\n");
  client.printf("Content-Length: %u\r\n", (unsigned)total_size);
  client.printf("X-Character: %s\r\n", kCharacters[g_current_character_index].name);
  client.printf("Connection: close\r\n\r\n");
  client.write(wav_header, 44);
  // Send PCM data in chunks to avoid timeout
  const uint8_t* pcm = (const uint8_t*)g_stt_buffer;
  size_t sent = 0;
  while (sent < data_size) {
    size_t chunk = min((size_t)4096, data_size - sent);
    size_t w = client.write(pcm + sent, chunk);
    if (w == 0) { logDiag("STT: write stall at %u", (unsigned)sent); break; }
    sent += w;
  }
  logDiag("STT: sent %u/%u bytes", (unsigned)(44 + sent), (unsigned)total_size);

  // Read response
  unsigned long deadline = millis() + 15000;
  while (client.connected() && !client.available() && millis() < deadline) {
    delay(10);
  }

  // Skip HTTP headers
  int code = 0;
  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line.startsWith("HTTP/")) {
      int sp1 = line.indexOf(' ');
      if (sp1 > 0) code = line.substring(sp1 + 1).toInt();
    }
    if (line == "\r" || line.length() == 0) break;
  }

  if (code == 200) {
    // Read response body from client
    String response;
    while (client.available()) {
      response += (char)client.read();
    }
    client.stop();
    // Parse simple JSON: {"text": "..."}
    int text_start = response.indexOf("\"text\"");
    if (text_start >= 0) {
      int colon = response.indexOf(":", text_start);
      int quote1 = response.indexOf("\"", colon + 1);
      int quote2 = response.indexOf("\"", quote1 + 1);
      if (quote1 >= 0 && quote2 > quote1) {
        String text = response.substring(quote1 + 1, quote2);
        strncpy(g_stt_result, text.c_str(), sizeof(g_stt_result) - 1);
        g_stt_result[sizeof(g_stt_result) - 1] = '\0';
        g_stt_has_result = true;
        logDiag("STT result: %s", g_stt_result);
        return true;
      }
    }
  }
  logDiag("STT: HTTP %d", code);
  client.stop();
  return false;
}

// ─── End STT functions ───

void voiceTask(void*) {
  for (;;) {
    VoiceRequest req{};
    if (xQueueReceive(g_voice_queue, &req, portMAX_DELAY) == pdPASS) {
      if (!g_speaker_ready) continue;
      setSpeakerVolume();

      const char* phrase = nullptr;
      bool is_clean = false;
      bool is_happy = false;

      const size_t ci = req.char_idx < (sizeof(kCharacters) / sizeof(kCharacters[0])) ? req.char_idx : 0;
      const size_t vi = random(kPhraseVariants);  // ランダムバリエーション
      switch (req.request_type) {
        case 0: phrase = kPhrasesHappy[ci][vi]; is_happy = true; break;
        case 1: phrase = kPhrasesSad[ci][vi]; break;
        case 2: phrase = kPhrasesClean[ci][vi]; is_clean = true; break;
        case 3: phrase = kPhrasesBoot[ci][vi]; is_happy = true; break;
        case 4: {
          // STT: send recording to server, then TTS the response
          logDiag("STT: processing...");
          bool stt_ok = sendSttRequest() && g_stt_has_result && g_stt_result[0];
          // Free STT buffer BEFORE TTS to reclaim memory for WAV decode
          if (g_stt_buffer) { free(g_stt_buffer); g_stt_buffer = nullptr; }
          g_stt_samples_recorded = 0;
          g_stt_max_samples = 0;
          if (stt_ok) {
            logDiag("STT: speaking result: %s", g_stt_result);
            strncpy(g_display_phrase, g_stt_result, sizeof(g_display_phrase) - 1);
            g_display_phrase[sizeof(g_display_phrase) - 1] = '\0';
            g_display_phrase_until_ms = millis() + 4000;
            setSpeakerVolume();
            playStreamingVoiceWithPhrase(kVoiceDefault, g_stt_result, true, 1.25f);  // quick_mode + 1.25x speed
            g_stt_has_result = false;
          } else {
            logDiag("STT: no result");
            playTestTone(440, 100);  // Error beep
          }
          continue;  // Skip normal phrase playback
        }
        default: continue;
      }

      // セリフを画面に表示（3秒間）
      if (phrase) {
        strncpy(g_display_phrase, phrase, sizeof(g_display_phrase) - 1);
        g_display_phrase[sizeof(g_display_phrase) - 1] = '\0';
        g_display_phrase_until_ms = millis() + 3000;
      }
      const bool ok = playStreamingVoiceWithPhrase(kVoiceDefault, phrase, true, 1.25f);  // quick_mode + 1.25x speed
      if (!ok) {
        if (is_clean) {
          const uint16_t tones[] = {880, 1040, 1240};
          const uint16_t durs[] = {80, 90, 90};
          for (size_t i = 0; i < 3; ++i) {
            playTestTone(tones[i], durs[i]);
            delay(durs[i]);
          }
        } else if (is_happy) {
          if (!playAltVoiceSound()) {
            if (!playCrySound()) {
              playTestTone(900, 110);
            }
          }
        } else {
          if (!playCrySound()) {
            playTestTone(900, 110);
          }
        }
      }
    }
  }
}

void playEventSound(bool clean, bool happy, uint8_t char_idx) {
  if (!g_speaker_ready || !g_voice_queue) return;
  VoiceRequest req{};
  req.char_idx = char_idx;
  if (clean) {
    req.request_type = 2;
  } else if (happy) {
    req.request_type = 0;
  } else {
    req.request_type = 1;
  }
  xQueueSend(g_voice_queue, &req, 0);
}

void playCharacterIntro(uint8_t char_idx) {
  if (!g_speaker_ready || !g_voice_queue) return;
  VoiceRequest req{};
  req.char_idx = char_idx;
  req.request_type = 3;  // boot/intro
  xQueueSend(g_voice_queue, &req, 0);
}

void handleEvent(const ButtonEvent& e, AppState& state) {
  const Tick now = xTaskGetTickCount();

  if (e.type == EventType::kDoubleTap) {
    // Character switch (was volume adjust)
    state.character_index = (state.character_index + 1) % (sizeof(kCharacters) / sizeof(kCharacters[0]));
    state.emotion = Neutral;
    state.emotion_until = now;
    state.cleaning = false;
    g_current_character_index = state.character_index;
    playCharacterIntro(state.character_index);
    return;
  }

  if (e.type == EventType::kHold) {
    // Start push-to-talk recording
    startSttRecording();
    state.emotion = Happy;  // Show happy face while recording
    state.emotion_until = 0;  // Keep until release
    return;
  }

  if (e.type == EventType::kHoldRelease) {
    // Stop recording and send to STT
    if (g_stt_recording) {
      stopSttRecording();
      state.emotion = Neutral;
      state.emotion_until = 0;
      // Enqueue STT processing in voice task
      if (g_voice_queue) {
        VoiceRequest req{};
        req.char_idx = g_current_character_index;
        req.request_type = 4;  // STT process + TTS response
        xQueueSend(g_voice_queue, &req, 0);
      }
    }
    return;
  }

  if (state.has_poop) {
    state.has_poop = false;
    state.cleaning = true;
    state.cleaning_until = now + pdMS_TO_TICKS(kCleaningTimeMs);
    state.emotion = Happy;
    state.emotion_until = now + pdMS_TO_TICKS(kCleaningTimeMs);
    state.last_poop_tick = now;
    playEventSound(true, true, state.character_index);
    return;
  }

  state.emotion = (state.emotion == Happy) ? Sad : Happy;
  state.emotion_until = now + pdMS_TO_TICKS(kEmotionTimeMs);
  playEventSound(false, state.emotion == Happy, state.character_index);
}

void inputTask(void*) {
  M5.BtnA.setHoldThresh(700);
  bool holding = false;
  for (;;) {
    M5.update();
    if (M5.BtnA.wasDoubleClicked()) {
      const ButtonEvent e{EventType::kDoubleTap};
      xQueueSend(g_events, &e, 0);
    }
    if (M5.BtnA.wasSingleClicked()) {
      const ButtonEvent e{EventType::kTap};
      xQueueSend(g_events, &e, 0);
    }
    if (M5.BtnA.wasHold()) {
      if (!holding) {
        holding = true;
        const ButtonEvent e{EventType::kHold};
        xQueueSend(g_events, &e, 0);
      }
    }
    if (holding && M5.BtnA.wasReleased()) {
      holding = false;
      const ButtonEvent e{EventType::kHoldRelease};
      xQueueSend(g_events, &e, 0);
    }
    vTaskDelay(pdMS_TO_TICKS(8));
  }
}

void gameTask(void*) {
  AppState state{};
  state.last_poop_tick = xTaskGetTickCount();
  g_current_character_index = state.character_index;
  randomSeed(esp_random());

  M5.Display.setRotation(0);
  M5.Display.setTextWrap(false);

  Tick last = xTaskGetTickCount();
  for (;;) {
    ButtonEvent e{};
    while (xQueueReceive(g_events, &e, 0) == pdPASS) {
      handleEvent(e, state);
    }

    // Record STT audio chunks while recording
    if (g_stt_recording) {
      sttRecordChunk();
    }

    const Tick now = xTaskGetTickCount();
    if (state.cleaning && now > state.cleaning_until) {
      state.cleaning = false;
    }

    if (state.emotion_until && now > state.emotion_until) {
      state.emotion = Neutral;
      state.emotion_until = 0;
    }

    if (!state.has_poop && !state.cleaning && now - state.last_poop_tick > pdMS_TO_TICKS(kPooIntervalMs)) {
      if (random(100) < 20) {
        state.has_poop = true;
      }
      state.last_poop_tick = now;
    }

    drawFrame(state);
    ++state.frame;
    vTaskDelayUntil(&last, pdMS_TO_TICKS(kFramePeriodMs));
  }
}

} // namespace

void setup() {
  m5::M5Unified::config_t cfg;
  cfg.fallback_board = m5::board_t::board_M5AtomS3R;
  cfg.internal_spk = false;   // AtomS3Rには内蔵スピーカー無し→false
  cfg.internal_mic = false;    // マイクはEcho Base側→false
  cfg.external_speaker.atomic_echo = true;  // 公式ルート: Atomic Echo Base
  Serial.begin(115200);
  M5.begin(cfg);
  delay(50);
  setMiottsHostOverride(kMiottsHostDefaultOverride);
  initSpeakerHardware();
  M5.Display.setBrightness(170);
  g_frame_canvas.setColorDepth(16);
  g_frame_canvas.createSprite(kScreenW, kScreenH);
  psramFound();
  psramInit();
  g_psram_size = ESP.getPsramSize();
  logDiag("PSRAM=%u bytes", (unsigned)g_psram_size);
  // STT buffer allocated on-demand in startSttRecording() to avoid TTS memory conflict
  logDiag("STT: on-demand alloc (no PSRAM, share internal RAM with TTS)");
  logDiag("M5 board=%d speaker_ready=%d", (int)M5.getBoard(), (int)g_speaker_ready);
  dumpSpeakerConfig();

  if (connectToWiFi()) {
    startDebugHttpServer();
    startDebugHttpServerTask();
    startSimpleHttpServer();
    startMdns();
    logDiag("device reachable: http://%s.local:%u/status", kDeviceHostName, (unsigned)kHttpServerPort);
    markBootAnnouncementIfReady();
  } else {
    logDiag("debug server not started (Wi-Fi not ready)");
  }

  g_events = xQueueCreate(8, sizeof(ButtonEvent));
  if (!g_events) {
    while (1) {
      delay(1000);
    }
  }

  g_voice_queue = xQueueCreate(4, sizeof(VoiceRequest));
  if (g_voice_queue) {
    xTaskCreatePinnedToCore(voiceTask, "voiceTask", 12288, nullptr, 1, nullptr, 0);
  }

  xTaskCreatePinnedToCore(inputTask, "inputTask", 3072, nullptr, 2, nullptr, 0);
  xTaskCreatePinnedToCore(gameTask, "gameTask", 4096, nullptr, 1, nullptr, 1);
  startVoiceDownloadTask();
  if (WiFi.isConnected() && g_speaker_ready) {
    markBootAnnouncementIfReady();
  }
}

void loop() {
  if (!g_debug_server_started && (millis() - g_last_wifi_connect_attempt_ms) > 10000) {
    g_last_wifi_connect_attempt_ms = millis();
    if (connectToWiFi()) {
      startDebugHttpServer();
      startDebugHttpServerTask();
      startSimpleHttpServer();
      startMdns();
      logDiag("device reachable: http://%s.local:%u/status", kDeviceHostName, (unsigned)kHttpServerPort);
    }
  }
  if (g_debug_server_started && !WiFi.isConnected()) {
    stopDebugHttpServer();
    stopSimpleHttpServer();
    logDiag("Wi-Fi disconnected; debug server disabled");
  }
  if (WiFi.isConnected()) {
    resetMdnsIfNeeded();
  }
  if (!g_boot_announcement_done && g_boot_announcement_due_ms == 0 && WiFi.isConnected() && g_speaker_ready) {
    markBootAnnouncementIfReady();
  }
  processBootAnnouncement();
  postDiagnosticsToRelay();
  if (Serial.available()) {
    const char c = static_cast<char>(Serial.read());
    if (c == 's' || c == 'S') {
      printVoiceStatus();
    } else if (c == 'd' || c == 'D') {
      logDiag("serial: voice download requested");
      if (!g_voice_task) {
        if (kAutoDownloadVoiceCount == 0) {
          logDiag("serial: download disabled");
        } else {
          startVoiceDownloadTask();
        }
      } else {
        logDiag("serial: voice download already running");
      }
    } else if (c == 'p' || c == 'P') {
      if (g_speaker_ready && playTestTone(880, 80)) {
        logDiag("serial tone ok");
      } else {
        logDiag("serial tone fail");
      }
    }
  }
}
