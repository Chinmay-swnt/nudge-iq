import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/constants.dart';
import '../../models/task_item.dart';
import '../../models/team.dart';
import '../../services/supabase_service.dart';
import 'add_task_dialog.dart';
import 'task_detail_sheet.dart';

class MyTasksScreen extends StatefulWidget {
  const MyTasksScreen({super.key});

  @override
  State<MyTasksScreen> createState() => _MyTasksScreenState();
}

class _MyTasksScreenState extends State<MyTasksScreen> {
  final _supabaseService = SupabaseService();
  
  List<Team> _teams = [];
  String? _selectedTeamId; // null = All Teams
  List<TaskItem> _tasks = [];
  bool _isLoading = true;
  String _selectedStatusFilter = 'all'; // 'all', 'todo', 'in_progress', 'done', 'overdue'

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    final teams = await _supabaseService.fetchUserTeams();
    final tasks = await _supabaseService.fetchMyTasks(teamId: _selectedTeamId);

    if (mounted) {
      setState(() {
        _teams = teams;
        _tasks = tasks;
        _isLoading = false;
      });
    }
  }

  Future<void> _updateStatus(TaskItem task, String newStatus) async {
    final success = await _supabaseService.updateTaskStatus(task.id, newStatus);
    if (success) {
      setState(() {
        task.status = newStatus;
      });
    }
  }

  List<TaskItem> get _filteredTasks {
    if (_selectedStatusFilter == 'all') return _tasks;
    if (_selectedStatusFilter == 'overdue') {
      return _tasks.where((t) => t.status == 'overdue' || t.isOverdue).toList();
    }
    return _tasks.where((t) => t.status == _selectedStatusFilter).toList();
  }

  int _countByStatus(String statusKey) {
    if (statusKey == 'all') return _tasks.length;
    if (statusKey == 'overdue') {
      return _tasks.where((t) => t.status == 'overdue' || t.isOverdue).length;
    }
    return _tasks.where((t) => t.status == statusKey).length;
  }

  void _openAddTaskDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => AddTaskDialog(
        teams: _teams,
        initialTeamId: _selectedTeamId,
        onTaskCreated: _loadData,
      ),
    );
  }

  void _openTaskDetail(TaskItem task) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => TaskDetailSheet(
        task: task,
        onStatusChanged: (newStatus) {
          _updateStatus(task, newStatus);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.background,
      appBar: AppBar(
        title: const Text('My Tasks'),
        actions: [
          // Team Switcher Dropdown
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
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openAddTaskDialog,
        backgroundColor: AppConstants.darkBlock,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add, size: 20),
        label: const Text('Add Task', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: Column(
        children: [
          // Status Filter Tabs
          _buildStatusTabs(),

          // Task List View
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _loadData,
                    child: _filteredTasks.isEmpty
                        ? _buildEmptyState()
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            itemCount: _filteredTasks.length,
                            separatorBuilder: (ctx, idx) => const SizedBox(height: 10),
                            itemBuilder: (ctx, idx) {
                              final task = _filteredTasks[idx];
                              return _buildTaskCard(task);
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusTabs() {
    final filters = [
      {'key': 'all', 'label': 'All'},
      {'key': 'todo', 'label': 'To Do'},
      {'key': 'in_progress', 'label': 'In Progress'},
      {'key': 'done', 'label': 'Done'},
      {'key': 'overdue', 'label': 'Overdue'},
    ];

    return Container(
      height: 48,
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: filters.length,
        separatorBuilder: (ctx, idx) => const SizedBox(width: 8),
        itemBuilder: (ctx, idx) {
          final filter = filters[idx];
          final key = filter['key']!;
          final label = filter['label']!;
          final isSelected = _selectedStatusFilter == key;
          final count = _countByStatus(key);

          return GestureDetector(
            onTap: () => setState(() => _selectedStatusFilter = key),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppConstants.darkBlock : AppConstants.surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected ? AppConstants.darkBlock : AppConstants.border,
                ),
              ),
              child: Row(
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.w600,
                      color: isSelected ? Colors.white : AppConstants.textSecondary,
                    ),
                  ),
                  if (count > 0) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? Colors.white.withValues(alpha: 0.2)
                            : AppConstants.background,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        count.toString(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: isSelected ? Colors.white : AppConstants.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTaskCard(TaskItem task) {
    final isDone = task.status == 'done';
    final isOverdue = task.isOverdue || task.status == 'overdue';

    return GestureDetector(
      onTap: () => _openTaskDetail(task),
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
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Checkbox / Status toggle
            GestureDetector(
              onTap: () {
                final nextStatus = isDone ? 'todo' : 'done';
                _updateStatus(task, nextStatus);
              },
              child: Container(
                margin: const EdgeInsets.only(top: 2, right: 12),
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isDone ? AppConstants.success : Colors.transparent,
                  border: Border.all(
                    color: isDone ? AppConstants.success : AppConstants.border,
                    width: 2,
                  ),
                ),
                child: isDone
                    ? const Icon(Icons.check, size: 14, color: Colors.white)
                    : null,
              ),
            ),

            // Content
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.taskDescription,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isDone ? AppConstants.textMuted : AppConstants.textPrimary,
                      decoration: isDone ? TextDecoration.lineThrough : null,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Metadata Badges (Team, Deadline)
                  Row(
                    children: [
                      if (task.teamName != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppConstants.background,
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: AppConstants.border),
                          ),
                          child: Text(
                            task.teamName!,
                            style: const TextStyle(fontSize: 10, color: AppConstants.textSecondary),
                          ),
                        ),
                        const SizedBox(width: 8),
                      ],

                      if (task.deadline != null) ...[
                        Icon(
                          Icons.schedule,
                          size: 13,
                          color: isOverdue ? AppConstants.danger : AppConstants.textMuted,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          DateFormat('MMM d').format(task.deadline!),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: isOverdue ? FontWeight.bold : FontWeight.normal,
                            color: isOverdue ? AppConstants.danger : AppConstants.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),

            // More Arrow
            const Icon(Icons.chevron_right, size: 20, color: AppConstants.textMuted),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: AppConstants.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check_circle_outline, size: 28, color: AppConstants.primary),
            ),
            const SizedBox(height: 16),
            const Text(
              'No tasks in this view',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppConstants.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'You have completed all items or no tasks have been assigned yet.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppConstants.textSecondary),
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _openAddTaskDialog,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Add Task'),
            ),
          ],
        ),
      ),
    );
  }
}
