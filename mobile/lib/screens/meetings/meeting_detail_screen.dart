import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/constants.dart';
import '../../services/supabase_service.dart';

class MeetingDetailScreen extends StatefulWidget {
  final String meetingId;

  const MeetingDetailScreen({super.key, required this.meetingId});

  @override
  State<MeetingDetailScreen> createState() => _MeetingDetailScreenState();
}

class _MeetingDetailScreenState extends State<MeetingDetailScreen> {
  final _supabaseService = SupabaseService();
  Map<String, dynamic>? _meetingData;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMeeting();
  }

  Future<void> _loadMeeting() async {
    setState(() => _isLoading = true);
    final data = await _supabaseService.fetchMeetingDetail(widget.meetingId);
    if (mounted) {
      setState(() {
        _meetingData = data;
        _isLoading = false;
      });
    }
  }

  Future<void> _updateTaskStatus(String taskId, String newStatus) async {
    await _supabaseService.updateTaskStatus(taskId, newStatus);
    _loadMeeting();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppConstants.background,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_meetingData == null) {
      return Scaffold(
        backgroundColor: AppConstants.background,
        appBar: AppBar(title: const Text('Meeting Detail')),
        body: const Center(child: Text('Meeting not found')),
      );
    }

    final title = _meetingData!['title'] as String? ?? 'Meeting';
    final meetingDate = DateTime.tryParse(_meetingData!['meeting_date'] as String? ?? '') ?? DateTime.now();
    final status = _meetingData!['status'] as String? ?? 'pending';
    final isProcessed = status == 'processed';
    final team = _meetingData!['teams'] as Map<String, dynamic>? ?? {};
    final teamName = team['name'] as String? ?? 'Team Workspace';
    final transcripts = _meetingData!['transcripts'] as List<dynamic>? ?? [];
    final actionItems = _meetingData!['action_items'] as List<dynamic>? ?? [];

    String? summaryText;
    if (transcripts.isNotEmpty && transcripts.first is Map<String, dynamic>) {
      summaryText = transcripts.first['raw_text'] as String?;
    }

    return Scaffold(
      backgroundColor: AppConstants.background,
      appBar: AppBar(
        title: Text(title, style: const TextStyle(fontSize: 17)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header Card
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
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppConstants.background,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: AppConstants.border),
                        ),
                        child: Text(
                          teamName,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: AppConstants.textSecondary,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isProcessed
                              ? AppConstants.success.withValues(alpha: 0.1)
                              : AppConstants.warning.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          isProcessed ? 'AI Processed' : 'Pending Processing',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isProcessed ? AppConstants.success : AppConstants.warning,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      color: AppConstants.textPrimary,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.event, size: 15, color: AppConstants.textMuted),
                      const SizedBox(width: 6),
                      Text(
                        DateFormat('EEEE, MMMM d, y • h:mm a').format(meetingDate),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppConstants.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Summary Section
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
                  const Row(
                    children: [
                      Icon(Icons.auto_awesome, size: 18, color: AppConstants.primary),
                      SizedBox(width: 8),
                      Text(
                        'Discussion Summary',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (summaryText != null && summaryText.isNotEmpty) ...[
                    Text(
                      summaryText,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppConstants.textPrimary,
                        height: 1.5,
                      ),
                    ),
                  ] else ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppConstants.background,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppConstants.border),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.hourglass_empty, size: 18, color: AppConstants.textMuted),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Summary pending — recording is awaiting AI transcription.',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppConstants.textSecondary,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Extracted Action Items
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
                        'Action Items',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppConstants.textPrimary,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppConstants.darkBlock,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          actionItems.length.toString(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  if (actionItems.isEmpty) ...[
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Text(
                          'No action items extracted for this meeting yet.',
                          style: TextStyle(fontSize: 12, color: AppConstants.textMuted),
                        ),
                      ),
                    ),
                  ] else ...[
                    ListView.separated(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: actionItems.length,
                      separatorBuilder: (ctx, idx) => const Divider(color: AppConstants.border, height: 20),
                      itemBuilder: (ctx, idx) {
                        final item = actionItems[idx] as Map<String, dynamic>;
                        final desc = item['task_description'] as String? ?? 'Untitled Task';
                        final user = item['users'] as Map<String, dynamic>? ?? {};
                        final ownerName = user['name'] as String? ?? user['email'] as String? ?? 'Unassigned';
                        final deadlineStr = item['deadline'] as String?;
                        final tasksList = item['tasks'] as List<dynamic>? ?? [];
                        
                        String taskStatus = 'todo';
                        String? taskId;
                        if (tasksList.isNotEmpty && tasksList.first is Map<String, dynamic>) {
                          taskStatus = tasksList.first['status'] as String? ?? 'todo';
                          taskId = tasksList.first['id'] as String?;
                        }

                        final isDone = taskStatus == 'done';

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(
                                  isDone ? Icons.check_circle : Icons.radio_button_unchecked,
                                  size: 18,
                                  color: isDone ? AppConstants.success : AppConstants.textMuted,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    desc,
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: isDone ? AppConstants.textMuted : AppConstants.textPrimary,
                                      decoration: isDone ? TextDecoration.lineThrough : null,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Padding(
                              padding: const EdgeInsets.only(left: 26.0),
                              child: Row(
                                children: [
                                  Text(
                                    '👤 $ownerName',
                                    style: const TextStyle(fontSize: 11, color: AppConstants.textSecondary),
                                  ),
                                  if (deadlineStr != null) ...[
                                    const SizedBox(width: 12),
                                    Text(
                                      '📅 $deadlineStr',
                                      style: const TextStyle(fontSize: 11, color: AppConstants.textSecondary),
                                    ),
                                  ],
                                  const Spacer(),
                                  if (taskId != null)
                                    PopupMenuButton<String>(
                                      initialValue: taskStatus,
                                      onSelected: (val) => _updateTaskStatus(taskId!, val),
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: AppConstants.background,
                                          borderRadius: BorderRadius.circular(6),
                                          border: Border.all(color: AppConstants.border),
                                        ),
                                        child: Text(
                                          taskStatus.replaceAll('_', ' ').toUpperCase(),
                                          style: const TextStyle(
                                            fontSize: 9,
                                            fontWeight: FontWeight.bold,
                                            color: AppConstants.primary,
                                          ),
                                        ),
                                      ),
                                      itemBuilder: (ctx) => [
                                        const PopupMenuItem(value: 'todo', child: Text('To Do')),
                                        const PopupMenuItem(value: 'in_progress', child: Text('In Progress')),
                                        const PopupMenuItem(value: 'done', child: Text('Done')),
                                        const PopupMenuItem(value: 'overdue', child: Text('Overdue')),
                                      ],
                                    ),
                                ],
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
          ],
        ),
      ),
    );
  }
}
