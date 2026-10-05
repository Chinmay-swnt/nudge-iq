class TaskItem {
  final String id;
  final String actionItemId;
  String status; // 'todo', 'in_progress', 'done', 'overdue'
  final DateTime? reminderSentAt;
  final DateTime? createdAt;
  
  // Joined Action Item Details
  final String taskDescription;
  final String? ownerId;
  final String? ownerName;
  final String? ownerEmail;
  final DateTime? deadline;
  final String? meetingId;
  final String? meetingTitle;
  final String? teamId;
  final String? teamName;

  TaskItem({
    required this.id,
    required this.actionItemId,
    required this.status,
    this.reminderSentAt,
    this.createdAt,
    required this.taskDescription,
    this.ownerId,
    this.ownerName,
    this.ownerEmail,
    this.deadline,
    this.meetingId,
    this.meetingTitle,
    this.teamId,
    this.teamName,
  });

  bool get isOverdue {
    if (deadline == null || status == 'done') return false;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return deadline!.isBefore(today);
  }

  factory TaskItem.fromJson(Map<String, dynamic> json) {
    final actionItem = json['action_items'] as Map<String, dynamic>? ?? {};
    final meeting = actionItem['meetings'] as Map<String, dynamic>? ?? {};
    final team = meeting['teams'] as Map<String, dynamic>? ?? {};
    final owner = actionItem['users'] as Map<String, dynamic>? ?? {};

    DateTime? parsedDeadline;
    if (actionItem['deadline'] != null) {
      parsedDeadline = DateTime.tryParse(actionItem['deadline'] as String);
    }

    return TaskItem(
      id: json['id'] as String,
      actionItemId: json['action_item_id'] as String? ?? actionItem['id'] as String? ?? '',
      status: json['status'] as String? ?? 'todo',
      reminderSentAt: json['reminder_sent_at'] != null
          ? DateTime.tryParse(json['reminder_sent_at'] as String)
          : null,
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      taskDescription: actionItem['task_description'] as String? ?? 'Untitled Task',
      ownerId: actionItem['owner_id'] as String?,
      ownerName: owner['name'] as String?,
      ownerEmail: owner['email'] as String?,
      deadline: parsedDeadline,
      meetingId: meeting['id'] as String?,
      meetingTitle: meeting['title'] as String?,
      teamId: team['id'] as String?,
      teamName: team['name'] as String?,
    );
  }
}
