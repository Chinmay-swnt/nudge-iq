class Team {
  final String id;
  final String name;
  final DateTime? createdAt;
  final String role; // 'owner' or 'member'

  Team({
    required this.id,
    required this.name,
    this.createdAt,
    this.role = 'member',
  });

  factory Team.fromJson(Map<String, dynamic> json, {String role = 'member'}) {
    return Team(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Unnamed Team',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      role: role,
    );
  }
}
