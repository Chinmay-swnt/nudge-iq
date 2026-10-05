import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'config/constants.dart';
import 'config/theme.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main_navigation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Supabase with environment or fallback constants
  try {
    await Supabase.initialize(
      url: AppConstants.supabaseUrl,
      anonKey: AppConstants.supabaseAnonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
    );
  } catch (e) {
    debugPrint('[Main] Supabase initialization notice: $e');
  }

  runApp(const NudgeIQMobileApp());
}

class NudgeIQMobileApp extends StatelessWidget {
  const NudgeIQMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NudgeIQ',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    // Check if Supabase client is initialized
    try {
      final client = Supabase.instance.client;
      return StreamBuilder<AuthState>(
        stream: client.auth.onAuthStateChange,
        builder: (context, snapshot) {
          final session = client.auth.currentSession;
          if (session != null) {
            return const MainNavigation();
          } else {
            return const LoginScreen();
          }
        },
      );
    } catch (e) {
      // Fallback if client is uninitialized in test / demo
      return const LoginScreen();
    }
  }
}
