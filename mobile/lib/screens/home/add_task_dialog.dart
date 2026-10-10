import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/constants.dart';
import '../../models/team.dart';
import '../../services/supabase_service.dart';

class AddTaskDialog extends StatefulWidget {
  final List<Team> teams;
  final String? initialTeamId;
  final VoidCallback onTaskCreated;

  const AddTaskDialog({
    super.key,
    required this.teams,
    this.initialTeamId,
    required this.onTaskCreated,
  });

  @override
  State<AddTaskDialog> createState() => _AddTaskDialogState();
}

class _AddTaskDialogState extends State<AddTaskDialog> {
  final _descriptionController = TextEditingController();
  late String _selectedTeamId;
  DateTime? _selectedDeadline;
  bool _isSaving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.initialTeamId != null && widget.initialTeamId!.isNotEmpty) {
      _selectedTeamId = widget.initialTeamId!;
    } else if (widget.teams.isNotEmpty) {
      _selectedTeamId = widget.teams.first.id;
    } else {
      _selectedTeamId = '';
    }
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _selectDeadline() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDeadline ?? now.add(const Duration(days: 2)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
      builder: (context, child) {
        return Theme(
          data: ThemeData.light().copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppConstants.primary,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      setState(() {
        _selectedDeadline = picked;
      });
    }
  }

  Future<void> _handleSave() async {
    final desc = _descriptionController.text.trim();
    if (desc.isEmpty) {
      setState(() => _error = 'Please enter a task description');
      return;
    }

    if (_selectedTeamId.isEmpty) {
      setState(() => _error = 'Please select a team workspace');
      return;
    }

    setState(() {
      _isSaving = true;
      _error = null;
    });

    final success = await SupabaseService().createTask(
      taskDescription: desc,
      teamId: _selectedTeamId,
      deadline: _selectedDeadline,
    );

    if (mounted) {
      setState(() => _isSaving = false);
      if (success) {
        widget.onTaskCreated();
        Navigator.pop(context);
      } else {
        setState(() => _error = 'Failed to create task. Please try again.');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
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
              const Text(
                'Add Personal Task',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: AppConstants.textPrimary,
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 16),

          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppConstants.danger.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _error!,
                style: const TextStyle(color: AppConstants.danger, fontSize: 12),
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Description Input
          TextField(
            controller: _descriptionController,
            maxLines: 3,
            autofocus: true,
            decoration: const InputDecoration(
              hintText: 'What needs to be done? (e.g. Prepare lecture slides by Friday)',
            ),
          ),
          const SizedBox(height: 16),

          // Team Selector
          if (widget.teams.isNotEmpty) ...[
            const Text(
              'Team Workspace',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: AppConstants.textSecondary,
              ),
            ),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: _selectedTeamId.isNotEmpty ? _selectedTeamId : widget.teams.first.id,
              items: widget.teams
                  .map(
                    (t) => DropdownMenuItem(
                      value: t.id,
                      child: Text(t.name, style: const TextStyle(fontSize: 14)),
                    ),
                  )
                  .toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() => _selectedTeamId = val);
                }
              },
            ),
            const SizedBox(height: 16),
          ],

          // Deadline Picker
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _selectDeadline,
                  icon: const Icon(Icons.calendar_today, size: 16, color: AppConstants.primary),
                  label: Text(
                    _selectedDeadline != null
                        ? DateFormat('EEE, MMM d').format(_selectedDeadline!)
                        : 'Set Deadline',
                    style: TextStyle(
                      color: _selectedDeadline != null
                          ? AppConstants.textPrimary
                          : AppConstants.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
              if (_selectedDeadline != null) ...[
                const SizedBox(width: 8),
                IconButton(
                  onPressed: () => setState(() => _selectedDeadline = null),
                  icon: const Icon(Icons.clear, size: 18, color: AppConstants.textMuted),
                ),
              ],
            ],
          ),
          const SizedBox(height: 24),

          // Create Button
          ElevatedButton(
            onPressed: _isSaving ? null : _handleSave,
            child: _isSaving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Add Task'),
          ),
        ],
      ),
    );
  }
}
