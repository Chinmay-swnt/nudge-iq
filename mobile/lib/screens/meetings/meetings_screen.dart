import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/constants.dart';
import '../../models/meeting.dart';
import '../../models/team.dart';
import '../../services/supabase_service.dart';
import 'meeting_detail_screen.dart';

class MeetingsScreen extends StatefulWidget {
  const MeetingsScreen({super.key});

  @override
  State<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends State<MeetingsScreen> {
  final _supabaseService = SupabaseService();
  List<Team> _teams = [];
  String? _selectedTeamId;
  List<Meeting> _meetings = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final teams = await _supabaseService.fetchUserTeams();
    final meetings = await _supabaseService.fetchMeetings(teamId: _selectedTeamId);

    if (mounted) {
      setState(() {
        _teams = teams;
        _meetings = meetings;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.background,
      appBar: AppBar(
        title: const Text('Meetings'),
        actions: [
          if (_teams.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 16.0),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String?>(
                  value: _selectedTeamId,
                  dropdownColor: AppConstants.surface,
                  borderRadius: BorderRadius.circular(12),
                  icon: const Icon(Icons.keyboard_arrow_down, size: 20, color: AppConstants.textPrimary),
                  hint: const Text('All Teams', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  items: [
                    const DropdownMenuItem<String?>(
                      value: null,
                      child: Text('All Workspaces', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    ),
                    ..._teams.map(
                      (t) => DropdownMenuItem<String?>(
                        value: t.id,
                        child: Text(t.name, style: const TextStyle(fontSize: 13)),
                      ),
                    ),
                  ],
                  onChanged: (val) {
                    setState(() => _selectedTeamId = val);
                    _loadData();
                  },
                ),
              ),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: _meetings.isEmpty
                  ? _buildEmptyState()
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _meetings.length,
                      separatorBuilder: (ctx, idx) => const SizedBox(height: 12),
                      itemBuilder: (ctx, idx) {
                        final meeting = _meetings[idx];
                        return _buildMeetingCard(meeting);
                      },
                    ),
            ),
    );
  }

  Widget _buildMeetingCard(Meeting meeting) {
    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (ctx) => MeetingDetailScreen(meetingId: meeting.id),
          ),
        ).then((_) => _loadData());
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppConstants.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppConstants.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.02),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (meeting.teamName != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppConstants.background,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppConstants.border),
                    ),
                    child: Text(
                      meeting.teamName!,
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppConstants.textSecondary),
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: meeting.isProcessed
                        ? AppConstants.success.withValues(alpha: 0.1)
                        : AppConstants.warning.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    meeting.isProcessed ? 'AI Processed' : 'Pending',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: meeting.isProcessed ? AppConstants.success : AppConstants.warning,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            Text(
              meeting.title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppConstants.textPrimary,
              ),
            ),
            const SizedBox(height: 8),

            Row(
              children: [
                const Icon(Icons.event, size: 14, color: AppConstants.textMuted),
                const SizedBox(width: 4),
                Text(
                  DateFormat('EEE, MMM d, y • h:mm a').format(meeting.meetingDate),
                  style: const TextStyle(fontSize: 11, color: AppConstants.textSecondary),
                ),
                const Spacer(),
                const Icon(Icons.chevron_right, size: 18, color: AppConstants.textMuted),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return const Center(
      child: SingleChildScrollView(
        padding: EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.mic_none, size: 48, color: AppConstants.textMuted),
            SizedBox(height: 16),
            Text(
              'No meetings found',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppConstants.textPrimary),
            ),
            SizedBox(height: 6),
            Text(
              'Meetings recorded on the web or via the NudgeIQ bot will appear here.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppConstants.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
