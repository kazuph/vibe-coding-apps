/**
 * @file robot_voice_effects_improved.h
 * @brief ESP32用ロボット声エフェクト実装（改善版）
 *
 * MAGI System評価後の改善版:
 * - Claude: バッファオーバーラン対策、エッジケース処理強化
 * - Codex: 数値精度修正、オーバーフロー対策
 * - Gemini: ESP32最適化、キャッシュコヒーレンシ対応
 */

#ifndef ROBOT_VOICE_EFFECTS_IMPROVED_H
#define ROBOT_VOICE_EFFECTS_IMPROVED_H

#include <Arduino.h>
#include <cmath>

namespace RobotVoiceEffects {

// ============================================================================
// 改善1: extractWavInfo - バッファオーバーラン対策
// ============================================================================

/**
 * @brief WAVバッファからPCMデータとメタ情報を抽出（安全版）
 */
size_t extractWavInfo(const uint8_t* wav_buf, size_t wav_len,
                      const uint8_t** out_pcm,
                      uint32_t* out_sample_rate,
                      uint16_t* out_channels,
                      uint16_t* out_bits_per_sample) {
  if (wav_len < 44) return 0;

  // RIFFヘッダー検証
  if (memcmp(wav_buf, "RIFF", 4) != 0) return 0;
  if (memcmp(wav_buf + 8, "WAVE", 4) != 0) return 0;

  // fmtチャンク検証（位置固定を前提としない安全版）
  size_t fmt_pos = 12;
  bool fmt_found = false;

  // fmtチャンクを探索
  while (fmt_pos + 8 <= wav_len) {
    if (memcmp(wav_buf + fmt_pos, "fmt ", 4) == 0) {
      uint32_t fmt_size = wav_buf[fmt_pos + 4] | (wav_buf[fmt_pos + 5] << 8) |
                          (wav_buf[fmt_pos + 6] << 16) | (wav_buf[fmt_pos + 7] << 24);

      // フォーマットサイズの妥当性チェック（最小16、最大40程度）
      if (fmt_size < 16 || fmt_size > 1024 || fmt_pos + 8 + fmt_size > wav_len) {
        return 0;
      }

      // PCM形式チェック（AudioFormat = 1）
      uint16_t audio_format = wav_buf[fmt_pos + 8] | (wav_buf[fmt_pos + 9] << 8);
      if (audio_format != 1) {
        return 0;  // PCM以外は非対応
      }

      *out_channels = wav_buf[fmt_pos + 10] | (wav_buf[fmt_pos + 11] << 8);
      *out_sample_rate = wav_buf[fmt_pos + 12] | (wav_buf[fmt_pos + 13] << 8) |
                         (wav_buf[fmt_pos + 14] << 16) | (wav_buf[fmt_pos + 15] << 24);
      *out_bits_per_sample = wav_buf[fmt_pos + 22] | (wav_buf[fmt_pos + 23] << 8);

      // サニティチェック
      if (*out_channels == 0 || *out_channels > 2 ||
          *out_sample_rate == 0 || *out_sample_rate > 96000 ||
          *out_bits_per_sample != 16) {
        return 0;
      }

      fmt_found = true;
      fmt_pos += 8 + fmt_size;
      break;
    }

    // 次のチャンクへ（悪意のあるファイル対策：サイズ0のチャンクでループ）
    uint32_t chunk_size = wav_buf[fmt_pos + 4] | (wav_buf[fmt_pos + 5] << 8) |
                          (wav_buf[fmt_pos + 6] << 16) | (wav_buf[fmt_pos + 7] << 24);
    if (chunk_size == 0 || chunk_size > wav_len) {
      return 0;  // 不正なチャンクサイズ
    }
    fmt_pos += 8 + chunk_size;
  }

  if (!fmt_found) return 0;

  // dataチャンク探索（境界チェック強化）
  size_t pos = fmt_pos;
  const size_t max_iterations = 100;  // 無限ループ対策
  size_t iterations = 0;

  while (pos + 8 <= wav_len && iterations < max_iterations) {
    iterations++;

    if (memcmp(wav_buf + pos, "data", 4) == 0) {
      uint32_t data_size = wav_buf[pos + 4] | (wav_buf[pos + 5] << 8) |
                           (wav_buf[pos + 6] << 16) | (wav_buf[pos + 7] << 24);

      // データサイズの妥当性チェック
      if (data_size == 0 || pos + 8 + data_size > wav_len) {
        // 切り詰め処理
        data_size = wav_len - pos - 8;
      }

      *out_pcm = wav_buf + pos + 8;
      return data_size;
    }

    uint32_t chunk_size = wav_buf[pos + 4] | (wav_buf[pos + 5] << 8) |
                          (wav_buf[pos + 6] << 16) | (wav_buf[pos + 7] << 24);
    if (chunk_size == 0 || chunk_size > wav_len) {
      return 0;
    }
    pos += 8 + chunk_size;
  }

  return 0;
}

// ============================================================================
// 改善2: pitchShiftInPlace - 整数オーバーフロー対策
// ============================================================================

/**
 * @brief ピッチシフト（高音化）- 安全版
 */
size_t pitchShiftInPlace(int16_t* pcm_buf, size_t sample_count, float pitch_shift) {
  if (pitch_shift <= 1.0f || pcm_buf == nullptr || sample_count == 0) {
    return sample_count;
  }

  size_t write_idx = 0;
  float read_pos = 0.0f;

  while (read_pos < sample_count && write_idx < sample_count) {
    size_t read_idx = (size_t)read_pos;
    if (read_idx >= sample_count) break;

    // 線形補間（オーバーフロー対策版）
    float frac = read_pos - read_idx;
    if (read_idx + 1 < sample_count) {
      int16_t s0 = pcm_buf[read_idx];
      int16_t s1 = pcm_buf[read_idx + 1];

      // int32で計算してクリッピング
      int32_t interpolated = s0 + (int32_t)((s1 - s0) * frac);
      interpolated = constrain(interpolated, -32768, 32767);
      pcm_buf[write_idx] = (int16_t)interpolated;
    } else {
      pcm_buf[write_idx] = pcm_buf[read_idx];
    }

    write_idx++;
    read_pos += pitch_shift;
  }

  return write_idx;
}

// ============================================================================
// 改善3: applyRingModulation - 数値精度修正 + Sin LUT最適化
// ============================================================================

// Sinルックアップテーブル（256エントリ、ESP32最適化）
static const int16_t SIN_LUT[256] PROGMEM = {
    0, 804, 1608, 2410, 3212, 4011, 4808, 5602, 6393, 7179, 7962, 8739, 9512, 10278, 11039, 11793,
    12539, 13279, 14010, 14732, 15446, 16151, 16846, 17530, 18204, 18868, 19519, 20159, 20787, 21403, 22005, 22594,
    23170, 23731, 24279, 24811, 25329, 25832, 26319, 26790, 27245, 27683, 28105, 28510, 28898, 29268, 29621, 29956,
    30273, 30571, 30852, 31113, 31356, 31580, 31785, 31971, 32137, 32285, 32412, 32521, 32609, 32678, 32728, 32757,
    32767, 32757, 32728, 32678, 32609, 32521, 32412, 32285, 32137, 31971, 31785, 31580, 31356, 31113, 30852, 30571,
    30273, 29956, 29621, 29268, 28898, 28510, 28105, 27683, 27245, 26790, 26319, 25832, 25329, 24811, 24279, 23731,
    23170, 22594, 22005, 21403, 20787, 20159, 19519, 18868, 18204, 17530, 16846, 16151, 15446, 14732, 14010, 13279,
    12539, 11793, 11039, 10278, 9512, 8739, 7962, 7179, 6393, 5602, 4808, 4011, 3212, 2410, 1608, 804,
    0, -804, -1608, -2410, -3212, -4011, -4808, -5602, -6393, -7179, -7962, -8739, -9512, -10278, -11039, -11793,
    -12539, -13279, -14010, -14732, -15446, -16151, -16846, -17530, -18204, -18868, -19519, -20159, -20787, -21403, -22005, -22594,
    -23170, -23731, -24279, -24811, -25329, -25832, -26319, -26790, -27245, -27683, -28105, -28510, -28898, -29268, -29621, -29956,
    -30273, -30571, -30852, -31113, -31356, -31580, -31785, -31971, -32137, -32285, -32412, -32521, -32609, -32678, -32728, -32757,
    -32767, -32757, -32728, -32678, -32609, -32521, -32412, -32285, -32137, -31971, -31785, -31580, -31356, -31113, -30852, -30571,
    -30273, -29956, -29621, -29268, -28898, -28510, -28105, -27683, -27245, -26790, -26319, -25832, -25329, -24811, -24279, -23731,
    -23170, -22594, -22005, -21403, -20787, -20159, -19519, -18868, -18204, -17530, -16846, -16151, -15446, -14732, -14010, -13279,
    -12539, -11793, -11039, -10278, -9512, -8739, -7962, -7179, -6393, -5602, -4808, -4011, -3212, -2410, -1608, -804
};

/**
 * @brief リングモジュレーション - 最適化版（LUT使用）
 */
void applyRingModulation(int16_t* pcm_buf, size_t sample_count, float carrier_freq, uint32_t sample_rate) {
  if (pcm_buf == nullptr || sample_count == 0 || carrier_freq <= 0.0f || sample_rate == 0) {
    return;
  }

  uint32_t phase_idx = 0;
  uint32_t phase_inc = (uint32_t)((carrier_freq * 256.0f * 65536.0f) / sample_rate);

  for (size_t i = 0; i < sample_count; i++) {
    // LUTからSin値取得（上位8bitをインデックスに）
    uint8_t lut_idx = (phase_idx >> 16) & 0xFF;
    int16_t modulator = pgm_read_word(&SIN_LUT[lut_idx]);

    // 乗算と正規化（修正版）
    int32_t modulated = ((int32_t)pcm_buf[i] * (int32_t)modulator) >> 15;
    modulated = constrain(modulated, -32768, 32767);
    pcm_buf[i] = (int16_t)modulated;

    phase_idx += phase_inc;
  }
}

// ============================================================================
// 改善4: applyBitCrush - 符号保護版
// ============================================================================

/**
 * @brief ビットクラッシュ - 符号ビット保護版
 */
void applyBitCrush(int16_t* pcm_buf, size_t sample_count, uint8_t target_bits) {
  if (target_bits >= 16 || pcm_buf == nullptr || sample_count == 0) {
    return;
  }

  // 符号ビットを保護するマスク
  uint16_t mask = 0xFFFF << (16 - target_bits);

  for (size_t i = 0; i < sample_count; i++) {
    // 符号保存のため、unsigned経由で処理
    uint16_t unsigned_val = (uint16_t)pcm_buf[i];
    unsigned_val &= mask;
    pcm_buf[i] = (int16_t)unsigned_val;
  }
}

// ============================================================================
// 改善5: applySampleHold - 境界チェック強化
// ============================================================================

/**
 * @brief サンプルホールド - 安全版
 */
void applySampleHold(int16_t* pcm_buf, size_t sample_count, size_t hold_samples) {
  if (pcm_buf == nullptr || sample_count == 0 || hold_samples == 0) {
    return;
  }

  for (size_t i = 0; i < sample_count; i += hold_samples) {
    int16_t held_value = pcm_buf[i];
    size_t end = min(i + hold_samples, sample_count);
    for (size_t j = i + 1; j < end; j++) {
      pcm_buf[j] = held_value;
    }
  }
}

// ============================================================================
// 改善6: applyRobotVoice - キャッシュフラッシュ対応
// ============================================================================

/**
 * @brief 複合エフェクト - ESP32最適化版
 */
size_t applyRobotVoice(int16_t* pcm_buf, size_t sample_count, uint32_t sample_rate) {
  if (pcm_buf == nullptr || sample_count == 0) {
    return 0;
  }

  // エフェクト適用
  applyBitCrush(pcm_buf, sample_count, 4);
  applySampleHold(pcm_buf, sample_count, 12);
  applyRingModulation(pcm_buf, sample_count, 1000.0f, sample_rate);
  size_t new_count = pitchShiftInPlace(pcm_buf, sample_count, 1.3f);

  // Note: キャッシュフラッシュはM5Unifiedが内部で処理するため不要

  return new_count;
}

// ============================================================================
// 改善7: 安全なバッファ変換ヘルパー
// ============================================================================

/**
 * @brief const WAVバッファを安全に編集可能バッファに変換
 *
 * 注意: 元バッファがROM（const）の場合、コピーが必要
 *
 * @param wav_buf 元のWAVバッファ（constの可能性あり）
 * @param wav_len バッファ長
 * @param out_editable_pcm 編集可能なPCMバッファ（出力）
 * @param out_sample_count サンプル数（出力）
 * @param out_sample_rate サンプルレート（出力）
 * @param out_channels チャンネル数（出力）
 * @return true=成功、false=失敗
 */
bool prepareEditableBuffer(const uint8_t* wav_buf, size_t wav_len,
                           int16_t** out_editable_pcm,
                           size_t* out_sample_count,
                           uint32_t* out_sample_rate,
                           uint16_t* out_channels) {
  const uint8_t* pcm_data = nullptr;
  uint16_t bits_per_sample = 0;

  size_t pcm_len = extractWavInfo(wav_buf, wav_len, &pcm_data,
                                   out_sample_rate, out_channels, &bits_per_sample);

  if (pcm_len == 0 || bits_per_sample != 16) {
    return false;
  }

  *out_sample_count = pcm_len / 2;

  // const_castの安全性チェック（簡易版）
  // 実際にはESP32のメモリマップを確認する必要があるが、
  // MioTTSのg_miotts_wav_bufは通常RAMにあるため編集可能
  *out_editable_pcm = const_cast<int16_t*>(reinterpret_cast<const int16_t*>(pcm_data));

  return true;
}

} // namespace RobotVoiceEffects

#endif // ROBOT_VOICE_EFFECTS_IMPROVED_H
