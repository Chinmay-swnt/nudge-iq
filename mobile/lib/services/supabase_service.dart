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
  String? get currentUserId => isDemoMode ? 'demo-user-123' : client.auth.currentUser?.id;

  bool _isDemoMode = false;
  bool get isDemoMode => _isDemoMode;

  final ValueNotifier<bool> authNotifier = ValueNotifier<bool>(false);

  // In-memory demo data store so users can interact with tasks/meetings seamlessly in Demo Mode
  final List<Team> _demoTeams = [
    Team(id: 'demo-team-1', name: '🚀 Engineering Core', role: 'owner', createdAt: DateTime.now().subtract(const Duration(days: 30))),
    Team(id: 'demo-team-2', name: '🎨 Product & Design', role: 'member', createdAt: DateTime.now().subtract(const Duration(days: 20))),
    Team(id: 'demo-team-3', name: '📢 Growth & Marketing', role: 'member', createdAt: DateTime.now().subtract(const Duration(days: 10))),
  ];

  late List<TaskItem> _demoTasks;
  late List<Meeting> _demoMeetings;

  void _initDemoDataIfNeeded() {
    final now = DateTime.now();
    _demoTasks = [
      TaskItem(
        id: 'task-1',
        actionItemId: 'action-1',
        status: 'in_progress',
        taskDescription: 'Finalize Q4 API architecture documentation and database schema',
        ownerId: 'demo-user-123',
        ownerName: 'Alex Demo',
        ownerEmail: 'alex.demo@nudgeiq.com',
        deadline: now.add(const Duration(days: 2)),
        meetingId: 'meet-1',
        meetingTitle: 'Sprint 24 Planning & Architecture Sync',
        teamId: 'demo-team-1',
        teamName: '🚀 Engineering Core',
        createdAt: now.subtract(const Duration(hours: 4)),
      ),
      TaskItem(
        id: 'task-2',
        actionItemId: 'action-2',
        status: 'todo',
        taskDescription: 'Deploy PostgreSQL database indexes and performance test',
        ownerId: 'demo-user-123',
        ownerName: 'Alex Demo',
        ownerEmail: 'alex.demo@nudgeiq.com',
        deadline: now.add(const Duration(days: 1)),
        meetingId: 'meet-1',
        meetingTitle: 'Sprint 24 Planning & Architecture Sync',
        teamId: 'demo-team-1',
        teamName: '🚀 Engineering Core',
        createdAt: now.subtract(const Duration(hours: 5)),
      ),
      TaskItem(
        id: 'task-3',
        actionItemId: 'action-3',
        status: 'done',
        taskDescription: 'Review Figma wireframes and mobile task detail specs',
        ownerId: 'demo-user-123',
        ownerName: 'Alex Demo',
        ownerEmail: 'alex.demo@nudgeiq.com',
        deadline: now.subtract(const Duration(days: 1)),
        meetingId: 'meet-2',
        meetingTitle: 'Product Roadmap & UX Design Alignment',
        teamId: 'demo-team-2',
        teamName: '🎨 Product & Design',
        createdAt: now.subtract(const Duration(days: 2)),
      ),
      TaskItem(
        id: 'task-4',
        actionItemId: 'action-4',
        status: 'todo',
        taskDescription: 'Submit weekly team summary metrics and release notes',
        ownerId: 'demo-user-123',
        ownerName: 'Alex Demo',
        ownerEmail: 'alex.demo@nudgeiq.com',
        deadline: now.subtract(const Duration(days: 2)), // Overdue
        meetingId: 'meet-3',
        meetingTitle: 'Weekly Engineering & Operations Standup',
        teamId: 'demo-team-1',
        teamName: '🚀 Engineering Core',
        createdAt: now.subtract(const Duration(days: 3)),
      ),
      TaskItem(
        id: 'task-5',
        actionItemId: 'action-5',
        status: 'in_progress',
        taskDescription: 'Prepare product launch email campaign & analytics tracking',
        ownerId: 'demo-user-123',
        ownerName: 'Alex Demo',
        ownerEmail: 'alex.demo@nudgeiq.com',
        deadline: now.add(const Duration(days: 5)),
        meetingId: 'meet-4',
        meetingTitle: 'Marketing Campaign Launch Sync',
        teamId: 'demo-team-3',
        teamName: '📢 Growth & Marketing',
        createdAt: now.subtract(const Duration(days: 1)),
      ),
    ];

    _demoMeetings = [
      Meeting(
        id: 'meet-1',
        teamId: 'demo-team-1',
        teamName: '🚀 Engineering Core',
        title: 'Sprint 24 Planning & Architecture Sync',
        meetingDate: now.subtract(const Duration(hours: 4)),
        status: 'processed',
        actionItemsCount: 3,
        rawTranscript: 'Sprint planning transcript ready',
      ),
      Meeting(
        id: 'meet-2',
        teamId: 'demo-team-2',
        teamName: '🎨 Product & Design',
        title: 'Product Roadmap & UX Design Alignment',
        meetingDate: now.subtract(const Duration(days: 2)),
        status: 'processed',
        actionItemsCount: 2,
        rawTranscript: 'Product design review transcript ready',
      ),
      Meeting(
        id: 'meet-3',
        teamId: 'demo-team-1',
        teamName: '🚀 Engineering Core',
        title: 'Weekly Engineering & Operations Standup',
        meetingDate: now.subtract(const Duration(days: 3)),
        status: 'processed',
        actionItemsCount: 2,
        rawTranscript: 'Weekly standup transcript ready',
      ),
      Meeting(
        id: 'meet-4',
        teamId: 'demo-team-3',
        teamName: '📢 Growth & Marketing',
        title: 'Marketing Campaign Launch Sync',
        meetingDate: now.subtract(const Duration(days: 5)),
        status: 'processed',
        actionItemsCount: 1,
        rawTranscript: 'Marketing campaign sync transcript ready',
      ),
    ];
  }

  // ==========================================
  // Auth Operations
  // ==========================================

  void enableDemoMode() {
    _isDemoMode = true;
    _initDemoDataIfNeeded();
    authNotifier.value = true;
  }

  Future<void> signInWithGoogle() async {
    _isDemoMode = false;
    await client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: kIsWeb ? null : 'io.supabase.nudgeiq://login-callback',
    );
  }

  Future<void> signOut() async {
    _isDemoMode = false;
    authNotifier.value = false;
    try {
      await client.auth.signOut();
    } catch (e) {
      debugPrint('[SupabaseService] Sign out error: $e');
    }
  }

  String get currentUserName {
    if (isDemoMode) return 'Alex Demo';
    final user = currentUser;
    return user?.userMetadata?['full_name'] as String? ??
        user?.userMetadata?['name'] as String? ??
        'Team Member';
  }

  String get currentUserEmail {
    if (isDemoMode) return 'alex.demo@nudgeiq.com';
    return currentUser?.email ?? 'No email associated';
  }

  // ==========================================
  // Teams
  // ==========================================

  Future<List<Team>> fetchUserTeams() async {
    if (isDemoMode) {
      return _demoTeams;
    }

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
    if (isDemoMode) {
      _initDemoDataIfNeeded();
      if (teamId != null && teamId.isNotEmpty) {
        return _demoTasks.where((t) => t.teamId == teamId).toList();
      }
      return List.from(_demoTasks);
    }

    if (currentUserId == null) return [];

    try {
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
    if (isDemoMode) {
      final index = _demoTasks.indexWhere((t) => t.id == taskId);
      if (index != -1) {
        final existing = _demoTasks[index];
        _demoTasks[index] = TaskItem(
          id: existing.id,
          actionItemId: existing.actionItemId,
          status: newStatus,
          taskDescription: existing.taskDescription,
          ownerId: existing.ownerId,
          ownerName: existing.ownerName,
          ownerEmail: existing.ownerEmail,
          deadline: existing.deadline,
          meetingId: existing.meetingId,
          meetingTitle: existing.meetingTitle,
          teamId: existing.teamId,
          teamName: existing.teamName,
          reminderSentAt: existing.reminderSentAt,
          createdAt: existing.createdAt,
        );
      }
      return true;
    }

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
    if (isDemoMode) {
      final team = _demoTeams.firstWhere(
        (t) => t.id == teamId,
        orElse: () => _demoTeams.first,
      );
      final newTask = TaskItem(
        id: 'demo-task-${DateTime.now().millisecondsSinceEpoch}',
        actionItemId: 'demo-action-${DateTime.now().millisecondsSinceEpoch}',
        status: 'todo',
        taskDescription: taskDescription,
        ownerId: 'demo-user-123',
        ownerName: 'Alex Demo',
        ownerEmail: 'alex.demo@nudgeiq.com',
        deadline: deadline,
        meetingId: meetingId ?? 'meet-manual',
        meetingTitle: 'Mobile Quick Task',
        teamId: team.id,
        teamName: team.name,
        createdAt: DateTime.now(),
      );
      _demoTasks.insert(0, newTask);
      return true;
    }

    if (currentUserId == null) return false;

    try {
      String activeMeetingId = meetingId ?? '';

      if (activeMeetingId.isEmpty) {
        final meetingRes = await client.from('meetings').insert({
          'team_id': teamId,
          'title': 'Mobile Assigned Tasks',
          'meeting_date': DateTime.now().toIso8601String(),
          'status': 'processed',
        }).select().single();

        activeMeetingId = meetingRes['id'] as String;
      }

      final actionItemRes = await client.from('action_items').insert({
        'meeting_id': activeMeetingId,
        'task_description': taskDescription,
        'owner_id': currentUserId,
        'deadline': deadline != null
            ? '${deadline.year.toString().padLeft(4, '0')}-${deadline.month.toString().padLeft(2, '0')}-${deadline.day.toString().padLeft(2, '0')}'
            : null,
      }).select().single();

      final actionItemId = actionItemRes['id'] as String;

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
    if (isDemoMode) {
      _initDemoDataIfNeeded();
      if (teamId != null && teamId.isNotEmpty) {
        return _demoMeetings.where((m) => m.teamId == teamId).toList();
      }
      return List.from(_demoMeetings);
    }

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
    if (isDemoMode) {
      return {
        'id': meetingId,
        'title': 'Sprint 24 Planning & Architecture Sync',
        'meeting_date': DateTime.now().subtract(const Duration(hours: 4)).toIso8601String(),
        'status': 'processed',
        'teams': {'id': 'demo-team-1', 'name': '🚀 Engineering Core'},
        'transcripts': [
          {
            'raw_text':
                'The team aligned on the upcoming sprint deliverables. Alex will finalize the Q4 API architecture and database schema by tomorrow. Jordan will deploy the PostgreSQL indexes and verify query execution times. We also agreed to schedule client demo sessions on Friday.',
            'diarized_json': [
              {
                'speaker': 'Alex (Lead)',
                'time': '00:00 - 00:25',
                'text': 'Welcome everyone. Today we need to lock down our Q4 database schemas and sprint timeline.'
              },
              {
                'speaker': 'Jordan (Backend)',
                'time': '00:26 - 00:55',
                'text': 'I will deploy the PostgreSQL indexes tomorrow morning and run load tests on the endpoints.'
              },
              {
                'speaker': 'Alex (Lead)',
                'time': '00:56 - 01:20',
                'text': 'Great. I will document the complete API architecture before Thursday standup.'
              }
            ]
          }
        ],
        'action_items': [
          {
            'id': 'action-1',
            'task_description': 'Finalize Q4 API architecture documentation and database schema',
            'deadline': DateTime.now().add(const Duration(days: 2)).toIso8601String().split('T')[0],
            'owner_id': 'demo-user-123',
            'users': {'name': 'Alex Demo', 'email': 'alex.demo@nudgeiq.com'},
            'tasks': [{'id': 'task-1', 'status': 'in_progress'}]
          },
          {
            'id': 'action-2',
            'task_description': 'Deploy PostgreSQL database indexes and performance test',
            'deadline': DateTime.now().add(const Duration(days: 1)).toIso8601String().split('T')[0],
            'owner_id': 'demo-user-123',
            'users': {'name': 'Jordan Tech', 'email': 'jordan@nudgeiq.com'},
            'tasks': [{'id': 'task-2', 'status': 'todo'}]
          }
        ]
      };
    }

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
