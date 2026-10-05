import 'package:flutter/material.dart';

class AppConstants {
  // Default Supabase project configuration (matches web/local environment)
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://placeholder.supabase.co',
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'placeholder-anon-key',
  );

  // App Color Scheme (matching NudgeIQ Web Design System)
  static const Color background = Color(0xFFF8F9FA);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color border = Color(0xFFE5E5E5);
  static const Color textPrimary = Color(0xFF111111);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color textMuted = Color(0xFF9CA3AF);
  static const Color primary = Color(0xFF3B82F6);
  static const Color primaryDark = Color(0xFF1D4ED8);
  static const Color darkBlock = Color(0xFF0A0A0A);
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color danger = Color(0xFFEF4444);
}
