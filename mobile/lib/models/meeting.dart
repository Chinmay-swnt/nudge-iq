class Meeting {
  final String id;
  final String teamId;
  final String title;
  final DateTime meetingDate;
  final String? transcriptUrl;
  final String status; // 'pending', 'processed'
  final DateTime? createdAt;
  final String? teamName;
  final String? rawTranscript;
  final int actionItemsCount;

  Meeting({
    required this.id,
    required this.teamId,
    required this.title,
    required this.meetingDate,
    this.transcriptUrl,
    this.status = 'pending',
    this.createdAt,
    this.teamName,
    this.rawTranscript,
    this.actionItemsCount = 0,
  });

  bool get isProcessed => status == 'processed';
  bool get hasTranscript => rawTranscript != null || (transcriptUrl != null && transcriptUrl!.isNotEmpty);

  factory Meeting.fromJson(Map<String, dynamic> json) {
    final team = json['teams'] as Map<String, dynamic>? ?? {};
    final transcripts = json['transcripts'] as List<dynamic>? ?? [];
    final actionItems = json['action_items'] as List<dynamic>? ?? [];

    String? transcriptText;
    if (transcripts.isNotEmpty && transcripts.first is Map<String, dynamic>) {
      transcriptText = transcripts.first['raw_text'] as String?;
    }

    return Meeting(
      id: json['id'] as String,
      teamId: json['team_id'] as String,
      title: json['title'] as String? ?? 'Untitled Meeting',
      meetingDate: DateTime.tryParse(json['meeting_date'] as String) ?? DateTime.now(),
      transcriptUrl: json['transcript_url'] as String?,
      status: json['status'] as String? ?? 'pending',
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'] as String)
          : null,
      teamName: team['name'] as String?,
      rawTranscript: transcriptText,
      actionItemsCount: actionItems.length,
    );
  }
}
