import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/constants.dart';
import '../../models/task_item.dart';

class TaskDetailSheet extends StatefulWidget {
  final TaskItem task;
  final Function(String newStatus) onStatusChanged;

  const TaskDetailSheet({
    super.key,
    required this.task,
    required this.onStatusChanged,
  });

  @override
  State<TaskDetailSheet> createState() => _TaskDetailSheetState();
}

class _TaskDetailSheetState extends State<TaskDetailSheet> {
  late String _currentStatus;

  @override
  void initState() {
    super.initState();
    _currentStatus = widget.task.status;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        color: AppConstants.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppConstants.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  widget.task.teamName ?? 'Task',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppConstants.primary,
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Description
          Text(
            widget.task.taskDescription,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppConstants.textPrimary,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 20),

          // Meta Information
          if (widget.task.deadline != null) ...[
            _buildMetaRow(
              icon: Icons.calendar_today_outlined,
              label: 'Deadline',
              value: DateFormat('EEEE, MMMM d, y').format(widget.task.deadline!),
              valueColor: widget.task.isOverdue ? AppConstants.danger : AppConstants.textPrimary,
            ),
            const SizedBox(height: 12),
          ],

          if (widget.task.meetingTitle != null) ...[
            _buildMetaRow(
              icon: Icons.mic_none_outlined,
              label: 'Meeting',
              value: widget.task.meetingTitle!,
            ),
            const SizedBox(height: 12),
          ],

          const Divider(color: AppConstants.border, height: 32),

          const Text(
            'Update Status',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: AppConstants.textSecondary,
            ),
          ),
          const SizedBox(height: 12),

          // Status Options
          Row(
            children: [
              _buildStatusChip('todo', 'To Do'),
              const SizedBox(width: 8),
              _buildStatusChip('in_progress', 'In Progress'),
              const SizedBox(width: 8),
              _buildStatusChip('done', 'Done'),
              const SizedBox(width: 8),
              _buildStatusChip('overdue', 'Overdue'),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildMetaRow({
    required IconData icon,
    required String label,
    required String value,
    Color? valueColor,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppConstants.textSecondary),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 11, color: AppConstants.textMuted),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: valueColor ?? AppConstants.textPrimary,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildStatusChip(String statusKey, String label) {
    final isSelected = _currentStatus == statusKey;

    Color bg;
    Color fg;

    switch (statusKey) {
      case 'done':
        bg = isSelected ? AppConstants.success : AppConstants.success.withValues(alpha: 0.1);
        fg = isSelected ? Colors.white : AppConstants.success;
        break;
      case 'in_progress':
        bg = isSelected ? AppConstants.primary : AppConstants.primary.withValues(alpha: 0.1);
        fg = isSelected ? Colors.white : AppConstants.primary;
        break;
      case 'overdue':
        bg = isSelected ? AppConstants.danger : AppConstants.danger.withValues(alpha: 0.1);
        fg = isSelected ? Colors.white : AppConstants.danger;
        break;
      default:
        bg = isSelected ? AppConstants.darkBlock : AppConstants.background;
        fg = isSelected ? Colors.white : AppConstants.textSecondary;
    }

    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() => _currentStatus = statusKey);
          widget.onStatusChanged(statusKey);
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: isSelected ? Colors.transparent : AppConstants.border,
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ),
      ),
    );
  }
}
