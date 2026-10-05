import 'package:flutter/material.dart';
import '../../config/constants.dart';
import '../../models/team.dart';
import '../../services/supabase_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _supabaseService = SupabaseService();
  List<Team> _teams = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    setState(() => _isLoading = true);
    final teams = await _supabaseService.fetchUserTeams();
    if (mounted) {
      setState(() {
        _teams = teams;
        _isLoading = false;
      });
    }
  }

  Future<void> _handleLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppConstants.surface,
        title: const Text('Sign Out', style: TextStyle(fontWeight: FontWeight.bold)),
        content: const Text('Are you sure you want to sign out of NudgeIQ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel', style: TextStyle(color: AppConstants.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppConstants.danger),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _supabaseService.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = _supabaseService.currentUser;
    final email = user?.email ?? 'user@nudgeiq.com';
    final name = (user?.userMetadata?['full_name'] as String?) ??
        (user?.userMetadata?['name'] as String?) ??
        email.split('@').first;

    return Scaffold(
      backgroundColor: AppConstants.background,
      appBar: AppBar(
        title: const Text('Profile & Settings'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppConstants.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppConstants.border),
              ),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppConstants.darkBlock,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Center(
                      child: Text(
                        name.isNotEmpty ? name[0].toUpperCase() : 'U',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: AppConstants.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          email,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppConstants.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Workspaces Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppConstants.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppConstants.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Your Team Workspaces',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                      Text(
                        '${_teams.length} total',
                        style: const TextStyle(fontSize: 12, color: AppConstants.textMuted),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  if (_isLoading) ...[
                    const Center(child: CircularProgressIndicator()),
                  ] else if (_teams.isEmpty) ...[
                    const Text(
                      'You are not a member of any workspace yet.',
                      style: TextStyle(fontSize: 13, color: AppConstants.textSecondary),
                    ),
                  ] else ...[
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _teams.length,
                      separatorBuilder: (ctx, idx) => const Divider(color: AppConstants.border, height: 16),
                      itemBuilder: (ctx, idx) {
                        final team = _teams[idx];
                        final isOwner = team.role == 'owner';

                        return Row(
                          children: [
                            const Icon(Icons.corporate_fare, size: 18, color: AppConstants.primary),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                team.name,
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: AppConstants.textPrimary,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: isOwner
                                    ? AppConstants.primary.withValues(alpha: 0.1)
                                    : AppConstants.background,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: isOwner
                                      ? AppConstants.primary.withValues(alpha: 0.2)
                                      : AppConstants.border,
                                ),
                              ),
                              child: Text(
                                isOwner ? 'Owner' : 'Member',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: isOwner ? AppConstants.primary : AppConstants.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Logout Button
            OutlinedButton.icon(
              onPressed: _handleLogout,
              icon: const Icon(Icons.logout, size: 18, color: AppConstants.danger),
              label: const Text(
                'Sign Out',
                style: TextStyle(
                  color: AppConstants.danger,
                  fontWeight: FontWeight.bold,
                ),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: AppConstants.danger),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 24),

            const Text(
              'NudgeIQ Mobile v1.0.0\nCompanion App for Teams & Educators',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                color: AppConstants.textMuted,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
