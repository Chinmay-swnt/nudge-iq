import 'package:flutter/material.dart';
import '../../config/constants.dart';
import '../../services/supabase_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _handleGoogleSignIn() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await SupabaseService().signInWithGoogle();
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage =
              'Google Sign In could not connect. You can explore the app right now using Demo Mode below!';
          _isLoading = false;
        });
      }
    }
  }

  void _handleDemoMode() {
    SupabaseService().enableDemoMode();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Logo Icon
                Center(
                  child: Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: AppConstants.darkBlock,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxKeyShadow.soft,
                      ],
                    ),
                    child: const Center(
                      child: Text(
                        'N',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 34,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),

                // App Title
                const Text(
                  'NudgeIQ',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: AppConstants.textPrimary,
                    letterSpacing: -0.8,
                  ),
                ),
                const SizedBox(height: 6),

                // Subtitle
                const Text(
                  'AI Meeting Action Items & Task Companion',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    color: AppConstants.textSecondary,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 36),

                // Card container
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppConstants.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppConstants.border),
                    boxShadow: [
                      BoxKeyShadow.soft,
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Get Started',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Sign in to access your assigned tasks and team meetings.',
                        style: TextStyle(
                          fontSize: 13,
                          color: AppConstants.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 20),

                      if (_errorMessage != null) ...[
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppConstants.warning.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: AppConstants.warning.withValues(alpha: 0.3),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('💡 ', style: TextStyle(fontSize: 14)),
                              Expanded(
                                child: Text(
                                  _errorMessage!,
                                  style: const TextStyle(
                                    color: Color(0xFF92400E),
                                    fontSize: 12,
                                    height: 1.3,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],

                      // Google Sign In Button
                      OutlinedButton(
                        onPressed: _isLoading ? null : _handleGoogleSignIn,
                        style: OutlinedButton.styleFrom(
                          backgroundColor: Colors.white,
                          side: const BorderSide(color: AppConstants.border),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  // Google G Icon
                                  Image.network(
                                    'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
                                    height: 18,
                                    width: 18,
                                    errorBuilder: (ctx, err, stack) => const Icon(
                                      Icons.account_circle,
                                      size: 18,
                                      color: AppConstants.primary,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  const Text(
                                    'Continue with Google',
                                    style: TextStyle(
                                      color: AppConstants.textPrimary,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                      ),
                      const SizedBox(height: 16),

                      // Divider "OR"
                      Row(
                        children: [
                          const Expanded(child: Divider(color: AppConstants.border)),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12.0),
                            child: Text(
                              'OR',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: AppConstants.textMuted,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const Expanded(child: Divider(color: AppConstants.border)),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Demo Mode / Guest User Button
                      ElevatedButton(
                        onPressed: _handleDemoMode,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppConstants.darkBlock,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              '⚡',
                              style: TextStyle(fontSize: 16),
                            ),
                            SizedBox(width: 8),
                            Text(
                              'Continue as Demo / Guest User',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // Feature Highlights
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _buildFeaturePill('🎯 Assigned Tasks'),
                    _buildFeaturePill('🎙️ AI Meeting Sync'),
                    _buildFeaturePill('👥 Multi-Workspace'),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFeaturePill(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppConstants.border),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppConstants.textSecondary,
        ),
      ),
    );
  }
}

class BoxKeyShadow {
  static final BoxShadow soft = BoxShadow(
    color: Colors.black.withValues(alpha: 0.04),
    blurRadius: 16,
    offset: const Offset(0, 4),
  );
}
