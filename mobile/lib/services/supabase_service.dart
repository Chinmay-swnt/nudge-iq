import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/team.dart';
import '../models/task_item.dart';
import '../models/meeting.dart';

class SupabaseService {
  static final SupabaseService _instance = SupabaseService._internal();
  factory SupabaseService() => _instance;
  SupabaseService._internal();

  SupabaseClient get client => Supabase.instance.client;
  User? get currentUser => client.auth.currentUser;
  String? get currentUserId => client.auth.currentUser?.id;

  // ==========================================
  // Auth Operations
  // ==========================================

  Future<void> signInWithGoogle() async {
    await client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: kIsWeb ? null : 'io.supabase.nudgeiq://login-callback',
    );
  }

  Future<void> signOut() async {
    await client.auth.signOut();
  }

  // ==========================================
  // Teams
  // ==========================================

  Future<List<Team>> fetchUserTeams() async {
    if (currentUserId == null) return [];

    try {
      final response = await client
          .from('team_members')
          .select('role, teams(id, name, created_at)')
          .eq('user_id', currentUserId!);

      final List<Team> teams = [];
      for (final item in (response as List<dynamic>)) {
        final teamData = item['teams'] as Map<String, dynamic>?;
        if (teamData != null) {
          teams.add(Team.fromJson(teamData, role: item['role'] as String? ?? 'member'));
        }
      }
      return teams;
    } catch (e) {
      debugPrint('[SupabaseService] Error fetching user teams: $e');
      return [];
    }
  }

  // ==========================================
  // Tasks (My Tasks)
  // ==========================================

  Future<List<TaskItem>> fetchMyTasks({String? teamId}) async {
    if (currentUserId == null) return [];

    try {
      // 1. Fetch action items owned by the current user
      var query = client.from('action_items').select('''
        id,
        meeting_id,
        task_description,
        owner_id,
        deadline,
        created_at,
        users!owner_id(id, name, email),
        meetings!inner(
          id,
          title,
          team_id,
          teams!inner(
            id,
            name
          )
        ),
        tasks(
          id,
          action_item_id,
          status,
          reminder_sent_at,
          created_at
        )
      ''').eq('owner_id', currentUserId!);

      if (teamId != null && teamId.isNotEmpty) {
        query = query.eq('meetings.team_id', teamId);
      }

      final response = await query;
      final List<TaskItem> tasks = [];

      for (final item in (response as List<dynamic>)) {
        final tasksList = item['tasks'] as List<dynamic>? ?? [];
        if (tasksList.isEmpty) continue;

        final taskData = tasksList.first as Map<String, dynamic>;
        final meeting = item['meetings'] as Map<String, dynamic>? ?? {};
        final team = meeting['teams'] as Map<String, dynamic>? ?? {};
        final user = item['users'] as Map<String, dynamic>? ?? {};

        DateTime? deadline;
        if (item['deadline'] != null) {
          deadline = DateTime.tryParse(item['deadline'] as String);
        }

        tasks.add(
          TaskItem(
            id: taskData['id'] as String,
            actionItemId: item['id'] as String,
            status: taskData['status'] as String? ?? 'todo',
            reminderSentAt: taskData['reminder_sent_at'] != null
                ? DateTime.tryParse(taskData['reminder_sent_at'] as String)
                : null,
            createdAt: taskData['created_at'] != null
                ? DateTime.tryParse(taskData['created_at'] as String)
                : null,
            taskDescription: item['task_description'] as String? ?? '',
            ownerId: item['owner_id'] as String?,
            ownerName: user['name'] as String?,
            ownerEmail: user['email'] as String?,
            deadline: deadline,
            meetingId: meeting['id'] as String?,
            meetingTitle: meeting['title'] as String?,
            teamId: team['id'] as String?,
            teamName: team['name'] as String?,
          ),
        );
      }

      return tasks;
    } catch (e) {
      debugPrint('[SupabaseService] Error fetching tasks: $e');
      return [];
    }
  }

  Future<bool> updateTaskStatus(String taskId, String newStatus) async {
    try {
      await client.from('tasks').update({'status': newStatus}).eq('id', taskId);
      return true;
    } catch (e) {
      debugPrint('[SupabaseService] Error updating task status: $e');
      return false;
    }
  }

  Future<bool> createTask({
    required String taskDescription,
    required String teamId,
    String? meetingId,
    DateTime? deadline,
  }) async {
    if (currentUserId == null) return false;

    try {
      String activeMeetingId = meetingId ?? '';

      // Create fallback meeting if none provided
      if (activeMeetingId.isEmpty) {
        final meetingRes = await client.from('meetings').insert({
          'team_id': teamId,
          'title': 'Mobile Assigned Tasks',
          'meeting_date': DateTime.now().toIso8601String(),
          'status': 'processed',
        }).select().single();

        activeMeetingId = meetingRes['id'] as String;
      }

      // 1. Insert action item
      final actionItemRes = await client.from('action_items').insert({
        'meeting_id': activeMeetingId,
        'task_description': taskDescription,
        'owner_id': currentUserId,
        'deadline': deadline != null
            ? '${deadline.year.toString().padLeft(4, '0')}-${deadline.month.toString().padLeft(2, '0')}-${deadline.day.toString().padLeft(2, '0')}'
            : null,
      }).select().single();

      final actionItemId = actionItemRes['id'] as String;

      // 2. Insert linked task in 'todo' status
      await client.from('tasks').insert({
        'action_item_id': actionItemId,
        'status': 'todo',
      });

      return true;
    } catch (e) {
      debugPrint('[SupabaseService] Error creating task: $e');
      return false;
    }
  }

  // ==========================================
  // Meetings
  // ==========================================

  Future<List<Meeting>> fetchMeetings({String? teamId}) async {
    try {
      var query = client.from('meetings').select('''
        id,
        team_id,
        title,
        meeting_date,
        transcript_url,
        status,
        created_at,
        teams(id, name),
        transcripts(id, raw_text),
        action_items(id)
      ''');

      if (teamId != null && teamId.isNotEmpty) {
        query = query.eq('team_id', teamId);
      }

      final response = await query.order('meeting_date', ascending: false);
      return (response as List<dynamic>)
          .map((item) => Meeting.fromJson(item as Map<String, dynamic>))
          .toList();
    } catch (e) {
      debugPrint('[SupabaseService] Error fetching meetings: $e');
      return [];
    }
  }

  Future<Map<String, dynamic>?> fetchMeetingDetail(String meetingId) async {
    try {
      final meetingRes = await client.from('meetings').select('''
        id,
        team_id,
        title,
        meeting_date,
        transcript_url,
        status,
        created_at,
        teams(id, name),
        transcripts(id, raw_text, diarized_json),
        action_items(
          id,
          task_description,
          deadline,
          owner_id,
          users:owner_id(id, name, email),
          tasks(id, status)
        )
      ''').eq('id', meetingId).single();

      return meetingRes;
    } catch (e) {
      debugPrint('[SupabaseService] Error fetching meeting detail: $e');
      return null;
    }
  }
}
